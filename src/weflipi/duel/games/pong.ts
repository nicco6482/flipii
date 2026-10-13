// Pong 1 vs 1: drag your paddle left and right. Every hit speeds the ball up, and where it hits the
// paddle sets the angle (the edges send it flying sideways). First to 7 points.
import { H, rrect, W } from '../../engine'
import { bothLabels, label, PLAYER_COLORS, shared, type DuelFactory, type Player } from '../core'

const POINTS_TO_WIN = 7
const PADDLE = { w: 96, h: 16, y: 70 } // distance of each paddle from its end
const R = 11
const START_SPEED = 430
const MAX_SPEED = 1300

type State = { x: number; y: number; vx: number; vy: number; p: [number, number]; score: [number, number]; pause: number; flash: number; who: number; over: number; hits: number }

export const pongDuel: DuelFactory = env => {
  let s: State = { x: W / 2, y: H / 2, vx: 0, vy: 0, p: [W / 2, W / 2], score: [0, 0], pause: 0.8, flash: 0, who: -1, over: -1, hits: 0 }
  const paddleY = (p: Player) => (p === 0 ? H - PADDLE.y : PADDLE.y)

  const serve = (towards: Player) => {
    const a = (Math.random() - 0.5) * 0.8
    s.x = W / 2
    s.y = H / 2
    s.vx = Math.sin(a) * START_SPEED
    s.vy = (towards === 0 ? 1 : -1) * Math.cos(a) * START_SPEED
    s.pause = 0.9
    s.hits = 0
  }
  serve(Math.random() < 0.5 ? 0 : 1)

  const point = (scorer: Player) => {
    s.score[scorer] += 1
    s.flash = 1
    s.who = scorer
    env.sfx.tone(scorer === 0 ? 660 : 520, 200, 'triangle', 0.08)
    env.fx.burst(s.x, s.y < H / 2 ? 30 : H - 30, PLAYER_COLORS[scorer], 36, 380)
    env.fx.shake(0.4)
    env.fx.vibrate(70)
    if (s.score[scorer] >= POINTS_TO_WIN) s.over = scorer
    else serve(scorer === 0 ? 1 : 0)
  }

  return {
    bg: '#120f2e',
    update(dt, inputs) {
      s.flash = Math.max(0, s.flash - dt)
      if (s.over >= 0) return
      for (const p of [0, 1] as Player[]) {
        const inp = inputs[p]
        if (!inp.active) continue
        const target = Math.max(PADDLE.w / 2 + 8, Math.min(W - PADDLE.w / 2 - 8, inp.x))
        s.p[p] += (target - s.p[p]) * Math.min(1, dt * 22)
      }
      if (s.pause > 0) {
        s.pause -= dt
        return
      }
      const steps = 4
      for (let k = 0; k < steps; k += 1) {
        const h = dt / steps
        s.x += s.vx * h
        s.y += s.vy * h
        if (s.x < R + 6) {
          s.x = R + 6
          s.vx = Math.abs(s.vx)
          env.sfx.tone(260, 25, 'square', 0.03)
        }
        if (s.x > W - R - 6) {
          s.x = W - R - 6
          s.vx = -Math.abs(s.vx)
          env.sfx.tone(260, 25, 'square', 0.03)
        }
        for (const p of [0, 1] as Player[]) {
          const py = paddleY(p)
          const toward = p === 0 ? s.vy > 0 : s.vy < 0
          const inBand = p === 0 ? s.y + R >= py - PADDLE.h / 2 && s.y < py + PADDLE.h : s.y - R <= py + PADDLE.h / 2 && s.y > py - PADDLE.h
          if (!toward || !inBand || Math.abs(s.x - s.p[p]) > PADDLE.w / 2 + R) continue
          // Hit: angle from where it lands on the paddle, a little faster every time.
          const off = Math.max(-1, Math.min(1, (s.x - s.p[p]) / (PADDLE.w / 2)))
          const speed = Math.min(MAX_SPEED, Math.hypot(s.vx, s.vy) * 1.07 + 10)
          const a = off * 1.05
          s.vx = Math.sin(a) * speed
          s.vy = (p === 0 ? -1 : 1) * Math.cos(a) * speed
          s.y = p === 0 ? py - PADDLE.h / 2 - R : py + PADDLE.h / 2 + R
          s.hits += 1
          env.sfx.tone(440 + Math.min(500, speed / 3), 40, 'square', 0.06)
          env.fx.burst(s.x, s.y, PLAYER_COLORS[p], 8, 160)
          if (speed > 950) env.fx.shake(0.25)
          env.fx.vibrate(10)
        }
        if (s.y < -R) return point(0)
        if (s.y > H + R) return point(1)
      }
    },
    snapshot: () => s,
    load(state) {
      s = state as State
    },
    result: () => (s.over >= 0 ? { winner: s.over as Player, scores: [s.score[0], s.score[1]] } : null),
    draw(g, view) {
      g.fillStyle = '#120f2e'
      g.fillRect(0, 0, W, H)
      g.strokeStyle = 'rgba(126,249,255,0.35)'
      g.setLineDash([12, 12])
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(0, H / 2)
      g.lineTo(W, H / 2)
      g.stroke()
      g.setLineDash([])
      g.fillStyle = 'rgba(255,255,255,0.08)'
      g.fillRect(0, 0, 6, H)
      g.fillRect(W - 6, 0, 6, H)
      label(g, view, shared(view, 0), String(s.score[0]), W / 2, H / 2 + 70, 72, 'rgba(255,211,92,0.35)')
      label(g, view, shared(view, 1), String(s.score[1]), W / 2, H / 2 - 70, 72, 'rgba(255,95,126,0.35)')
      for (const p of [0, 1] as Player[]) {
        g.fillStyle = PLAYER_COLORS[p]
        g.strokeStyle = '#1b1838'
        g.lineWidth = 3
        rrect(g, s.p[p] - PADDLE.w / 2, paddleY(p) - PADDLE.h / 2, PADDLE.w, PADDLE.h, 8)
        g.fill()
        g.stroke()
      }
      // Ball with a speed trail.
      const sp = Math.hypot(s.vx, s.vy)
      for (let i = 4; i >= 1; i -= 1) {
        g.fillStyle = `rgba(126,249,255,${0.08 * (5 - i)})`
        g.beginPath()
        g.arc(s.x - (s.vx / sp || 0) * i * 9, s.y - (s.vy / sp || 0) * i * 9, R * (1 - i * 0.12), 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#fff7e8'
      g.beginPath()
      g.arc(s.x, s.y, R, 0, Math.PI * 2)
      g.fill()
      if (s.flash > 0) bothLabels(g, view, s.who === 0 ? '¡Punto amarillo!' : '¡Punto rojo!', 150, 28, PLAYER_COLORS[s.who])
    },
  }
}
