import { describe, expect, it } from 'vitest'
import { validScore, type GameId } from '../server/weflipi-games.mjs'
import { H, W, mulberry, noFx, type Factory, type MiniGame } from '../src/weflipi/engine'
import { apilar } from '../src/weflipi/games/apilar'
import { bolos } from '../src/weflipi/games/bolos'
import { coches } from '../src/weflipi/games/coches'
import { dardos, dartScore } from '../src/weflipi/games/dardos'
import { flappy } from '../src/weflipi/games/flappy'
import { golf } from '../src/weflipi/games/golf'
import { basket } from '../src/weflipi/games/basket'
import { billar } from '../src/weflipi/games/billar'
import { futbolin } from '../src/weflipi/games/futbolin'
import { hockey } from '../src/weflipi/games/hockey'
import { penaltis } from '../src/weflipi/games/penaltis'
import { calculo } from '../src/weflipi/games/calculo'
import { colores } from '../src/weflipi/games/colores'
import { cortar } from '../src/weflipi/games/cortar'
import { cronometro } from '../src/weflipi/games/cronometro'
import { dados } from '../src/weflipi/games/dados'
import { deslizar } from '../src/weflipi/games/deslizar'
import { ladrillos } from '../src/weflipi/games/ladrillos'
import { toques } from '../src/weflipi/games/toques'
import { vasos } from '../src/weflipi/games/vasos'
import { ecos } from '../src/weflipi/games/ecos'
import { orbita } from '../src/weflipi/games/orbita'

const sfx = { tone: () => undefined, noise: () => undefined }

/** Drive a game headlessly with `script(game, frame)` until it ends; returns the final score. */
async function play(factory: Factory, script: (g: MiniGame, frame: number) => void, maxFrames = 20_000): Promise<number | null> {
  let result: number | null = null
  const game = factory({ rand: mulberry(42), score: () => undefined, end: s => (result ??= s), sfx, fx: noFx })
  for (let f = 0; f < maxFrames && result === null; f += 1) {
    script(game, f)
    game.update(1 / 60)
    if (f % 600 === 0) await new Promise(r => setTimeout(r, 0))
  }
  // Some games finish on a short timer after the last move.
  for (let i = 0; i < 20 && result === null; i += 1) await new Promise(r => setTimeout(r, 100))
  return result
}

const tap = (g: MiniGame, x = W / 2, y = H / 2) => {
  g.down?.(x, y)
  g.up?.(x, y)
}

function expectValid(id: GameId, score: number | null) {
  expect(score).not.toBeNull()
  expect(validScore(id, score!), `${id} score ${score}`).toBe(true)
}

