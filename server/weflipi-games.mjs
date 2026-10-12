// Shared, dependency-free rules for weflipi: which minigame is on today, how scores compare and how
// weekly season points are awarded. The browser imports this file for the hub, and the API imports
// the same file so both always agree on "today's game".

/** Every minigame. `dir` says which scores are better: 'desc' = higher wins, 'asc' = lower wins. */
export const GAMES = [
  { id: 'helix', dir: 'desc', min: 0, max: 20_000 },
  { id: 'reflejos', dir: 'asc', min: 80, max: 5_000 },
  { id: 'apilar', dir: 'desc', min: 0, max: 500 },
  { id: 'coches', dir: 'desc', min: 0, max: 100_000 },
  { id: 'dardos', dir: 'desc', min: 0, max: 540 },
  { id: 'flappy', dir: 'desc', min: 0, max: 1_000 },
  { id: 'bolos', dir: 'desc', min: 0, max: 300 },
  { id: 'golf', dir: 'asc', min: 3, max: 30 },
  { id: 'calculo', dir: 'desc', min: 0, max: 300 },
  { id: 'dados', dir: 'desc', min: 5, max: 30 },
  { id: 'toques', dir: 'desc', min: 0, max: 5_000 },
  { id: 'colores', dir: 'desc', min: 0, max: 300 },
  { id: 'cortar', dir: 'desc', min: 0, max: 5_000 },
  { id: 'cronometro', dir: 'asc', min: 0, max: 30_000 },
  { id: 'deslizar', dir: 'desc', min: 0, max: 300 },
  { id: 'vasos', dir: 'desc', min: 0, max: 100 },
  { id: 'ladrillos', dir: 'desc', min: 0, max: 20_000 },
  { id: 'basket', dir: 'desc', min: 0, max: 400 },
  { id: 'penaltis', dir: 'desc', min: 0, max: 20 },
  { id: 'hockey', dir: 'desc', min: 0, max: 60 },
  { id: 'futbolin', dir: 'desc', min: 0, max: 60 },
  { id: 'billar', dir: 'desc', min: 0, max: 300 },
  { id: 'orbita', dir: 'desc', min: 0, max: 10_000 },
  { id: 'ecos', dir: 'desc', min: 0, max: 100 },
]

/**
 * Rotation schedule. Each entry runs from its `from` day until the next entry starts, cycling
 * through `ids` one per day. New games join with a new entry starting on a future day, so the
 * game of any past or current day never changes (scores already saved stay valid).
 */
export const ROTATIONS = [
  { from: '2026-01-01', ids: ['helix', 'reflejos', 'apilar', 'coches', 'dardos', 'flappy', 'bolos', 'golf'] },
  {
    from: '2026-10-13',
    ids: ['calculo', 'toques', 'dados', 'colores', 'helix', 'cortar', 'cronometro', 'reflejos', 'deslizar', 'apilar', 'vasos', 'coches', 'ladrillos', 'dardos', 'flappy', 'bolos', 'golf'],
  },
  {
    from: '2026-10-14',
    ids: ['basket', 'futbolin', 'toques', 'penaltis', 'billar', 'colores', 'hockey', 'cortar', 'dados', 'helix', 'cronometro', 'reflejos', 'deslizar', 'apilar', 'vasos', 'coches', 'ladrillos', 'dardos', 'flappy', 'bolos', 'golf', 'calculo'],
  },
  {
    from: '2026-10-20',
    ids: ['basket', 'orbita', 'futbolin', 'toques', 'penaltis', 'billar', 'ecos', 'colores', 'hockey', 'cortar', 'dados', 'helix', 'cronometro', 'reflejos', 'deslizar', 'apilar', 'vasos', 'coches', 'ladrillos', 'dardos', 'flappy', 'bolos', 'golf', 'calculo'],
  },
]

export const GAME_IDS = GAMES.map(g => g.id)
export const gameById = id => GAMES.find(g => g.id === id) ?? null

/** Days roll over at midnight in Spain. */
export const TIME_ZONE = 'Europe/Madrid'
const EPOCH = Date.UTC(2026, 0, 1)
const DAY_MS = 86_400_000

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

