// weflipi API: guest players, friend groups with invite codes, daily best scores and weekly seasons.
// Storage is Redis: Upstash over REST, any other Redis over TCP (REDIS_URL), or an in-memory
// stand-in for local dev and tests.
// `handle` is framework-free so the Vercel function and the Vite dev middleware share it.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { AVATARS, COLORS, defaultLook, gameById, gameOfDay, msUntilNextDay, rankDay, seasonDays, seasonTable, shiftDay, today, validScore } from './weflipi-games.mjs'

export const MAX_GROUPS_PER_PLAYER = 10
export const MAX_MEMBERS = 50
const DAY_TTL = 60 * 86_400
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const codePattern = /^[A-Z2-9]{6}$/
/** Challenges between friends ("retos"): same game, same seed, a few tries each. */
export const RETO_TRIES = 3
const RETO_TTL = 14 * 86_400
const MY_RETOS = 12
/** Real-time 1 vs 1 rooms only live while two phones find each other. */
export const DUEL_GAMES = ['hockey', 'futbolin', 'pong', 'penaltis']
const DUEL_TTL = 15 * 60
const MAX_SDP = 12_000

// ─── Stores ─────────────────────────────────────────────────────────────

/** Upstash Redis over REST: one HTTP round trip per pipeline. */
export function upstashStore(url, token) {
  return {
    async exec(commands) {
      const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(commands.map(cmd => cmd.map(String))),
      })
      if (!res.ok) throw Object.assign(new Error(`upstash HTTP ${res.status}`), { status: 503, store: true })
      const out = await res.json()
      return out.map(r => {
        if (r.error) throw Object.assign(new Error(r.error), { status: 503, store: true })
        return r.result
      })
    },
  }
}

/** Any Redis server over TCP (e.g. Redis Cloud from the Vercel Marketplace). One connection per instance. */
export function redisStore(url) {
  let client = null
  const connect = async () => {
    if (client?.isReady) return client
    const { createClient } = await import('redis')
    const c = createClient({ url, socket: { connectTimeout: 5000, reconnectStrategy: false } })
    c.on('error', () => undefined)
    try {
      await c.connect()
    } catch (error) {
      throw Object.assign(new Error(`redis connect: ${error.message}`), { status: 503, store: true })
    }
    client = c
    return c
  }
  return {
    async exec(commands) {
      const c = await connect()
      try {
        return await Promise.all(commands.map(cmd => c.sendCommand(cmd.map(String))))
      } catch (error) {
        throw Object.assign(new Error(`redis: ${error.message}`), { status: 503, store: true })
      }
    },
  }
}

