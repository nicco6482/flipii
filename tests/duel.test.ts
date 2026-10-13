import { describe, expect, it } from 'vitest'
import { H, W, noFx } from '../src/weflipi/engine'
import { idleInput, type DuelFactory, type DuelGame, type DuelResult, type Player, type PlayerInput } from '../src/weflipi/duel/core'
import { futbolinDuel } from '../src/weflipi/duel/games/futbolin'
import { hockeyDuel } from '../src/weflipi/duel/games/hockey'
import { penaltisDuel } from '../src/weflipi/duel/games/penaltis'
import { pongDuel } from '../src/weflipi/duel/games/pong'

const env = { sfx: { tone: () => undefined, noise: () => undefined }, fx: noFx }

/** Play up to `seconds` at 60 fps; `bot` sets each player's touch every frame. */
function match(factory: DuelFactory, bot: (s: any, p: Player, inp: PlayerInput, frame: number) => PlayerInput, seconds = 400): { game: DuelGame; result: DuelResult | null } {
  const game = factory(env)
  const inputs: [PlayerInput, PlayerInput] = [idleInput(0), idleInput(1)]
  for (let f = 0; f < seconds * 60; f += 1) {
    const s = game.snapshot()
    inputs[0] = bot(s, 0, inputs[0], f)
    inputs[1] = bot(s, 1, inputs[1], f)
    game.update(1 / 60, inputs)
    const r = game.result()
    if (r) return { game, result: r }
  }
  return { game, result: null }
}

/** Snapshots survive JSON (that's how they travel to the guest's phone). */
function roundTrips(game: DuelGame, factory: DuelFactory) {
  const copy = factory(env)
  copy.load(JSON.parse(JSON.stringify(game.snapshot())))
  expect(JSON.stringify(copy.snapshot())).toBe(JSON.stringify(game.snapshot()))
}

describe('1 vs 1 games', () => {
  it('pong: a player who follows the ball beats one who never moves', () => {
    const { game, result } = match(pongDuel, (s, p, inp) => (p === 0 ? { ...inp, active: true, x: s.x } : inp))
    expect(result).toEqual({ winner: 0, scores: [7, 0] })
    roundTrips(game, pongDuel)
  })

  it('hockey: shooting at the goal wins and the puck never leaves the rink', () => {
    let maxOut = -Infinity
    const { game, result } = match(hockeyDuel, (s, p, inp) => {
      maxOut = Math.max(maxOut, Math.abs(s.puck.x - W / 2) - W / 2, s.puck.y - H, -s.puck.y)
      if (p === 1) return inp
      // Get under the puck and push it up.
      const below = s.puck.y + 40
      return { ...inp, active: true, x: s.puck.x + Math.sin(s.t * 3) * 6, y: s.puck.y > H / 2 ? below - 30 : H - 120 }
    })
    expect(maxOut).toBeLessThan(0)
    expect(result?.winner).toBe(0)
    expect(Number.isFinite(game.snapshot() && (game.snapshot() as any).puck.x)).toBe(true)
    roundTrips(game, hockeyDuel)
  })

  it('futbolín: the player who kicks beats the one who never touches', () => {
    const { game, result } = match(futbolinDuel, (s, p, inp, f) => (p === 0 ? { ...inp, active: true, x: s.ball.x, downs: f % 20 === 0 ? inp.downs + 1 : inp.downs } : inp))
    expect(result?.winner).toBe(0)
    roundTrips(game, futbolinDuel)
  })

  it('penaltis: five each, then sudden death, alternating shooter', () => {
    // Player 0 always shoots into the corner; player 1 shoots straight at the keeper, who stands still.
    const { game, result } = match(penaltisDuel, (s, p, inp, f) => {
      if (s.turn !== p || s.shot || s.msgT > 0 || f % 30 !== 0) return { ...inp, active: false }
      const [sx, sy] = p === 0 ? [W / 2, 560] : [W / 2, H - 560]
      const [ex, ey] = p === 0 ? [W / 2 - 60, 300] : [W / 2, H - 300]
      return { ...inp, active: false, sx, sy, x: ex, y: ey, st: f * 16, et: f * 16 + 150, downs: inp.downs + 1, ups: inp.ups + 1 }
    })
    const s = game.snapshot() as any
    expect(result?.winner).toBe(0)
    expect(s.kicks[0] - s.kicks[1]).toBeLessThanOrEqual(1)
    expect(s.kicks[0]).toBeLessThanOrEqual(5)
    roundTrips(game, penaltisDuel)
  })

  it('nobody wins a match where nobody plays, but nothing breaks either', () => {
    for (const f of [pongDuel, hockeyDuel, futbolinDuel, penaltisDuel]) {
      const { game } = match(f, (_s, _p, inp) => inp, 30)
      expect(JSON.stringify(game.snapshot(), (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'BAD' : v))).not.toContain('BAD')
    }
  })
})
