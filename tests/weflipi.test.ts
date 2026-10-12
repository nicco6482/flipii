import { beforeEach, describe, expect, it } from 'vitest'
import { handle, memoryStore, redisStore, upstashCredentials, type Store } from '../server/weflipi-api.mjs'
import { GAMES, ROTATIONS, gameOfDay, msUntilNextDay, rankDay, seasonDays, seasonTable, shiftDay, today, weekStart } from '../server/weflipi-games.mjs'

const NOON = Date.parse('2026-10-14T10:00:00Z') // Wednesday, 12:00 in Madrid

describe('weflipi rules', () => {
  it('rolls days over at midnight in Spain', () => {
    expect(today(Date.parse('2026-10-14T21:59:00Z'))).toBe('2026-10-14')
    expect(today(Date.parse('2026-10-14T22:01:00Z'))).toBe('2026-10-15')
    expect(msUntilNextDay(NOON)).toBe(12 * 3_600_000)
  })

  it('rotates through every game, one per day, without changing past days', () => {
    // The original eight-game rotation is untouched up to the day the new games joined.
    expect(['2026-10-10', '2026-10-11', '2026-10-12'].map(d => gameOfDay(d).id)).toEqual(['apilar', 'coches', 'dardos'])
    const last = ROTATIONS[ROTATIONS.length - 1]
    const seen = new Set<string>()
    for (let i = 0; i < last.ids.length; i += 1) seen.add(gameOfDay(shiftDay(last.from, i)).id)
    expect(seen).toEqual(new Set(GAMES.map(g => g.id)))
    expect(gameOfDay(shiftDay(last.from, last.ids.length)).id).toBe(last.ids[0])
  })

  it('runs seasons Monday to Sunday', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12')
    expect(weekStart('2026-10-18')).toBe('2026-10-12')
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
    expect(seasonDays('2026-10-14')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14'])
  })

  it('ranks by the game direction and shares ties', () => {
    expect(rankDay('reflejos', [{ id: 'a', score: 300 }, { id: 'b', score: 200 }]).map(r => r.id)).toEqual(['b', 'a'])
    const r = rankDay('apilar', [{ id: 'a', score: 5 }, { id: 'b', score: 9 }, { id: 'c', score: 9 }])
    expect(r.map(x => [x.id, x.place, x.points])).toEqual([['b', 1, 10], ['c', 1, 10], ['a', 3, 6]])
  })

  it('adds up season points and wins', () => {
    const table = seasonTable([
      { day: '2026-10-12', scores: [{ id: 'a', score: gameOfDay('2026-10-12').dir === 'asc' ? 5 : 10 }, { id: 'b', score: gameOfDay('2026-10-12').dir === 'asc' ? 10 : 5 }] },
      { day: '2026-10-13', scores: [{ id: 'b', score: 1 }] },
    ])
    expect(table[0]).toMatchObject({ id: 'b', points: 18, wins: 1, played: 2 })
    expect(table[1]).toMatchObject({ id: 'a', points: 10, wins: 1, played: 1 })
  })
})

const stores: [string, () => Store][] = [['memory', memoryStore]]
// Set REDIS_TEST_URL (e.g. redis://127.0.0.1:6379) to also run these against a real Redis server.
const redisTestUrl = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.REDIS_TEST_URL
if (redisTestUrl) stores.push(['redis', () => redisStore(redisTestUrl)])

