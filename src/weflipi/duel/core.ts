// 1 vs 1 games. The world is always seen from player 0: player 0 plays at the bottom and player 1
// at the top. Each game is written once and runs:
//  - on one phone (both players touching at once; player 1's labels are drawn upside down), or
//  - online, where the host simulates and the guest sees the world turned 180° so that they also
//    play from the bottom. See runner.ts and net.ts.
import { H, W, text, type Fx, type Sfx } from '../engine'

export type Player = 0 | 1

/** One player's touch, in world coordinates (already flipped for player 1 online). */
export type PlayerInput = {
  /** A finger is down. */
  active: boolean
  x: number
  y: number
  /** Where and when (ms) the current/last touch started. */
  sx: number
  sy: number
  st: number
  /** When (ms) the last touch ended. */
  et: number
  /** Count of touches started / ended so far: edges are detected by the count changing. */
  downs: number
  ups: number
}

export const idleInput = (player: Player): PlayerInput => ({ active: false, x: W / 2, y: player === 0 ? H - 120 : 120, sx: 0, sy: 0, st: 0, et: 0, downs: 0, ups: 0 })

export type DuelEnv = { sfx: Sfx; fx: Fx }

/** Who is looking: both players on one phone, or one player online. */
export type View = 'local' | Player

export type DuelResult = { winner: Player | null; scores: [number, number] }

export interface DuelGame {
  bg: string
  /** Advance the simulation with both players' inputs. Only the host / local device calls it. */
  update(dt: number, inputs: [PlayerInput, PlayerInput]): void
  draw(g: CanvasRenderingContext2D, view: View): void
  /** Serialisable snapshot for the guest, and how the guest applies it. */
  snapshot(): unknown
  load(state: unknown): void
  /** Set once the match is over. */
  result(): DuelResult | null
}

export type DuelFactory = (env: DuelEnv) => DuelGame

export type DuelInfo = { id: string; name: string; emoji: string; color: string; how: string; factory: () => Promise<DuelFactory> }

/**
 * Text meant for `player`, readable from their side: upside down for player 1 on a shared phone,
 * and hidden from the other player online (pass -1 for text everyone should read).
 */
export function label(g: CanvasRenderingContext2D, view: View, player: Player | -1, s: string, x: number, y: number, size: number, color = '#fff7e8', weight = 800): void {
  if (view !== 'local' && player !== -1 && player !== view) return
  // The guest's whole canvas is already turned 180°, so its text needs turning back.
  const flip = (view === 'local' && player === 1) || view === 1
  g.save()
  g.translate(x, y)
  if (flip) g.rotate(Math.PI)
  text(g, s, 0, 0, size, color, 'center', weight)
  g.restore()
}

/** On a shared phone, the same label for both players: one upright near the bottom, one flipped near the top. */
export function bothLabels(g: CanvasRenderingContext2D, view: View, s: string, offset: number, size: number, color = '#fff7e8'): void {
  if (view === 'local') {
    label(g, view, 0, s, W / 2, H / 2 + offset, size, color)
    label(g, view, 1, s, W / 2, H / 2 - offset, size, color)
  } else label(g, view, view, s, W / 2, H / 2 + (view === 0 ? offset : -offset), size, color)
}

export const PLAYER_COLORS = ['#ffd35c', '#ff5f7e'] as const

/** Information both players should read (scores…): faces its owner on a shared phone, upright online. */
export const shared = (view: View, owner: Player): Player | -1 => (view === 'local' ? owner : -1)