describe('minigames', () => {
  it('scores darts like a real board', () => {
    expect(dartScore(W / 2, 285)).toEqual({ points: 50, label: 'DIANA' })
    expect(dartScore(W / 2, 285 - 103 * (160 / 170))).toEqual({ points: 60, label: 'T20' })
    expect(dartScore(W / 2, 285 + 166 * (160 / 170))).toEqual({ points: 6, label: 'D3' })
    expect(dartScore(W / 2, 285 - 60)).toEqual({ points: 20, label: '20' })
    expect(dartScore(10, 10).points).toBe(0)
  })

  it('dardos ends after nine darts', async () => {
    expectValid('dardos', await play(dardos, (g, f) => f % 40 === 0 && tap(g, W / 2, 285 + 90)))
  })

  it('bolos plays five frames and knocks pins with straight rolls', async () => {
    const score = await play(bolos, (g, f) => f % 30 === 0 && tap(g, W / 2, H - 90))
    expectValid('bolos', score)
    expect(score).toBeGreaterThan(10)
  })

  it('golf finishes three holes within the stroke cap', async () => {
    const score = await play(golf, (g, f) => {
      if (f % 90 !== 0) return
      g.down?.(200, 400)
      g.up?.(200 + (f % 180 ? 40 : -40), 560)
    })
    expectValid('golf', score)
  })

  it('coches crashes eventually without input', async () => {
    const score = await play(coches, (g, f) => f === 0 && g.key?.('left', true))
    expectValid('coches', score)
  })

  it('flappy falls after one flap', async () => {
    expectValid('flappy', await play(flappy, (g, f) => f === 0 && tap(g)))
  })

  it('apilar ends when a drop misses', async () => {
    expectValid('apilar', await play(apilar, (g, f) => f % 47 === 0 && tap(g)))
  })

  it('calculo runs a 60 s round of answers', async () => {
    expectValid('calculo', await play(calculo, (g, f) => f % 20 === 0 && tap(g, 110 + (f % 40 ? 0 : 180), 450)))
  })

  it('dados adds up five stopped dice', async () => {
    const score = await play(dados, (g, f) => f % 13 === 0 && tap(g))
    expectValid('dados', score)
    expect(score).toBeGreaterThanOrEqual(5)
  })

  it('toques counts kicks until the ball lands', async () => {
    expect(await play(toques, (g, f) => f === 0 && tap(g, W / 2, 330))).toBe(1)
  })

  it('colores runs a 45 s round', async () => {
    expectValid('colores', await play(colores, (g, f) => f % 15 === 0 && tap(g, f % 30 ? 110 : 290, 480)))
  })

  it('cortar ends on bombs or three dropped fruits', async () => {
    expectValid('cortar', await play(cortar, (g, f) => {
      if (f % 30 !== 0) return
      g.down?.(20, 300)
      g.move?.(200, 320)
      g.move?.(380, 300)
      g.up?.(380, 300)
    }))
  })

  it('cronometro sums the error of three stops', async () => {
    expectValid('cronometro', await play(cronometro, (g, f) => f % 60 === 0 && tap(g)))
  })

  it('deslizar runs a 30 s round of swipes', async () => {
    expectValid('deslizar', await play(deslizar, (g, f) => {
      if (f % 12 !== 0) return
      g.down?.(200, 360)
      g.up?.(f % 24 ? 320 : 80, 360)
    }))
  })

  it('vasos ends on the first wrong cup', async () => {
    expectValid('vasos', await play(vasos, (g, f) => f % 20 === 0 && tap(g, W / 2, 400)))
  })

  it('orbita ends after navigating an asteroid field', async () => {
    expectValid('orbita', await play(orbita, (g, f) => {
      if (f === 0) tap(g, W / 2, 520)
      if (f > 0 && f % 28 === 0) g.key?.(f % 56 ? 'left' : 'right', true)
    }))
  })

  it('ecos ends after an input sequence', async () => {
    expectValid('ecos', await play(ecos, (g, f) => {
      if (f === 0) tap(g, 110, 350)
      if (f > 100 && f % 24 === 0) tap(g, f % 48 ? 110 : 280, f % 72 ? 350 : 530)
    }))
  })

  it('ladrillos ends when the ball gets past the paddle', async () => {
    expectValid('ladrillos', await play(ladrillos, (g, f) => f === 0 && tap(g, 40, 600)))
  })

  it('basket: a straight medium flick is a clean basket worth 3', async () => {
    let first = -1
    const game = basket({ rand: mulberry(1), score: n => first < 0 && (first = n), end: () => undefined, sfx, fx: noFx })
    tap(game)
    for (let f = 0; f < 120; f += 1) game.update(1 / 60)
    expect(first).toBe(3)
  })

  it('basket runs 60 s of shots', async () => {
    expectValid('basket', await play(basket, (g, f) => f % 90 === 0 && tap(g)))
  })

  it('penaltis takes ten shots', async () => {
    expectValid('penaltis', await play(penaltis, (g, f) => f % 120 === 0 && tap(g)))
  })

  it('hockey runs a 60 s match', async () => {
    expectValid('hockey', await play(hockey, (g, f) => f % 30 === 0 && g.down?.(W / 2 + ((f / 30) % 2 ? 60 : -60), 500)))
  })

  it('futbolin runs a 60 s match', async () => {
    expectValid('futbolin', await play(futbolin, (g, f) => f % 20 === 0 && g.down?.(W / 2 + Math.sin(f / 50) * 120, 500)))
  })

  it('billar: the break scatters the rack and the game ends with a valid score', async () => {
    expectValid('billar', await play(billar, (g, f) => f % 240 === 0 && tap(g), 40_000))
  })
})