/** Just enough Redis for weflipi, kept in memory. Replies mimic Upstash (numbers come back as strings where Redis does). */
export function memoryStore() {
  const data = new Map()
  const get = (key, make) => {
    if (!data.has(key)) data.set(key, make())
    return data.get(key)
  }
  const ops = {
    HSET: (k, ...kv) => {
      const h = get(k, () => new Map())
      let added = 0
      for (let i = 0; i < kv.length; i += 2) {
        if (!h.has(kv[i])) added += 1
        h.set(kv[i], String(kv[i + 1]))
      }
      return added
    },
    HSETNX: (k, f, v) => {
      const h = get(k, () => new Map())
      if (h.has(f)) return 0
      h.set(f, String(v))
      return 1
    },
    HGET: (k, f) => data.get(k)?.get(f) ?? null,
    HMGET: (k, ...fs) => fs.map(f => data.get(k)?.get(f) ?? null),
    HGETALL: k => [...(data.get(k) ?? new Map())].flat(),
    HINCRBY: (k, f, n) => {
      const h = get(k, () => new Map())
      const v = Number(h.get(f) ?? 0) + Number(n)
      h.set(f, String(v))
      return v
    },
    SADD: (k, ...ms) => ms.filter(m => !get(k, () => new Set()).has(m) && get(k, () => new Set()).add(m)).length,
    SREM: (k, ...ms) => ms.filter(m => data.get(k)?.delete(m)).length,
    SMEMBERS: k => [...(data.get(k) ?? [])],
    SCARD: k => data.get(k)?.size ?? 0,
    SISMEMBER: (k, m) => (data.get(k)?.has(m) ? 1 : 0),
    ZADD: (k, ...args) => {
      const z = get(k, () => new Map())
      const flags = []
      while (/^(GT|LT|NX|XX|CH)$/.test(args[0])) flags.push(args.shift())
      let changed = 0
      for (let i = 0; i < args.length; i += 2) {
        const score = Number(args[i])
        const m = args[i + 1]
        const old = z.get(m)
        if (old !== undefined && flags.includes('NX')) continue
        if (old !== undefined && ((flags.includes('GT') && score <= old) || (flags.includes('LT') && score >= old))) continue
        if (old === score) continue
        z.set(m, score)
        changed += 1
      }
      return changed
    },
    ZCARD: k => data.get(k)?.size ?? 0,
    ZRANGE: (k, start, stop, ...flags) => {
      const rev = flags.includes('REV')
      const sorted = [...(data.get(k) ?? new Map())].sort((x, y) => (rev ? y[1] - x[1] : x[1] - y[1]) || (rev ? (y[0] > x[0] ? 1 : -1) : x[0] > y[0] ? 1 : -1))
      const end = Number(stop) < 0 ? sorted.length + Number(stop) : Number(stop)
      const slice = sorted.slice(Number(start), end + 1)
      return flags.includes('WITHSCORES') ? slice.flatMap(([m, sc]) => [m, String(sc)]) : slice.map(([m]) => m)
    },
    ZRANK: (k, m) => {
      const r = ops.ZRANGE(k, 0, -1).indexOf(m)
      return r < 0 ? null : r
    },
    ZREVRANK: (k, m) => {
      const r = ops.ZRANGE(k, 0, -1, 'REV').indexOf(m)
      return r < 0 ? null : r
    },
    ZSCORE: (k, m) => (data.get(k)?.has(m) ? String(data.get(k).get(m)) : null),
    ZMSCORE: (k, ...ms) => ms.map(m => (data.get(k)?.has(m) ? String(data.get(k).get(m)) : null)),
    EXPIRE: () => 1,
    INCR: k => {
      const v = Number(data.get(k) ?? 0) + 1
      data.set(k, v)
      return v
    },
  }
  return {
    async exec(commands) {
      return commands.map(([cmd, ...args]) => {
        const op = ops[cmd]
        if (!op) throw new Error(`memoryStore: unsupported ${cmd}`)
        return op(...args.map(String))
      })
    },
  }
}

/**
 * Finds Upstash credentials whatever the integration called them: KV_REST_API_* (Vercel
 * Marketplace), UPSTASH_REDIS_REST_* (manual setup), either with a custom prefix such as
 * STORAGE_KV_REST_API_URL, or only a rediss:// URL pointing at an Upstash host.
 */
