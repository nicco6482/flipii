// Billar: 90 seconds to pot as many balls as you can. Drag back from anywhere to aim and set the
// power (slingshot), let go to strike the white. Real ball-to-ball collisions (equal masses),
// cushion bounces and rolling friction; the guide shows where the first ball you hit will go.
// Potted ball = 1 point (+1 per extra ball in the same shot); pot the white and you lose 1.
// Clear the table and a new rack drops in for a +3 bonus.
import { H, W, rrect, text, type Factory } from '../engine'

const TIME = 90
const T = { x: 34, y: 70, w: W - 68, h: H - 150 } // playing surface (inside the cushions)
const R = 11
const POCKET_R = 21
const MAX_PULL = 170
const MAX_SPEED = 1500
const FRICTION = 190 // px/s² rolling deceleration
const COLORS = ['#ffd35c', '#3d7bff', '#ff2d55', '#a77bff', '#ff9f43', '#2bd47d', '#8b2c2c', '#1b1838', '#ffd35c', '#3d7bff']

type Ball = { x: number; y: number; vx: number; vy: number; n: number; in: boolean; sink: number; english: number }

const POCKETS: [number, number][] = [
  [T.x, T.y],
  [T.x + T.w, T.y],
  [T.x - 4, T.y + T.h / 2],
  [T.x + T.w + 4, T.y + T.h / 2],
  [T.x, T.y + T.h],
  [T.x + T.w, T.y + T.h],
]