describe.each(stores)('weflipi api (%s)', (_name, makeStore) => {
  // Every test starts from an empty database (a no-op for the fresh in-memory store).
  beforeEach(async () => {
    if (_name === 'redis') await makeStore().exec([['FLUSHDB']])
  })

  const call = (store: Store, method: string, a: string, body: object = {}, token?: string, query: Record<string, string> = {}) =>
    handle(store, { method, query: { a, ...query }, body, auth: token ? `Bearer ${token}` : undefined, ip: '1.2.3.4' }, NOON)

  async function player(store: Store, name: string) {
    const r = await call(store, 'POST', 'register', { name })
    expect(r.status).toBe(200)
    return `${r.body.id}.${r.body.token}`
  }

  it('reports a missing database instead of crashing', async () => {
    const r = await handle(null, { method: 'GET', query: { a: 'state' } })
    expect(r.status).toBe(503)
    expect(r.body.error).toBe('no_database')
  })

  it('finds Upstash credentials under any name the integration uses', () => {
    expect(upstashCredentials({ KV_REST_API_URL: 'https://a.upstash.io', KV_REST_API_TOKEN: 't' })).toEqual({ url: 'https://a.upstash.io', token: 't' })
    expect(upstashCredentials({ UPSTASH_REDIS_REST_URL: 'https://b.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'u' })).toEqual({ url: 'https://b.upstash.io', token: 'u' })
    expect(upstashCredentials({ STORAGE_KV_REST_API_URL: 'https://c.upstash.io', STORAGE_KV_REST_API_TOKEN: 'v' })).toEqual({ url: 'https://c.upstash.io', token: 'v' })
    expect(upstashCredentials({ REDIS_URL: 'rediss://default:p%40ss@d.upstash.io:6379' })).toEqual({ url: 'https://d.upstash.io', token: 'p@ss' })
    expect(upstashCredentials({ REDIS_URL: 'redis://default:x@redis-123.cloud.redislabs.com:1234' })).toBeNull()
    expect(upstashCredentials({ KV_REST_API_URL: 'https://e.upstash.io' })).toBeNull()
  })

  it('creates a group, lets a friend join and ranks today and the season', async () => {
    const store = makeStore()
    const ana = await player(store, '  Ana  ')
    const leo = await player(store, 'Leo')
    const created = await call(store, 'POST', 'createGroup', { name: 'Los cracks' }, ana)
    expect(created.body.code).toMatch(/^[A-Z2-9]{6}$/)
    const code = created.body.code as string
    expect((await call(store, 'POST', 'joinGroup', { code: code.toLowerCase() }, leo)).body).toEqual({ code, name: 'Los cracks' })

    const game = gameOfDay(today(NOON))
    const good = game.dir === 'asc' ? game.min + 10 : game.min + 20
    const worse = game.dir === 'asc' ? game.min + 50 : game.min + 5
    expect((await call(store, 'POST', 'score', { game: game.id, score: worse }, ana)).body).toMatchObject({ best: worse, plays: 1 })
    // Unlimited attempts: only the best counts, worse retries never lower it.
    expect((await call(store, 'POST', 'score', { game: game.id, score: good }, ana)).body).toMatchObject({ best: good, plays: 2 })
    expect((await call(store, 'POST', 'score', { game: game.id, score: worse }, ana)).body).toMatchObject({ best: good, plays: 3 })
    await call(store, 'POST', 'score', { game: game.id, score: worse }, leo)

    const g = await call(store, 'GET', 'group', {}, leo, { code })
    expect(g.status).toBe(200)
    expect(g.body.today.map((r: { name: string }) => r.name)).toEqual(['Ana', 'Leo'])
    expect(g.body.season.table[0]).toMatchObject({ name: 'Ana', points: 10, wins: 1 })
    expect(g.body.members.find((m: { name: string }) => m.name === 'Ana').playsToday).toBe(3)

    const s = await call(store, 'GET', 'state', {}, ana)
    expect(s.body).toMatchObject({ game: game.id, best: good, plays: 3, me: { name: 'Ana' }, groups: [{ code, name: 'Los cracks', members: 2 }] })
  })

  it('saves avatars, counts day streaks and ranks everyone worldwide', async () => {
    const store = makeStore()
    const ana = await player(store, 'Ana')
    const leo = await player(store, 'Leo')
    expect((await call(store, 'POST', 'profile', { avatar: '🦊', color: '#a77bff' }, ana)).body).toEqual({ name: 'Ana', avatar: '🦊', color: '#a77bff' })
    expect((await call(store, 'POST', 'profile', { avatar: 'X' }, ana)).body.error).toBe('bad_avatar')
    const game = gameOfDay(today(NOON))
    const hi = game.dir === 'asc' ? game.min + 1 : game.min + 30
    const lo = game.dir === 'asc' ? game.min + 9 : game.min + 3
    // Played yesterday too: the streak continues.
    const yesterday = NOON - 86_400_000
    const yGame = gameOfDay(today(yesterday))
    await handle(store, { method: 'POST', query: { a: 'score' }, body: { game: yGame.id, score: yGame.min }, auth: `Bearer ${ana}` }, yesterday)
    expect((await call(store, 'POST', 'score', { game: game.id, score: hi }, ana)).body.streak).toBe(2)
    expect((await call(store, 'POST', 'score', { game: game.id, score: lo }, leo)).body.streak).toBe(1)
    const st = await call(store, 'GET', 'state', {}, ana)
    expect(st.body.me).toMatchObject({ name: 'Ana', avatar: '🦊' })
    expect(st.body.stats).toMatchObject({ streak: 2, bestStreak: 2, total: 2, playedToday: true })
    const g = await call(store, 'GET', 'global', {}, leo)
    expect(g.body.total).toBe(2)
    expect(g.body.ranking.map((r: { name: string }) => r.name)).toEqual(['Ana', 'Leo'])
    expect(g.body.ranking[0]).toMatchObject({ place: 1, avatar: '🦊', score: hi })
    expect(g.body.me).toEqual({ place: 2, score: lo })
  })

  it('rejects other days games, impossible scores, strangers and bad tokens', async () => {
    const store = makeStore()
    const ana = await player(store, 'Ana')
    const eve = await player(store, 'Eve')
    const game = gameOfDay(today(NOON))
    const other = GAMES.find(g => g.id !== game.id)!
    expect((await call(store, 'POST', 'score', { game: other.id, score: other.min }, ana)).body.error).toBe('not_today')
    expect((await call(store, 'POST', 'score', { game: game.id, score: game.max + 1 }, ana)).body.error).toBe('bad_score')
    const { code } = (await call(store, 'POST', 'createGroup', { name: 'Privado' }, ana)).body
    expect((await call(store, 'GET', 'group', {}, eve, { code })).status).toBe(403)
    expect((await call(store, 'POST', 'joinGroup', { code: 'ZZZZZZ' }, eve)).body.error).toBe('no_group')
    expect((await call(store, 'GET', 'group', {}, `${ana.split('.')[0]}.${'0'.repeat(48)}`, { code })).status).toBe(401)
  })
})