export function upstashCredentials(env = process.env) {
  const keys = Object.keys(env).sort((a, b) => a.length - b.length)
  for (const [urlSuffix, tokenSuffix] of [['KV_REST_API_URL', 'KV_REST_API_TOKEN'], ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']]) {
    for (const key of keys) {
      if (!key.endsWith(urlSuffix) || !env[key]) continue
      const token = env[key.slice(0, -urlSuffix.length) + tokenSuffix]
      if (token) return { url: env[key], token }
    }
  }
  for (const key of keys) {
    if (!/(^|_)(KV_URL|REDIS_URL)$/.test(key) || !env[key]) continue
    try {
      const u = new URL(env[key])
      // Upstash serves REST on the same host, authenticated with the Redis password.
      if (u.hostname.endsWith('.upstash.io') && u.password) return { url: `https://${u.hostname}`, token: decodeURIComponent(u.password) }
    } catch {
      /* not a URL */
    }
  }
  return null
}

/** A redis:// or rediss:// URL for a non-Upstash server, from REDIS_URL / KV_URL (any prefix). */
export function redisUrl(env = process.env) {
  for (const key of Object.keys(env).sort((a, b) => a.length - b.length)) {
    if (/(^|_)(KV_URL|REDIS_URL)$/.test(key) && /^rediss?:\/\//.test(env[key] ?? '')) return env[key]
  }
  return null
}

export function storeFromEnv(env = process.env) {
  const creds = upstashCredentials(env)
  if (creds) return upstashStore(creds.url, creds.token)
  const url = redisUrl(env)
  return url ? redisStore(url) : null
}

/** Names (never values) of env vars that look database-related, to debug a missing connection. */
export function databaseEnvNames(env = process.env) {
  return Object.keys(env).filter(k => /KV|REDIS|UPSTASH/i.test(k)).sort()
}

// ─── Helpers ────────────────────────────────────────────────────────────

const fail = (status, error) => {
  throw Object.assign(new Error(error), { status, code: error })
}
const sha = s => createHash('sha256').update(s).digest('hex')
const num = v => (v === null || v === undefined ? null : Number(v))
const hash = flat => {
  const out = {}
  for (let i = 0; i < (flat?.length ?? 0); i += 2) out[flat[i]] = flat[i + 1]
  return out
}

export function cleanName(raw, max = 16) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function newCode() {
  const bytes = randomBytes(6)
  return [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

async function identity(store, auth, required = true) {
  const m = /^Bearer ([0-9a-f-]{36})\.([0-9a-f]{48})$/.exec(auth ?? '')
  if (!m) return required ? fail(401, 'unauthorized') : null
  const [[tok, name, avatar, color]] = await store.exec([['HMGET', `wf:p:${m[1]}`, 'tok', 'name', 'avatar', 'color']])
  if (!tok || tok !== sha(m[2])) return required ? fail(401, 'unauthorized') : null
  return { id: m[1], ...look(m[1], name, avatar, color) }
}

/** Public face of a player: name, avatar and colour (defaults derived from the id). */
function look(id, name, avatar, color) {
  const d = defaultLook(id)
  return { name: name ?? '?', avatar: AVATARS.includes(avatar) ? avatar : d.avatar, color: COLORS.includes(color) ? color : d.color }
}

async function people(store, ids) {
  if (!ids.length) return {}
  const out = await store.exec(ids.map(id => ['HMGET', `wf:p:${id}`, 'name', 'avatar', 'color']))
  return Object.fromEntries(ids.map((id, i) => [id, look(id, ...(out[i] ?? []))]))
}

async function dayScores(store, days, members) {
  const out = await store.exec(days.map(day => ['ZMSCORE', `wf:d:${day}`, ...members]))
  return days.map((day, i) => ({
    day,
    scores: members.map((id, j) => ({ id, score: num(out[i][j]) })).filter(s => s.score !== null),
  }))
}

// ─── Actions ────────────────────────────────────────────────────────────

async function state(store, auth, now) {
  const day = today(now)
  const base = { day, game: gameOfDay(day).id, msLeft: msUntilNextDay(now) }
  const me = await identity(store, auth, false)
  if (!me) return { ...base, me: null, groups: [], best: null, plays: 0, stats: null }
  const [codes, best, plays, [lastDay, streak, bestStreak, total]] = await store.exec([
    ['SMEMBERS', `wf:p:${me.id}:g`],
    ['ZSCORE', `wf:d:${day}`, me.id],
    ['HGET', `wf:d:${day}:n`, me.id],
    ['HMGET', `wf:p:${me.id}`, 'lastDay', 'streak', 'bestStreak', 'total'],
  ])
  // A streak survives until the end of the day after the last day played.
  const alive = lastDay === day || lastDay === shiftDay(day, -1)
  const stats = { streak: alive ? Number(streak ?? 0) : 0, bestStreak: Number(bestStreak ?? 0), total: Number(total ?? 0), playedToday: lastDay === day }
  const info = codes.length ? await store.exec(codes.flatMap(c => [['HGET', `wf:g:${c}`, 'name'], ['SCARD', `wf:g:${c}:m`]])) : []
  const groups = codes.map((code, i) => ({ code, name: info[i * 2] ?? code, members: Number(info[i * 2 + 1]) })).sort((a, b) => a.name.localeCompare(b.name))
  return { ...base, me, groups, best: num(best), plays: Number(plays ?? 0), stats }
}

async function register(store, body, ip) {
  const name = cleanName(body.name)
  if (!name) fail(400, 'bad_name')
  const [hits] = await store.exec([['INCR', `wf:rl:reg:${sha(ip ?? '')}:${Math.floor(Date.now() / 3_600_000)}`]])
  await store.exec([['EXPIRE', `wf:rl:reg:${sha(ip ?? '')}:${Math.floor(Date.now() / 3_600_000)}`, 7200]])
  if (hits > 30) fail(429, 'slow_down')
  const id = randomUUID()
  const token = randomBytes(24).toString('hex')
  await store.exec([['HSET', `wf:p:${id}`, 'name', name, 'tok', sha(token), 'created', Date.now()]])
  return { id, token, ...look(id, name) }
}

/** Update any of name / avatar / colour. */
async function profile(store, me, body) {
  const fields = []
  if (body.name !== undefined) {
    const name = cleanName(body.name)
    if (!name) fail(400, 'bad_name')
    fields.push('name', name)
  }
  if (body.avatar !== undefined) {
    if (!AVATARS.includes(body.avatar)) fail(400, 'bad_avatar')
    fields.push('avatar', body.avatar)
  }
  if (body.color !== undefined) {
    if (!COLORS.includes(body.color)) fail(400, 'bad_color')
    fields.push('color', body.color)
  }
  if (fields.length) await store.exec([['HSET', `wf:p:${me.id}`, ...fields]])
  const [[name, avatar, color]] = await store.exec([['HMGET', `wf:p:${me.id}`, 'name', 'avatar', 'color']])
  return look(me.id, name, avatar, color)
}

async function createGroup(store, me, body) {
  const name = cleanName(body.name, 24)
  if (!name) fail(400, 'bad_name')
  const [count] = await store.exec([['SCARD', `wf:p:${me.id}:g`]])
  if (count >= MAX_GROUPS_PER_PLAYER) fail(409, 'too_many_groups')
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = newCode()
    const [fresh] = await store.exec([['HSETNX', `wf:g:${code}`, 'name', name]])
    if (!fresh) continue
    await store.exec([
      ['HSET', `wf:g:${code}`, 'owner', me.id, 'created', Date.now()],
      ['SADD', `wf:g:${code}:m`, me.id],
      ['SADD', `wf:p:${me.id}:g`, code],
    ])
    return { code, name }
  }
  return fail(503, 'busy')
}

function readCode(raw) {
  const code = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!codePattern.test(code)) fail(400, 'bad_code')
  return code
}

async function joinGroup(store, me, body) {
  const code = readCode(body.code)
  const [name, members, mine] = await store.exec([['HGET', `wf:g:${code}`, 'name'], ['SCARD', `wf:g:${code}:m`], ['SCARD', `wf:p:${me.id}:g`]])
  if (!name) fail(404, 'no_group')
  const [already] = await store.exec([['SISMEMBER', `wf:g:${code}:m`, me.id]])
  if (!already) {
    if (members >= MAX_MEMBERS) fail(409, 'group_full')
    if (mine >= MAX_GROUPS_PER_PLAYER) fail(409, 'too_many_groups')
    await store.exec([['SADD', `wf:g:${code}:m`, me.id], ['SADD', `wf:p:${me.id}:g`, code]])
  }
  return { code, name }
}

async function leaveGroup(store, me, body) {
  const code = readCode(body.code)
  await store.exec([['SREM', `wf:g:${code}:m`, me.id], ['SREM', `wf:p:${me.id}:g`, code]])
  return { ok: true }
}

async function submitScore(store, me, body, now) {
  const day = today(now)
  const game = gameOfDay(day)
  if (body.game !== game.id) fail(409, 'not_today')
  const score = Number(body.score)
  if (!validScore(game.id, score)) fail(400, 'bad_score')
  const key = `wf:d:${day}`
  const [, plays, best, , , , [lastDay, oldStreak, bestStreak]] = await store.exec([
    ['ZADD', key, game.dir === 'asc' ? 'LT' : 'GT', score, me.id],
    ['HINCRBY', `${key}:n`, me.id, 1],
    ['ZSCORE', key, me.id],
    ['EXPIRE', key, DAY_TTL],
    ['EXPIRE', `${key}:n`, DAY_TTL],
    ['HINCRBY', `wf:p:${me.id}`, 'total', 1],
    ['HMGET', `wf:p:${me.id}`, 'lastDay', 'streak', 'bestStreak'],
  ])
  let streak = Number(oldStreak ?? 0)
  if (lastDay !== day) {
    streak = lastDay === shiftDay(day, -1) ? streak + 1 : 1
    await store.exec([['HSET', `wf:p:${me.id}`, 'lastDay', day, 'streak', streak, 'bestStreak', Math.max(streak, Number(bestStreak ?? 0))]])
  }
  return { day, game: game.id, score, best: num(best), plays: Number(plays), streak }
}

/** Everyone's best today, worldwide: top `limit` plus the caller's own place. */
async function global(store, me, now) {
  const day = today(now)
  const game = gameOfDay(day)
  const key = `wf:d:${day}`
  const asc = game.dir === 'asc'
  const [top, total, myRank, myScore] = await store.exec([
    asc ? ['ZRANGE', key, 0, 49, 'WITHSCORES'] : ['ZRANGE', key, 0, 49, 'REV', 'WITHSCORES'],
    ['ZCARD', key],
    me ? [asc ? 'ZRANK' : 'ZREVRANK', key, me.id] : ['ZCARD', key],
    me ? ['ZSCORE', key, me.id] : ['ZCARD', key],
  ])
  const rows = []
  for (let i = 0; i < top.length; i += 2) rows.push({ id: top[i], score: Number(top[i + 1]) })
  const who = await people(store, rows.map(r => r.id))
  let place = 0
  const ranking = rows.map((r, i) => {
    if (i === 0 || rows[i - 1].score !== r.score) place = i + 1
    return { ...r, ...who[r.id], place }
  })
  return { day, game: game.id, total: Number(total), ranking, me: me && myRank !== null && myRank !== undefined ? { place: Number(myRank) + 1, score: num(myScore) } : null }
}

async function group(store, me, query, now) {
  const code = readCode(query.code)
  const [name, isMember, owner] = await store.exec([['HGET', `wf:g:${code}`, 'name'], ['SISMEMBER', `wf:g:${code}:m`, me.id], ['HGET', `wf:g:${code}`, 'owner']])
  if (!name) fail(404, 'no_group')
  if (!isMember) fail(403, 'not_member')
  const [members] = await store.exec([['SMEMBERS', `wf:g:${code}:m`]])
  const day = today(now)
  const week = seasonDays(day)
  const yesterday = shiftDay(day, -1)
  const lastWeek = seasonDays(shiftDay(week[0], -1))
  const all = [...new Set([...lastWeek, ...week, yesterday])]
  const scores = await dayScores(store, all, members)
  const byDay = Object.fromEntries(scores.map(s => [s.day, s.scores]))
  const [plays] = await store.exec([['HMGET', `wf:d:${day}:n`, ...members]])
  const who = await people(store, members)
  const named = rows => rows.map(r => ({ ...r, ...who[r.id] }))
  const game = gameOfDay(day).id
  return {
    code,
    name,
    owner,
    day,
    game,
    members: members.map((id, i) => ({ id, ...who[id], playsToday: Number(plays[i] ?? 0) })),
    today: named(rankDay(game, byDay[day])),
    yesterday: { day: yesterday, game: gameOfDay(yesterday).id, ranking: named(rankDay(gameOfDay(yesterday).id, byDay[yesterday])).slice(0, 3) },
    season: {
      from: week[0],
      to: shiftDay(week[0], 6),
      table: named(seasonTable(week.map(d => ({ day: d, scores: byDay[d] })))),
      // Day by day, for the season chart.
      days: week.map(d => ({ day: d, game: gameOfDay(d).id, ranking: rankDay(gameOfDay(d).id, byDay[d]).map(({ id, place, points }) => ({ id, place, points })) })),
    },
    lastSeason: { from: lastWeek[0], table: named(seasonTable(lastWeek.map(d => ({ day: d, scores: byDay[d] })))).slice(0, 3) },
  }
}

// ─── Retos ──────────────────────────────────────────────────────────────

async function createReto(store, me, body) {
  const game = gameById(body.game)
  if (!game) fail(400, 'bad_game')
  const day = Math.floor(Date.now() / 86_400_000)
  const [made] = await store.exec([['INCR', `wf:rl:reto:${me.id}:${day}`]])
  await store.exec([['EXPIRE', `wf:rl:reto:${me.id}:${day}`, 172_800]])
  if (made > 40) fail(429, 'slow_down')
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = newCode()
    const [fresh] = await store.exec([['HSETNX', `wf:r:${code}`, 'game', game.id]])
    if (!fresh) continue
    const seed = randomBytes(4).readUInt32BE(0)
    const created = Date.now()
    await store.exec([
      ['HSET', `wf:r:${code}`, 'owner', me.id, 'seed', seed, 'created', created],
      ['EXPIRE', `wf:r:${code}`, RETO_TTL],
      ['ZADD', `wf:p:${me.id}:r`, created, code],
      ['EXPIRE', `wf:p:${me.id}:r`, RETO_TTL],
    ])
    return retoView(store, me, code)
  }
  return fail(503, 'busy')
}

async function retoView(store, me, code) {
  const [[game, owner, seed, created], tries, scores] = await store.exec([
    ['HMGET', `wf:r:${code}`, 'game', 'owner', 'seed', 'created'],
    ['HGETALL', `wf:r:${code}:n`],
    ['ZRANGE', `wf:r:${code}:s`, 0, -1, 'WITHSCORES'],
  ])
  if (!game) fail(404, 'no_reto')
  const n = hash(tries)
  const best = []
  for (let i = 0; i < (scores?.length ?? 0); i += 2) best.push({ id: scores[i], score: Number(scores[i + 1]) })
  const ids = [...new Set([owner, ...Object.keys(n), ...best.map(b => b.id)])]
  const who = await people(store, ids)
  const ranked = rankDay(game, best).map(({ id, score, place }) => ({ id, score, place, tries: Number(n[id] ?? 0), ...who[id] }))
  const waiting = ids.filter(id => !best.some(b => b.id === id)).map(id => ({ id, score: null, place: null, tries: Number(n[id] ?? 0), ...who[id] }))
  return { code, game, seed: Number(seed), owner, created: Number(created), maxTries: RETO_TRIES, myTries: Number(n[me.id] ?? 0), players: [...ranked, ...waiting] }
}

async function getReto(store, me, query) {
  return retoView(store, me, readCode(query.code))
}

/** Every try counts from the moment it starts, so quitting a bad run doesn't give it back. */
async function startReto(store, me, body) {
  const code = readCode(body.code)
  const [[game, created]] = await store.exec([['HMGET', `wf:r:${code}`, 'game', 'created']])
  if (!game) fail(404, 'no_reto')
  const [tries] = await store.exec([['HINCRBY', `wf:r:${code}:n`, me.id, 1]])
  if (tries > RETO_TRIES) {
    await store.exec([['HINCRBY', `wf:r:${code}:n`, me.id, -1]])
    fail(409, 'no_tries')
  }
  await store.exec([
    ['EXPIRE', `wf:r:${code}:n`, RETO_TTL],
    ['ZADD', `wf:p:${me.id}:r`, 'NX', created ?? Date.now(), code],
    ['EXPIRE', `wf:p:${me.id}:r`, RETO_TTL],
  ])
  return { tries: Number(tries), maxTries: RETO_TRIES }
}

async function retoScore(store, me, body) {
  const code = readCode(body.code)
  const [[game], tries, sent] = await store.exec([['HMGET', `wf:r:${code}`, 'game'], ['HGET', `wf:r:${code}:n`, me.id], ['HINCRBY', `wf:r:${code}:k`, me.id, 1]])
  if (!game) fail(404, 'no_reto')
  if (Number(sent) > Number(tries ?? 0)) {
    await store.exec([['HINCRBY', `wf:r:${code}:k`, me.id, -1]])
    fail(409, 'no_tries')
  }
  const score = Number(body.score)
  if (!validScore(game, score)) fail(400, 'bad_score')
  await store.exec([
    ['ZADD', `wf:r:${code}:s`, gameById(game).dir === 'asc' ? 'LT' : 'GT', score, me.id],
    ['EXPIRE', `wf:r:${code}:s`, RETO_TTL],
    ['EXPIRE', `wf:r:${code}:k`, RETO_TTL],
  ])
  return retoView(store, me, code)
}

/** The challenges I made or joined, newest first. */
async function myRetos(store, me) {
  const [codes] = await store.exec([['ZRANGE', `wf:p:${me.id}:r`, 0, MY_RETOS - 1, 'REV']])
  const views = await Promise.all(codes.map(code => retoView(store, me, code).catch(() => null)))
  return { retos: views.filter(Boolean) }
}

// ─── 1 vs 1 in real time: the two phones swap WebRTC offers through here ───

function readSdp(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_SDP) fail(400, 'bad_sdp')
  return raw
}

