// Browser client for /api/weflipi. The player identity (id + secret token) lives in localStorage;
// every call degrades to `null` / an error code so the games stay playable offline.
import type { GameId } from '../../server/weflipi-games.mjs'

export type Look = { name: string; avatar: string; color: string }
export type Me = Look & { id: string }
export type Stats = { streak: number; bestStreak: number; total: number; playedToday: boolean }
export type GroupSummary = { code: string; name: string; members: number }
export type State = { day: string; game: GameId; msLeft: number; me: Me | null; groups: GroupSummary[]; best: number | null; plays: number; stats: Stats | null }
export type RankRow = Look & { id: string; score: number; place: number; points: number }
export type SeasonRow = Look & { id: string; points: number; wins: number; played: number }
export type SeasonDay = { day: string; game: GameId; ranking: { id: string; place: number; points: number }[] }
export type Global = { day: string; game: GameId; total: number; ranking: (Look & { id: string; score: number; place: number })[]; me: { place: number; score: number } | null }
export type Group = {
  code: string
  name: string
  owner: string
  day: string
  game: GameId
  members: (Look & { id: string; playsToday: number })[]
  today: RankRow[]
  yesterday: { day: string; game: GameId; ranking: RankRow[] }
  season: { from: string; to: string; table: SeasonRow[]; days: SeasonDay[] }
  lastSeason: { from: string; table: SeasonRow[] }
}
export type ScoreResult = { day: string; game: GameId; score: number; best: number; plays: number; streak: number }
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; detail?: string }

const KEY = 'weflipi.player'
type Saved = { id: string; token: string; name: string; avatar?: string; color?: string }

export function savedPlayer(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return raw && typeof raw.id === 'string' && typeof raw.token === 'string' ? raw : null
  } catch {
    return null
  }
}

function savePlayer(p: Saved | null): void {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: identity lasts for this tab only */
  }
}

/** Name chosen before the server was reachable; registered on the next successful call. */
const PENDING = 'weflipi.pendingName'
export function pendingName(): string {
  try {
    return localStorage.getItem(PENDING) ?? ''
  } catch {
    return ''
  }
}

async function call<T>(method: 'GET' | 'POST', action: string, body?: object, query: Record<string, string> = {}): Promise<Result<T>> {
  const p = savedPlayer()
  const qs = new URLSearchParams({ a: action, ...query })
  try {
    const res = await fetch(`./api/weflipi?${qs}`, {
      method,
      headers: { ...(p ? { authorization: `Bearer ${p.id}.${p.token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({ error: 'offline' }))
    if (!res.ok) {
      if (res.status === 401) savePlayer(null)
      return { ok: false, error: data.error ?? 'offline', detail: typeof data.detail === 'string' ? data.detail : undefined }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

export async function register(name: string): Promise<Result<Me>> {
  const r = await call<Saved>('POST', 'register', { name })
  if (!r.ok) {
    try {
      localStorage.setItem(PENDING, name)
    } catch {
      /* ignore */
    }
    return r
  }
  savePlayer(r.data)
  try {
    localStorage.removeItem(PENDING)
  } catch {
    /* ignore */
  }
  return { ok: true, data: { id: r.data.id, name: r.data.name, avatar: r.data.avatar ?? '😎', color: r.data.color ?? '#ffd35c' } }
}

export const getState = () => call<State>('GET', 'state')
export const getGroup = (code: string) => call<Group>('GET', 'group', undefined, { code })
export const createGroup = (name: string) => call<{ code: string; name: string }>('POST', 'createGroup', { name })
export const joinGroup = (code: string) => call<{ code: string; name: string }>('POST', 'joinGroup', { code })
export const leaveGroup = (code: string) => call<{ ok: true }>('POST', 'leaveGroup', { code })
export const submitScore = (game: GameId, score: number) => call<ScoreResult>('POST', 'score', { game, score })
export const getGlobal = () => call<Global>('GET', 'global')

export type RetoPlayer = Look & { id: string; score: number | null; place: number | null; tries: number }
export type Reto = { code: string; game: GameId; seed: number; owner: string; created: number; maxTries: number; myTries: number; players: RetoPlayer[] }
export const createReto = (game: GameId) => call<Reto>('POST', 'retoCreate', { game })
export const getReto = (code: string) => call<Reto>('GET', 'reto', undefined, { code })
export const startReto = (code: string) => call<{ tries: number; maxTries: number }>('POST', 'retoStart', { code })
export const retoScore = (code: string, score: number) => call<Reto>('POST', 'retoScore', { code, score })
export const myRetos = () => call<{ retos: Reto[] }>('GET', 'retos')

export type DuelRoom = { code: string; game: string; host: Look; offer?: string; answer?: string | null; taken?: boolean }
export const createDuel = (game: string, offer: string) => call<{ code: string }>('POST', 'duelCreate', { game, offer })
export const getDuel = (code: string) => call<DuelRoom>('GET', 'duel', undefined, { code })
export const answerDuel = (code: string, answer: string) => call<{ ok: true }>('POST', 'duelAnswer', { code, answer })

export async function updateProfile(change: Partial<Look>): Promise<Result<Look>> {
  const r = await call<Look>('POST', 'profile', change)
  const p = savedPlayer()
  if (r.ok && p) savePlayer({ ...p, ...r.data })
  return r
}

/** Local best per day+game, so offline runs and the hub card still show progress. */
export function localBest(day: string, game: GameId, score: number | null, better: (a: number, b: number) => boolean): number | null {
  const key = `weflipi.best.${day}.${game}`
  try {
    const old = localStorage.getItem(key)
    const prev = old === null ? null : Number(old)
    if (score === null) return prev
    const best = prev === null || better(score, prev) ? score : prev
    localStorage.setItem(key, String(best))
    return best
  } catch {
    return score
  }
}

export const ERRORS: Record<string, string> = {
  offline: 'No hay conexión con el servidor.',
  no_database: 'El servidor aún no tiene base de datos conectada.',
  database_error: 'La base de datos no responde bien.',
  bad_name: 'Ese nombre no vale.',
  bad_code: 'Ese código no es válido (son 6 letras o números).',
  no_group: 'No existe ningún grupo con ese código.',
  group_full: 'Ese grupo está lleno.',
  too_many_groups: 'Ya estás en el máximo de grupos.',
  not_member: 'No eres miembro de ese grupo.',
  not_today: 'Ese juego ya no es el de hoy.',
  bad_score: 'Puntuación no válida.',
  bad_avatar: 'Ese avatar no existe.',
  bad_color: 'Ese color no existe.',
  slow_down: 'Demasiados intentos, espera un poco.',
  unauthorized: 'Tu sesión ha caducado. Vuelve a poner tu nombre.',
  bad_game: 'Ese juego no existe.',
  no_reto: 'Ese reto no existe o ya ha caducado.',
  no_tries: 'Ya has gastado tus intentos en este reto.',
  no_duel: 'Esa partida ya no existe. Pídele a tu amigo un código nuevo.',
  duel_taken: 'Alguien ya se ha unido a esa partida.',
  own_duel: 'Esa partida la has creado tú: pásale el código a tu amigo.',
  bad_sdp: 'No se ha podido preparar la conexión.',
  no_connect: 'No se han podido conectar los dos móviles. Probad en la misma wifi o con datos.',
}
export const errorText = (code: string) => ERRORS[code] ?? 'Algo ha fallado. Inténtalo otra vez.'