/** The current weflipi day as YYYY-MM-DD. */
export function today(nowMs = Date.now()) {
  return dayFormat.format(nowMs)
}

/** Milliseconds until the next game starts (midnight in Spain). */
export function msUntilNextDay(nowMs = Date.now()) {
  const [h, m, s] = clockFormat.format(nowMs).split(':').map(Number)
  return Math.max(1000, (86_400 - (h * 3600 + m * 60 + s)) * 1000 - (nowMs % 1000))
}

const dayIndex = day => Math.round((Date.parse(`${day}T00:00:00Z`) - EPOCH) / DAY_MS)

export function shiftDay(day, delta) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10)
}

/** The minigame everyone plays on `day`; one game per day, following ROTATIONS. */
export function gameOfDay(day) {
  const rotation = [...ROTATIONS].reverse().find(r => day >= r.from) ?? ROTATIONS[0]
  const n = rotation.ids.length
  const i = dayIndex(day) - dayIndex(rotation.from)
  return gameById(rotation.ids[((i % n) + n) % n])
}

/** Monday of the week that contains `day` (seasons run Monday → Sunday). */
export function weekStart(day) {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
  return shiftDay(day, -weekday)
}

/** Days of the season up to and including `day`. */
export function seasonDays(day) {
  const start = weekStart(day)
  const days = []
  for (let d = start; d <= day; d = shiftDay(d, 1)) days.push(d)
  return days
}

/** Daily seed so everyone in the world gets the same level layout on the same day. */
export function daySeed(day) {
  let h = 0x811c9dc5
  for (const ch of `weflipi:${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return h >>> 0
}

export function isBetter(gameId, a, b) {
  return gameById(gameId)?.dir === 'asc' ? a < b : a > b
}

export function validScore(gameId, score) {
  const g = gameById(gameId)
  return !!g && Number.isFinite(score) && Number.isInteger(score) && score >= g.min && score <= g.max
}

/** Season points by daily position inside a group; everyone who played gets at least one. */
export const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2]

/**
 * Rank one day's group scores. `scores` is [{ id, score }] for members who played.
 * Ties share the better place.
 */
export function rankDay(gameId, scores) {
  const sorted = [...scores].sort((a, b) => (isBetter(gameId, a.score, b.score) ? -1 : isBetter(gameId, b.score, a.score) ? 1 : 0))
  let place = 0
  return sorted.map((entry, i) => {
    if (i === 0 || sorted[i - 1].score !== entry.score) place = i + 1
    return { ...entry, place, points: PLACE_POINTS[place - 1] ?? 1 }
  })
}

/**
 * Weekly table from per-day scores. `days` is [{ day, scores: [{ id, score }] }].
 * Returns [{ id, points, wins, played }] sorted by points, then wins.
 */
export function seasonTable(days) {
  const table = new Map()
  for (const { day, scores } of days) {
    const game = gameOfDay(day).id
    for (const r of rankDay(game, scores)) {
      const row = table.get(r.id) ?? { id: r.id, points: 0, wins: 0, played: 0 }
      row.points += r.points
      row.played += 1
      if (r.place === 1) row.wins += 1
      table.set(r.id, row)
    }
  }
  return [...table.values()].sort((a, b) => b.points - a.points || b.wins - a.wins)
}

/** Avatar faces and background colours a player can pick on their profile. */
export const AVATARS = ['😎', '🤠', '🥷', '🧙', '👽', '🤖', '👻', '🐸', '🦊', '🐼', '🐯', '🦁', '🐵', '🐙', '🦄', '🐲', '🐧', '🦖', '🍕', '🌮', '🔥', '⚡', '🌈', '💀']
export const COLORS = ['#ffd35c', '#ff9f43', '#ff5f7e', '#a77bff', '#7ef9ff', '#2bd47d', '#5b8cff', '#f5f5f5']

/** Stable default look for players who never picked one. */
export function defaultLook(id) {
  let h = 0
  for (const ch of String(id)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
  return { avatar: AVATARS[h % AVATARS.length], color: COLORS[(h >>> 8) % COLORS.length] }
}