async function createDuel(store, me, body) {
  if (!DUEL_GAMES.includes(body.game)) fail(400, 'bad_game')
  const offer = readSdp(body.offer)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = newCode()
    const [fresh] = await store.exec([['HSETNX', `wf:v:${code}`, 'game', body.game]])
    if (!fresh) continue
    await store.exec([['HSET', `wf:v:${code}`, 'offer', offer, 'host', me.id], ['EXPIRE', `wf:v:${code}`, DUEL_TTL]])
    return { code }
  }
  return fail(503, 'busy')
}

async function getDuel(store, me, query) {
  const code = readCode(query.code)
  const [[game, offer, answer, host]] = await store.exec([['HMGET', `wf:v:${code}`, 'game', 'offer', 'answer', 'host']])
  if (!game) fail(404, 'no_duel')
  const who = await people(store, [host])
  // The offer is only for the guest; the host just waits for the answer.
  return host === me.id ? { code, game, answer: answer ?? null, host: who[host] } : { code, game, offer, taken: !!answer, host: who[host] }
}

async function answerDuel(store, me, body) {
  const code = readCode(body.code)
  const answer = readSdp(body.answer)
  const [[game, host]] = await store.exec([['HMGET', `wf:v:${code}`, 'game', 'host']])
  if (!game) fail(404, 'no_duel')
  if (host === me.id) fail(409, 'own_duel')
  const [fresh] = await store.exec([['HSETNX', `wf:v:${code}`, 'answer', answer]])
  if (!fresh) fail(409, 'duel_taken')
  await store.exec([['HSET', `wf:v:${code}`, 'guest', me.id]])
  return { ok: true }
}

