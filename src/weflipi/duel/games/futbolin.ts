// Futbolín 1 vs 1: yellow (bottom) against red (top). Slide your finger to move all your rods;
// every new touch is a kick from your rods. First to 5 goals, or whoever leads after 3 minutes.
import { H, rrect, W } from '../../engine'
import { bothLabels, label, PLAYER_COLORS, shared, type DuelFactory, type Player } from '../core'

const GOALS_TO_WIN = 5
const TIME = 180
const F = { x: 30, y: 40, w: W - 60, h: H - 80 }
const GOAL_W = 120
const BALL_R = 10
const FOOT = { w: 22, h: 14 }
const KICK_TIME = 0.18
const MAX_BALL = 1400

// Bottom (player 0's goal) to top: owner, players per rod, spacing.
const LAYOUT: [Player, number, number][] = [
  [0, 1, 0],
  [0, 2, 110],
  [1, 3, 95],
  [0, 5, 62],
  [1, 5, 62],
  [0, 3, 95],
  [1, 2, 110],
  [1, 1, 0],
]

type Rod = { y: number; n: number; gap: number; owner: Player; off: number; kick: number }
type State = { ball: { x: number; y: number; vx: number; vy: number }; rods: Rod[]; score: [number, number]; t: number; pause: number; flash: number; who: number; over: number; still: number }

