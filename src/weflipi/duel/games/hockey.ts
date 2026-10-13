// Hockey 1 vs 1: each player drags a mallet in their own half. First to 7 goals wins (or whoever
// leads after 3 minutes; a tie at the bell goes to golden goal).
import { H, rrect, W } from '../../engine'
import { bothLabels, label, PLAYER_COLORS, shared, type DuelFactory, type Player } from '../core'

const GOALS_TO_WIN = 7
const TIME = 180
const RINK = { x: 18, y: 40, w: W - 36, h: H - 80 }
const MID = RINK.y + RINK.h / 2
const GOAL_W = 150
const PUCK_R = 18
const MALLET_R = 32
const MAX_PUCK = 1500

type Body = { x: number; y: number; vx: number; vy: number }
type State = { puck: Body; m: [Body, Body]; score: [number, number]; t: number; pause: number; flash: number; who: number; over: number }

export const hockeyDuel: DuelFactory = env => {
  let s: State = {
    puck: { x: W / 2, y: MID + 80, vx: 0, vy: 0 },
    m: [
      { x: W / 2, y: RINK.y + RINK.h - 80, vx: 0, vy: 0 },
      { x: W / 2, y: RINK.y + 80, vx: 0, vy: 0 },
    ],
    score: [0, 0],
    t: TIME,
    pause: 0,
    flash: 0,
    who: -1,
    over: -1,
  }

  const serve = (to: Player) => {
    s.puck = { x: W / 2, y: to === 0 ? MID + 80 : MID - 80, vx: 0, vy: 0 }
    s.pause = 0.9
  }

  const moveMallet = (p: Player, tx: number, ty: number, dt: number) => {
    const m = s.m[p]
    const minY = p === 0 ? MID + MALLET_R : RINK.y + MALLET_R
    const maxY = p === 0 ? RINK.y + RINK.h - MALLET_R : MID - MALLET_R
    tx = Math.max(RINK.x + MALLET_R, Math.min(RINK.x + RINK.w - MALLET_R, tx))
    ty = Math.max(minY, Math.min(maxY, ty))
    let dx = tx - m.x
    let dy = ty - m.y
    const d = Math.hypot(dx, dy)
    const max = 2600 * dt
    if (d > max) {
      dx *= max / d
      dy *= max / d
    }
    m.vx = dt > 0 ? dx / dt : 0
    m.vy = dt > 0 ? dy / dt : 0
    m.x += dx
    m.y += dy
  }

  const hit = (m: Body) => {
    const p = s.puck
    const dx = p.x - m.x
    const dy = p.y - m.y
    const d = Math.hypot(dx, dy)
    const min = PUCK_R + MALLET_R
    if (d >= min || d === 0) return
    const nx = dx / d
    const ny = dy / d
    p.x = m.x + nx * min
    p.y = m.y + ny * min
    const rvx = p.vx - m.vx
    const rvy = p.vy - m.vy
    const dot = rvx * nx + rvy * ny
    if (dot >= 0) return
    p.vx = rvx - 1.9 * dot * nx + m.vx
    p.vy = rvy - 1.9 * dot * ny + m.vy
    const sp = Math.hypot(p.vx, p.vy)
    if (sp > MAX_PUCK) {
      p.vx *= MAX_PUCK / sp
      p.vy *= MAX_PUCK / sp
    }
    env.sfx.tone(300 + Math.min(600, sp / 3), 35, 'square', 0.05)
    if (sp > 900) env.fx.shake(0.35)
  }

  const goal = (scorer: Player) => {
    s.score[scorer] += 1
    s.flash = 1.2
    s.who = scorer
    env.sfx.tone(880, 220, 'triangle', 0.09)
    env.fx.burst(W / 2, scorer === 0 ? RINK.y + 10 : RINK.y + RINK.h - 10, PLAYER_COLORS[scorer], 45, 420)
    env.fx.shake(0.5)
    env.fx.vibrate(80)
    if (s.score[scorer] >= GOALS_TO_WIN) s.over = scorer
    serve(scorer === 0 ? 1 : 0)
  }

  return {
    bg: '#0b1f3a',
    update(dt, inputs) {
      s.flash = Math.max(0, s.flash - dt)
      if (s.over >= 0) return
      s.t -= dt
      if (s.t <= 0 && s.score[0] !== s.score[1]) {
        s.over = s.score[0] > s.score[1] ? 0 : 1
        return
      }
      const steps = 6
      for (let k = 0; k < steps; k += 1) {
        const h = dt / steps
        for (const p of [0, 1] as Player[]) {
          const inp = inputs[p]
          const m = s.m[p]
          moveMallet(p, inp.active ? inp.x : m.x, inp.active ? inp.y : m.y, h)
        }
        if (s.pause > 0) continue
        const pk = s.puck
        pk.x += pk.vx * h
        pk.y += pk.vy * h
        const drag = Math.exp(-0.25 * h)
        pk.vx *= drag
        pk.vy *= drag
        if (pk.x < RINK.x + PUCK_R) {
          pk.x = RINK.x + PUCK_R
          pk.vx = Math.abs(pk.vx) * 0.9
        }
        if (pk.x > RINK.x + RINK.w - PUCK_R) {
          pk.x = RINK.x + RINK.w - PUCK_R
          pk.vx = -Math.abs(pk.vx) * 0.9
        }
        const mouth = Math.abs(pk.x - W / 2) < GOAL_W / 2 - 4
        if (pk.y < RINK.y + PUCK_R) {
          if (mouth) return goal(0)
          pk.y = RINK.y + PUCK_R
          pk.vy = Math.abs(pk.vy) * 0.9
        }
        if (pk.y > RINK.y + RINK.h - PUCK_R) {
          if (mouth) return goal(1)
          pk.y = RINK.y + RINK.h - PUCK_R
          pk.vy = -Math.abs(pk.vy) * 0.9
        }
        hit(s.m[0])
        hit(s.m[1])
      }
      if (s.pause > 0) s.pause -= dt
    },
    snapshot: () => s,
    load(state) {
      s = state as State
    },
    result: () => (s.over >= 0 ? { winner: s.over as Player, scores: [s.score[0], s.score[1]] } : null),
    draw(g, view) {
      g.fillStyle = '#e9f4ff'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 6
      rrect(g, RINK.x, RINK.y, RINK.w, RINK.h, 30)
      g.fill()
      g.stroke()
      g.strokeStyle = '#ff5f7e'
      g.lineWidth = 4
      g.beginPath()
      g.moveTo(RINK.x, MID)
      g.lineTo(RINK.x + RINK.w, MID)
      g.stroke()
      g.strokeStyle = '#5b8cff'
      g.lineWidth = 3
      for (const [cy, a0, a1] of [[MID, 0, Math.PI * 2], [RINK.y, 0, Math.PI], [RINK.y + RINK.h, Math.PI, 0]] as const) {
        g.beginPath()
        g.arc(W / 2, cy, cy === MID ? 60 : 80, a0, a1)
        g.stroke()
      }
      g.fillStyle = PLAYER_COLORS[1]
      g.fillRect(W / 2 - GOAL_W / 2, RINK.y - 8, GOAL_W, 12)
      g.fillStyle = PLAYER_COLORS[0]
      g.fillRect(W / 2 - GOAL_W / 2, RINK.y + RINK.h - 4, GOAL_W, 12)
      const pk = s.puck
      g.fillStyle = '#1b1838'
      g.beginPath()
      g.arc(pk.x, pk.y, PUCK_R, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#7ef9ff'
      g.lineWidth = 3
      g.beginPath()
      g.arc(pk.x, pk.y, PUCK_R - 6, 0, Math.PI * 2)
      g.stroke()
      s.m.forEach((m, i) => {
        g.fillStyle = 'rgba(0,0,0,0.18)'
        g.beginPath()
        g.arc(m.x + 4, m.y + 6, MALLET_R, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = PLAYER_COLORS[i]
        g.strokeStyle = '#1b1838'
        g.lineWidth = 4
        g.beginPath()
        g.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = 'rgba(255,255,255,0.5)'
        g.beginPath()
        g.arc(m.x, m.y, MALLET_R * 0.45, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      })
      // Scores on each side of the centre line, facing their owner.
      label(g, view, shared(view, 0), `${s.score[0]}`, RINK.x + 40, MID + 40, 40, PLAYER_COLORS[0])
      label(g, view, shared(view, 1), `${s.score[1]}`, RINK.x + RINK.w - 40, MID - 40, 40, PLAYER_COLORS[1])
      label(g, view, -1, `${Math.max(0, Math.ceil(s.t))}`, RINK.x + RINK.w - 30, MID + 22, 16, '#5b8cff')
      if (s.flash > 0) bothLabels(g, view, s.who === 0 ? '¡Gol amarillo!' : '¡Gol rojo!', 120, 34, PLAYER_COLORS[s.who])
      if (s.t <= 0 && s.over < 0) bothLabels(g, view, '¡Gol de oro!', 170, 24, '#7ef9ff')
    },
  }
}