/**
 * One API request. `req` = { method, query, body, auth, ip }.
 * Returns { status, body }; never throws for client errors.
 */
export async function handle(store, req, now = Date.now()) {
  try {
    if (!store) return { status: 503, body: { error: 'no_database', seen: databaseEnvNames() } }
    const action = req.query?.a
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    if (req.method === 'GET' && action === 'state') return { status: 200, body: await state(store, req.auth, now) }
    if (req.method === 'POST' && action === 'register') return { status: 200, body: await register(store, body, req.ip) }
    const me = await identity(store, req.auth)
    if (req.method === 'GET' && action === 'group') return { status: 200, body: await group(store, me, req.query, now) }
    if (req.method === 'GET' && action === 'global') return { status: 200, body: await global(store, me, now) }
    if (req.method === 'POST' && (action === 'profile' || action === 'rename')) return { status: 200, body: await profile(store, me, body) }
    if (req.method === 'POST' && action === 'createGroup') return { status: 200, body: await createGroup(store, me, body) }
    if (req.method === 'POST' && action === 'joinGroup') return { status: 200, body: await joinGroup(store, me, body) }
    if (req.method === 'POST' && action === 'leaveGroup') return { status: 200, body: await leaveGroup(store, me, body) }
    if (req.method === 'POST' && action === 'score') return { status: 200, body: await submitScore(store, me, body, now) }
    if (req.method === 'POST' && action === 'retoCreate') return { status: 200, body: await createReto(store, me, body) }
    if (req.method === 'GET' && action === 'reto') return { status: 200, body: await getReto(store, me, req.query) }
    if (req.method === 'POST' && action === 'retoStart') return { status: 200, body: await startReto(store, me, body) }
    if (req.method === 'POST' && action === 'retoScore') return { status: 200, body: await retoScore(store, me, body) }
    if (req.method === 'GET' && action === 'retos') return { status: 200, body: await myRetos(store, me) }
    if (req.method === 'POST' && action === 'duelCreate') return { status: 200, body: await createDuel(store, me, body) }
    if (req.method === 'GET' && action === 'duel') return { status: 200, body: await getDuel(store, me, req.query) }
    if (req.method === 'POST' && action === 'duelAnswer') return { status: 200, body: await answerDuel(store, me, body) }
    return fail(404, 'not_found')
  } catch (error) {
    const status = error.status ?? 500
    if (status >= 500) console.error('weflipi api', error)
    // Database failures say why (no secrets in these messages) so a bad connection is easy to fix.
    if (error.store) return { status: 503, body: { error: 'database_error', detail: String(error.message).slice(0, 200) } }
    return { status, body: { error: error.code ?? (status >= 500 ? 'server_error' : 'bad_request') } }
  }
}

/** Shared by the Vercel function and the Vite dev middleware: Node req/res in, JSON out. */
export async function nodeHandler(store, req, res) {
  const url = new URL(req.url ?? '/', 'http://local')
  let body = req.body
  if (body === undefined && req.method === 'POST') {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 16_384) break
      chunks.push(chunk)
    }
    body = Buffer.concat(chunks).toString('utf8')
  }
  if (typeof body === 'string') {
    try {
      body = body ? JSON.parse(body) : {}
    } catch {
      body = {}
    }
  }
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0].trim()
  const out = await handle(store, { method: req.method, query: Object.fromEntries(url.searchParams), body, auth: req.headers.authorization, ip })
  res.statusCode = out.status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(out.body))
}

