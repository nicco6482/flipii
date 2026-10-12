import { describe, expect, it } from 'vitest'
import { handle, memoryStore } from '../server/weflipi-api.mjs'
import { GAMES, gameOfDay, msUntilNextDay, rankDay, seasonDays, seasonTable, today, weekStart } from '../server/weflipi-games.mjs'

const NOON = Date.parse('2026-10-14T10:00:00Z') // Wednesday, 12:00 in Madrid

describe('weflipi rules', () => {
  it('rolls days over at midnight in Spain', () => {
    expect(today(Date.parse('2026-10-14T21:59:00Z'))).toBe('2026-10-14')
    expect(today(Date.parse('2026-10-14T22:01:00Z'))).toBe('2026-10-15')
    expect(msUntilNextDay(NOON)).toBe(12 * 3_600_000)
  })

  it('rotates through every game, one per day', () => {
    const seen = new Set<string>()
    for (let i = 0; i < GAMES.length; i += 1) seen.add(gameOfDay(`2026-01-0${i + 1}`).id)
    expect(seen.size).toBe(GAMES.length)
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

describe('weflipi api', () => {
  const call = (store: ReturnType<typeof memoryStore>, method: string, a: string, body: object = {}, token?: string, query: Record<string, string> = {}) =>
    handle(store, { method, query: { a, ...query }, body, auth: token ? `Bearer ${token}` : undefined, ip: '1.2.3.4' }, NOON)

  async function player(store: ReturnType<typeof memoryStore>, name: string) {
    const r = await call(store, 'POST', 'register', { name })
    expect(r.status).toBe(200)
    return `${r.body.id}.${r.body.token}`
  }

  it('reports a missing database instead of crashing', async () => {
    const r = await handle(null, { method: 'GET', query: { a: 'state' } })
    expect(r).toEqual({ status: 503, body: { error: 'no_database' } })
  })

  it('creates a group, lets a friend join and ranks today and the season', async () => {
    const store = memoryStore()
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

  it('rejects other days games, impossible scores, strangers and bad tokens', async () => {
    const store = memoryStore()
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
