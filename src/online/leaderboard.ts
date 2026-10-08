import { BOARD_ID, RULES_VERSION } from '../../server/helix-rules.mjs'

export type Placement = { rank: number; total: number; percentile: number }
export type Receipt = { accepted: boolean; personalBest?: boolean; dailyBest?: boolean; all: Placement; today: Placement | null }
export type BoardEntry = { playerId: string; displayName: string; score: number; rank: number }
export type BoardData = { period: 'today' | 'all'; day: string; total: number; entries: BoardEntry[]; myRank: { rank: number; score: number } | null }
export type SubmitResult = { ok: true; receipt: Receipt } | { ok: false; reason: 'offline' | 'rejected' | 'stale' | 'expired' }

const TOKEN_KEY = 'helixdrop.lb.token'
const PLAYER_KEY = 'helixdrop.lb.player'

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

/**
 * Same-origin leaderboard client. Paths are relative to the page so Preview path prefixes and the
 * published domain both work; nothing here holds a server credential.
 */
export class Leaderboard {
  private readonly base = new URL(`api/leaderboards/v1/`, document.baseURI)
  token: string | null = read(TOKEN_KEY)
  playerId: string | null = read(PLAYER_KEY)
  /** null = not probed yet. */
  available: boolean | null = null
  serverDay: string | null = null

  private async call<T>(method: string, path: string, body?: unknown, auth = false, timeoutMs = 7000): Promise<T> {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const headers: Record<string, string> = {}
      if (body !== undefined) headers['content-type'] = 'application/json'
      if (auth && this.token) headers.authorization = `Bearer ${this.token}`
      const res = await fetch(new URL(path, this.base), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal, cache: 'no-store' })
      const type = res.headers.get('content-type') ?? ''
      if (!type.includes('application/json')) throw new HttpError(res.status || 503, 'not_json')
      const data = (await res.json()) as T & { error?: string }
      if (!res.ok) throw new HttpError(res.status, (data as { error?: string }).error ?? 'error')
      return data
    } finally {
      window.clearTimeout(timer)
    }
  }

  /** Check reachability and learn the server's "today". Never throws. */
  async probe(): Promise<boolean> {
    try {
      const data = await this.call<BoardData>('GET', `boards/${BOARD_ID}?period=today&limit=5`, undefined, true, 5000)
      this.available = true
      this.serverDay = data.day
      return true
    } catch {
      this.available = false
      return false
    }
  }

  async board(period: 'today' | 'all', limit = 50): Promise<BoardData> {
    const data = await this.call<BoardData>('GET', `boards/${BOARD_ID}?period=${period}&limit=${limit}`, undefined, true)
    this.available = true
    if (period === 'today') this.serverDay = data.day
    return data
  }

  private async ensureGuest(name: string): Promise<void> {
    if (this.token) return
    const g = await this.call<{ token: string; playerId: string }>('POST', 'guests', { displayName: name })
    this.token = g.token
    this.playerId = g.playerId
    write(TOKEN_KEY, g.token)
    write(PLAYER_KEY, g.playerId)
  }

  private forget(): void {
    this.token = null
    this.playerId = null
    write(TOKEN_KEY, null)
    write(PLAYER_KEY, null)
  }

  /** Reserve a ranked run for today's tower. Returns null when offline or refused. */
  async startRun(name: string, seedDay: string): Promise<string | null> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.ensureGuest(name)
        const run = await this.call<{ runId: string }>('POST', `boards/${BOARD_ID}/runs`, { protocolVersion: 1, rulesVersion: RULES_VERSION, mode: 'daily', seedDay }, true)
        this.available = true
        return run.runId
      } catch (e) {
        if (e instanceof HttpError && e.status === 401 && attempt === 0) {
          this.forget()
          continue
        }
        if (!(e instanceof HttpError) || e.status >= 500) this.available = false
        return null
      }
    }
    return null
  }

  async submit(runId: string, run: { score: number; durationMs: number; floors: number }): Promise<SubmitResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const receipt = await this.call<Receipt>('PUT', `runs/${runId}`, run, true)
        return { ok: true, receipt }
      } catch (e) {
        if (e instanceof HttpError) {
          if (e.status === 422 || e.status === 400 || e.status === 409) return { ok: false, reason: e.code === 'daily_seed_stale' ? 'stale' : 'rejected' }
          if (e.status === 410 || e.status === 404) return { ok: false, reason: 'expired' }
          if (e.status < 500 && e.status !== 429) return { ok: false, reason: 'rejected' }
        }
        // Transient: retry the identical submission (the server treats it idempotently).
        await new Promise(r => window.setTimeout(r, 600 * (attempt + 1)))
      }
    }
    this.available = false
    return { ok: false, reason: 'offline' }
  }

  async rename(name: string): Promise<boolean> {
    try {
      if (!this.token) {
        await this.ensureGuest(name)
        return true
      }
      await this.call('PUT', 'players/me', { displayName: name }, true)
      return true
    } catch {
      return false
    }
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the session still works with in-memory identity.
  }
}

/** Keep only characters the server accepts (≤16, no control chars or angle brackets). */
export function cleanName(raw: string): string {
  return [...raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim()].slice(0, 16).join('')
}