export const futbolinDuel: DuelFactory = env => {
  let s: State = {
    ball: { x: W / 2, y: F.y + F.h / 2, vx: 0, vy: 0 },
    rods: LAYOUT.map(([owner, n, gap], i) => ({ y: F.y + F.h - 36 - (i * (F.h - 72)) / (LAYOUT.length - 1), n, gap, owner, off: 0, kick: 0 })),
    score: [0, 0],
    t: TIME,
    pause: 0,
    flash: 0,
    who: -1,
    over: -1,
    still: 0,
  }
  const lastDowns = [0, 0]

  const feet = (r: Rod) => Array.from({ length: r.n }, (_, i) => W / 2 + r.off + (i - (r.n - 1) / 2) * r.gap)
  const maxOff = (r: Rod) => F.w / 2 - FOOT.w / 2 - 6 - ((r.n - 1) * r.gap) / 2

  const serve = (towards: Player) => {
    s.ball = { x: W / 2 + (Math.random() - 0.5) * 60, y: F.y + F.h / 2, vx: (Math.random() - 0.5) * 200, vy: towards === 0 ? 150 : -150 }
    s.pause = 0.9
  }
  serve(Math.random() < 0.5 ? 0 : 1)

  const hitFoot = (r: Rod, fx: number) => {
    const b = s.ball
    const cx = Math.max(fx - FOOT.w / 2, Math.min(b.x, fx + FOOT.w / 2))
    const cy = Math.max(r.y - FOOT.h / 2, Math.min(b.y, r.y + FOOT.h / 2))
    const dx = b.x - cx
    const dy = b.y - cy
    const d = Math.hypot(dx, dy)
    if (d >= BALL_R) return
    const nx = d === 0 ? 0 : dx / d
    const ny = d === 0 ? (r.owner === 0 ? -1 : 1) : dy / d
    b.x = cx + nx * BALL_R
    b.y = cy + ny * BALL_R
    const dot = b.vx * nx + b.vy * ny
    if (dot < 0) {
      b.vx -= 1.75 * dot * nx
      b.vy -= 1.75 * dot * ny
    }
    if (r.kick > 0) {
      const off = (b.x - fx) / (FOOT.w / 2)
      b.vy = (r.owner === 0 ? -1 : 1) * (950 + Math.random() * 150)
      b.vx += off * 380
      r.kick = 0
      env.sfx.tone(140, 60, 'square', 0.08)
      env.fx.shake(0.25)
      env.fx.vibrate(15)
    }
    const sp = Math.hypot(b.vx, b.vy)
    if (sp > MAX_BALL) {
      b.vx *= MAX_BALL / sp
      b.vy *= MAX_BALL / sp
    }
  }

  const goal = (scorer: Player) => {
    s.score[scorer] += 1
    s.flash = 1.2
    s.who = scorer
    env.sfx.tone(880, 220, 'triangle', 0.09)
    env.fx.burst(W / 2, scorer === 0 ? F.y + 10 : F.y + F.h - 10, PLAYER_COLORS[scorer], 45, 420)
    env.fx.shake(0.5)
    env.fx.vibrate(80)
    if (s.score[scorer] >= GOALS_TO_WIN) s.over = scorer
    else serve(scorer === 0 ? 1 : 0)
  }

  return {
    bg: '#123a24',
    update(dt, inputs) {
      s.flash = Math.max(0, s.flash - dt)
      if (s.over >= 0) return
      s.t -= dt
      if (s.t <= 0 && s.score[0] !== s.score[1]) {
        s.over = s.score[0] > s.score[1] ? 0 : 1
        return
      }
      for (const p of [0, 1] as Player[]) {
        if (inputs[p].downs !== lastDowns[p]) {
          lastDowns[p] = inputs[p].downs
          for (const r of s.rods) if (r.owner === p) r.kick = KICK_TIME
          env.sfx.tone(220, 40, 'square', 0.04)
        }
      }
      for (const r of s.rods) {
        r.kick = Math.max(0, r.kick - dt)
        const inp = inputs[r.owner]
        const lim = maxOff(r)
        const want = Math.max(-lim, Math.min(lim, inp.x - W / 2))
        r.off += (want - r.off) * Math.min(1, dt * 18)
      }
      if (s.pause > 0) {
        s.pause -= dt
        return
      }
      const b = s.ball
      const steps = 6
      for (let k = 0; k < steps; k += 1) {
        const h = dt / steps
        b.x += b.vx * h
        b.y += b.vy * h
        const drag = Math.exp(-0.35 * h)
        b.vx *= drag
        b.vy *= drag
        if (b.x < F.x + BALL_R) {
          b.x = F.x + BALL_R
          b.vx = Math.abs(b.vx) * 0.85
        }
        if (b.x > F.x + F.w - BALL_R) {
          b.x = F.x + F.w - BALL_R
          b.vx = -Math.abs(b.vx) * 0.85
        }
        const mouth = Math.abs(b.x - W / 2) < GOAL_W / 2 - BALL_R
        if (b.y < F.y + BALL_R) {
          if (mouth) return goal(0)
          b.y = F.y + BALL_R
          b.vy = Math.abs(b.vy) * 0.85
        }
        if (b.y > F.y + F.h - BALL_R) {
          if (mouth) return goal(1)
          b.y = F.y + F.h - BALL_R
          b.vy = -Math.abs(b.vy) * 0.85
        }
        for (const r of s.rods) for (const x of feet(r)) hitFoot(r, x)
      }
      s.still = Math.hypot(b.vx, b.vy) < 25 ? s.still + dt : 0
      if (s.still > 1.5) {
        b.vx += (Math.random() - 0.5) * 300
        b.vy += (Math.random() - 0.5) * 300
        s.still = 0
      }
    },
    snapshot: () => s,
    load(state) {
      s = state as State
    },
    result: () => (s.over >= 0 ? { winner: s.over as Player, scores: [s.score[0], s.score[1]] } : null),
    draw(g, view) {
      g.fillStyle = '#3a2416'
      rrect(g, F.x - 22, F.y - 26, F.w + 44, F.h + 52, 20)
      g.fill()
      for (let i = 0; i < 10; i += 1) {
        g.fillStyle = i % 2 ? '#2f9a4c' : '#34a653'
        g.fillRect(F.x, F.y + (i * F.h) / 10, F.w, F.h / 10 + 1)
      }
      g.strokeStyle = 'rgba(255,255,255,0.75)'
      g.lineWidth = 3
      g.strokeRect(F.x + 3, F.y + 3, F.w - 6, F.h - 6)
      g.beginPath()
      g.moveTo(F.x, F.y + F.h / 2)
      g.lineTo(F.x + F.w, F.y + F.h / 2)
      g.stroke()
      g.beginPath()
      g.arc(W / 2, F.y + F.h / 2, 46, 0, Math.PI * 2)
      g.stroke()
      g.fillStyle = PLAYER_COLORS[1]
      g.fillRect(W / 2 - GOAL_W / 2, F.y - 14, GOAL_W, 14)
      g.fillStyle = PLAYER_COLORS[0]
      g.fillRect(W / 2 - GOAL_W / 2, F.y + F.h, GOAL_W, 14)
      const b = s.ball
      g.fillStyle = 'rgba(0,0,0,0.3)'
      g.beginPath()
      g.ellipse(b.x + 3, b.y + 4, BALL_R, BALL_R * 0.8, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#fff'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 2
      g.beginPath()
      g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      for (const r of s.rods) {
        g.fillStyle = '#c9ced8'
        g.fillRect(F.x - 22, r.y - 3, F.w + 44, 6)
        const color = PLAYER_COLORS[r.owner]
        const swing = r.kick > 0 ? Math.sin((1 - r.kick / KICK_TIME) * Math.PI) : 0
        const dir = r.owner === 0 ? -1 : 1
        for (const x of feet(r)) {
          g.fillStyle = 'rgba(0,0,0,0.25)'
          g.beginPath()
          g.ellipse(x + 3, r.y + 4, 16, 11, 0, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = color
          g.strokeStyle = '#1b1838'
          g.lineWidth = 2.5
          rrect(g, x - FOOT.w / 2, r.y - FOOT.h / 2 + dir * swing * 12, FOOT.w, FOOT.h, 5)
          g.fill()
          g.stroke()
          g.beginPath()
          g.ellipse(x, r.y, 15, 10, 0, 0, Math.PI * 2)
          g.fill()
          g.stroke()
          g.fillStyle = '#f2c79b'
          g.beginPath()
          g.arc(x, r.y, 6, 0, Math.PI * 2)
          g.fill()
          g.stroke()
        }
      }
      label(g, view, shared(view, 0), String(s.score[0]), F.x + 26, F.y + F.h / 2 + 30, 34, PLAYER_COLORS[0])
      label(g, view, shared(view, 1), String(s.score[1]), F.x + F.w - 26, F.y + F.h / 2 - 30, 34, PLAYER_COLORS[1])
      if (s.flash > 0) bothLabels(g, view, s.who === 0 ? '¡Gol amarillo!' : '¡Gol rojo!', 150, 32, PLAYER_COLORS[s.who])
      if (s.t <= 0 && s.over < 0) bothLabels(g, view, '¡Gol de oro!', 200, 22, '#7ef9ff')
    },
  }
}