export const billar: Factory = env => {
  let t = TIME
  let started = false
  let score = 0
  let racks = 0
  let balls: Ball[] = []
  let cue: Ball = { x: W / 2, y: T.y + T.h * 0.78, vx: 0, vy: 0, n: 0, in: false, sink: 0, english: 0 }
  let aiming = false
  let ax = 0
  let ay = 0
  let px = 0
  let py = 0
  let shotPotted = 0
  let shooting = false
  let msg = ''
  let msgT = 0

  const rack = () => {
    racks += 1
    balls = []
    const top = T.y + T.h * 0.24
    let n = 1
    for (let row = 0; row < 4; row += 1)
      for (let i = 0; i <= row; i += 1) balls.push({ x: W / 2 + (i - row / 2) * (R * 2 + 1), y: top - row * (R * 1.75 + 1), vx: 0, vy: 0, n: n++, in: false, sink: 0, english: 0 })
    // A little random jitter so no two breaks are identical.
    for (const b of balls) {
      b.x += (env.rand() - 0.5) * 0.6
      b.y += (env.rand() - 0.5) * 0.6
    }
  }
  rack()

  const all = () => [cue, ...balls]
  const moving = () => all().some(b => !b.in && Math.hypot(b.vx, b.vy) > 3)

  const collide = (a: Ball, b: Ball) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.hypot(dx, dy)
    if (d >= R * 2 || d === 0) return
    const nx = dx / d
    const ny = dy / d
    const overlap = R * 2 - d
    a.x -= (nx * overlap) / 2
    a.y -= (ny * overlap) / 2
    b.x += (nx * overlap) / 2
    b.y += (ny * overlap) / 2
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
    if (rel <= 0) return
    // Equal masses, nearly elastic: swap the normal components.
    const j = rel * 0.97
    a.vx -= j * nx
    a.vy -= j * ny
    b.vx += j * nx
    b.vy += j * ny
    if (rel > 120) {
      env.sfx.tone(900 + Math.random() * 200, 25, 'square', Math.min(0.08, rel / 12000))
      if (rel > 700) env.fx.shake(0.15)
    }
  }

  const cushions = (b: Ball) => {
    const nearPocket = POCKETS.some(([x, y]) => Math.hypot(b.x - x, b.y - y) < POCKET_R + 6)
    if (nearPocket) return
    if (b.x < T.x + R) {
      b.x = T.x + R
      b.vx = Math.abs(b.vx) * 0.82
    }
    if (b.x > T.x + T.w - R) {
      b.x = T.x + T.w - R
      b.vx = -Math.abs(b.vx) * 0.82
    }
    if (b.y < T.y + R) {
      b.y = T.y + R
      b.vy = Math.abs(b.vy) * 0.82
    }
    if (b.y > T.y + T.h - R) {
      b.y = T.y + T.h - R
      b.vy = -Math.abs(b.vy) * 0.82
    }
  }

  const pockets = (b: Ball) => {
    for (const [x, y] of POCKETS) {
      if (Math.hypot(b.x - x, b.y - y) < POCKET_R - 2) {
        b.in = true
        b.sink = 1
        b.vx = (x - b.x) * 6
        b.vy = (y - b.y) * 6
        env.sfx.tone(180, 120, 'sine', 0.08, -80)
        if (b === cue) {
          score = Math.max(0, score - 1)
          env.score(score)
          msg = '¡Blanca dentro! −1'
          msgT = 1.3
          env.fx.vibrate(80)
        } else {
          shotPotted += 1
          const pts = shotPotted
          score += pts
          env.score(score)
          env.fx.burst(x, y, COLORS[(b.n - 1) % COLORS.length], 22, 260)
          env.fx.pop(x < W / 2 ? x + 40 : x - 40, y, `+${pts}`)
          env.fx.vibrate(25)
        }
        return
      }
    }
  }

  // Where the white first hits a ball along the aim line, and where that ball would go.
  const guide = (dx: number, dy: number) => {
    let best: { t: number; ball: Ball } | null = null
    for (const b of balls) {
      if (b.in) continue
      const fx = cue.x - b.x
      const fy = cue.y - b.y
      const bq = fx * dx + fy * dy
      const c = fx * fx + fy * fy - 4 * R * R
      const disc = bq * bq - c
      if (disc < 0) continue
      const tt = -bq - Math.sqrt(disc)
      if (tt > 0 && (!best || tt < best.t)) best = { t: tt, ball: b }
    }
    return best
  }

  return {
    bg: '#2a1a12',
    update(dt) {
      msgT = Math.max(0, msgT - dt)
      if (!started) return
      t -= dt
      const steps = 8
      for (let s = 0; s < steps; s += 1) {
        const h = dt / steps
        for (const b of all()) {
          if (b.in) {
            b.sink = Math.max(0, b.sink - h * 3)
            b.x += b.vx * h
            b.y += b.vy * h
            b.vx *= 0.9
            b.vy *= 0.9
            continue
          }
          b.x += b.vx * h
          b.y += b.vy * h
          if (b === cue && Math.abs(b.english) > 0.01) {
            // Side spin bends the cue ball during the first part of its travel, then fades.
            b.vx += b.english * 210 * h
            b.english *= Math.exp(-3.2 * h)
          }
          const sp = Math.hypot(b.vx, b.vy)
          if (sp > 0) {
            const ns = Math.max(0, sp - FRICTION * h)
            b.vx *= ns / sp
            b.vy *= ns / sp
          }
        }
        const live = all().filter(b => !b.in)
        for (let i = 0; i < live.length; i += 1) for (let j = i + 1; j < live.length; j += 1) collide(live[i], live[j])
        for (const b of live) {
          cushions(b)
          pockets(b)
        }
      }
      if (shooting && !moving()) {
        shooting = false
        if (shotPotted >= 2) {
          msg = `¡Combo ×${shotPotted}!`
          msgT = 1.3
        }
        shotPotted = 0
        if (cue.in) cue = { x: W / 2, y: T.y + T.h * 0.78, vx: 0, vy: 0, n: 0, in: false, sink: 0, english: 0 }
        if (balls.every(b => b.in)) {
          score += 3
          env.score(score)
          msg = '¡Mesa limpia! +3'
          msgT = 1.5
          env.fx.burst(W / 2, H / 2, undefined, 60, 420)
          env.fx.shake(0.5)
          rack()
        }
      }
      if (t <= 0 && !shooting) env.end(score)
      else if (t <= -6) env.end(score)
    },
    down(x, y) {
      if (shooting || moving()) return
      started = true
      aiming = true
      ax = px = x
      ay = py = y
    },
    move(x, y) {
      if (!aiming) return
      px = x
      py = y
    },
    up(x, y) {
      if (!aiming) return
      aiming = false
      let dx = ax - x
      let dy = ay - y
      let len = Math.hypot(dx, dy)
      // Plain tap (keyboard / click): a firm shot straight up the table.
      if (len < 10) {
        dx = 0
        dy = -1
        len = 1
        ax = cue.x
        ay = cue.y
        x = cue.x
        y = cue.y + MAX_PULL * 0.75
      }
      const power = Math.min(Math.hypot(ax - x, ay - y), MAX_PULL) / MAX_PULL
      cue.english = Math.max(-1, Math.min(1, (ax - cue.x) / (R * 1.6)))
      cue.vx = (dx / len) * power * MAX_SPEED
      cue.vy = (dy / len) * power * MAX_SPEED
      shooting = true
      shotPotted = 0
      env.sfx.tone(260 + power * 300, 40, 'square', 0.07)
      env.fx.vibrate(15)
    },
    draw(g) {
      // Wooden frame, cushions, felt.
      g.fillStyle = '#5a3720'
      rrect(g, T.x - 26, T.y - 26, T.w + 52, T.h + 52, 22)
      g.fill()
      g.fillStyle = '#7a4a28'
      rrect(g, T.x - 20, T.y - 20, T.w + 40, T.h + 40, 18)
      g.fill()
      g.fillStyle = '#0e5f3a'
      g.fillRect(T.x - 8, T.y - 8, T.w + 16, T.h + 16)
      const felt = g.createRadialGradient(W / 2, T.y + T.h / 2, 20, W / 2, T.y + T.h / 2, T.h * 0.7)
      felt.addColorStop(0, '#1fa463')
      felt.addColorStop(1, '#127a47')
      g.fillStyle = felt
      g.fillRect(T.x, T.y, T.w, T.h)
      g.fillStyle = '#fff7e8'
      for (const [dx, dy] of [[0.25, -0.02], [0.5, -0.02], [0.75, -0.02], [0.25, 1.02], [0.5, 1.02], [0.75, 1.02]]) {
        g.beginPath()
        g.arc(T.x + T.w * dx, T.y + T.h * dy + (dy < 0 ? -6 : 6), 2.5, 0, Math.PI * 2)
        g.fill()
      }
      g.strokeStyle = 'rgba(255,255,255,0.25)'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(T.x, T.y + T.h * 0.72)
      g.lineTo(T.x + T.w, T.y + T.h * 0.72)
      g.stroke()
      for (const [x, y] of POCKETS) {
        g.fillStyle = '#0a0a0a'
        g.beginPath()
        g.arc(x, y, POCKET_R, 0, Math.PI * 2)
        g.fill()
      }
      // Aim guide.
      if (aiming) {
        let dx = ax - px
        let dy = ay - py
        const len = Math.hypot(dx, dy)
        if (len > 6) {
          dx /= len
          dy /= len
          const power = Math.min(len, MAX_PULL) / MAX_PULL
          const hit = guide(dx, dy)
          const reach = hit ? hit.t : 900
          g.strokeStyle = 'rgba(255,255,255,0.7)'
          g.setLineDash([6, 6])
          g.lineWidth = 2
          g.beginPath()
          g.moveTo(cue.x, cue.y)
          g.lineTo(cue.x + dx * reach, cue.y + dy * reach)
          g.stroke()
          g.setLineDash([])
          if (hit) {
            const gx = cue.x + dx * hit.t
            const gy = cue.y + dy * hit.t
            g.strokeStyle = 'rgba(255,255,255,0.8)'
            g.beginPath()
            g.arc(gx, gy, R, 0, Math.PI * 2)
            g.stroke()
            const nx = (hit.ball.x - gx) / (R * 2)
            const ny = (hit.ball.y - gy) / (R * 2)
            g.strokeStyle = '#ffd35c'
            g.lineWidth = 3
            g.beginPath()
            g.moveTo(hit.ball.x, hit.ball.y)
            g.lineTo(hit.ball.x + nx * 90, hit.ball.y + ny * 90)
            g.stroke()
          }
          // Cue stick pulled back.
          g.save()
          g.translate(cue.x, cue.y)
          g.rotate(Math.atan2(dy, dx))
          const back = 18 + power * 70
          g.fillStyle = '#e6c08a'
          g.strokeStyle = '#1b1838'
          g.lineWidth = 2
          g.beginPath()
          g.moveTo(-back, -3)
          g.lineTo(-back - 230, -6)
          g.lineTo(-back - 230, 6)
          g.lineTo(-back, 3)
          g.closePath()
          g.fill()
          g.stroke()
          g.fillStyle = '#3d7bff'
          g.fillRect(-back - 4, -3, 4, 6)
          g.restore()
          // Power bar.
          g.fillStyle = 'rgba(0,0,0,0.4)'
          rrect(g, T.x + 10, T.y + T.h + 34, T.w - 20, 12, 6)
          g.fill()
          g.fillStyle = `hsl(${120 - power * 120}, 90%, 55%)`
          rrect(g, T.x + 10, T.y + T.h + 34, (T.w - 20) * power, 12, 6)
          g.fill()
          if (Math.abs(cue.english) > 0.08) text(g, cue.english < 0 ? '← Efecto' : 'Efecto →', W / 2, T.y + T.h + 58, 15, '#7ef9ff', 'center', 800)
        }
      }
      // Balls.
      const drawBall = (b: Ball) => {
        const r = b.in ? R * b.sink : R
        if (r <= 0.5) return
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.beginPath()
        g.arc(b.x + 2, b.y + 3, r, 0, Math.PI * 2)
        g.fill()
        const color = b.n === 0 ? '#fffdf5' : COLORS[(b.n - 1) % COLORS.length]
        const grd = g.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r)
        grd.addColorStop(0, '#ffffff')
        grd.addColorStop(0.35, color)
        grd.addColorStop(1, color)
        g.fillStyle = grd
        g.strokeStyle = 'rgba(0,0,0,0.6)'
        g.lineWidth = 1.5
        g.beginPath()
        g.arc(b.x, b.y, r, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        if (b.n > 0 && r > 6) {
          g.fillStyle = '#fff'
          g.beginPath()
          g.arc(b.x, b.y, r * 0.48, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = '#1b1838'
          g.font = `800 ${Math.round(r * 0.75)}px Sora, system-ui, sans-serif`
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(String(b.n), b.x, b.y + 0.5)
        }
      }
      for (const b of balls) drawBall(b)
      drawBall(cue)
      // HUD.
      text(g, String(score), 70, 30, 30, '#ffd35c')
      text(g, `${Math.max(0, Math.ceil(t))} s`, W - 70, 30, 22, t < 10 ? '#ff5f7e' : '#fff7e8')
      text(g, `Mesa ${racks}`, W / 2, 30, 16, '#7ef9ff', 'center', 800)
      if (msgT > 0) text(g, msg, W / 2, T.y + T.h / 2, 30, '#ffd35c')
      else if (!started) text(g, 'Arrastra hacia atrás y suelta', W / 2, T.y + T.h * 0.55, 20)
    },
  }
}
