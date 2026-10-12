// Basket: flick the ball up into the hoop. The ball flies "into" the screen (depth z: 0 = your
// hand, 1 = the hoop plane) under gravity, then bounces off the rim and the backboard for real.
// Swish = 3 points, any other basket = 2, and three in a row light you up 🔥 for double points.
// After 15 s the hoop starts sliding, faster and faster. 60 seconds.
import { H, W, rrect, text, type Factory } from '../engine'

const TIME = 60
const R = 34 // ball radius at your hand
const RIM_Y = 250
const RIM_HALF = 52 // rim half width in the hoop plane
const RIM_R = 5
const BOARD = { w: 190, h: 120, above: 96 } // backboard, centred on the hoop
const START = { x: W / 2, y: H - 110 }
const FLIGHT = 0.62 // seconds to reach the hoop plane
const G = 1500
const SCALE_AT_HOOP = 0.5

type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; touched: boolean; scored: boolean; live: boolean; above: boolean; over: boolean }

export const basket: Factory = env => {
  let t = TIME
  let clock = 0
  let started = false
  let score = 0
  let streak = 0
  let hoopX = W / 2
  let ball: Ball | null = null
  let drag: { x: number; y: number; t: number }[] = []
  let popText = ''
  let popT = 0
  let netT = 0
  let shake = 0

  const fresh = (): Ball => ({ x: START.x, y: START.y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, touched: false, scored: false, live: false, above: false, over: false })
  ball = fresh()

  const scaleOf = (z: number) => 1 - (1 - SCALE_AT_HOOP) * Math.min(1, z)
  const rimPoints = () => [hoopX - RIM_HALF, hoopX + RIM_HALF]

  const bounceOff = (b: Ball, px: number, py: number, radius: number, restitution: number) => {
    const dx = b.x - px
    const dy = b.y - py
    const d = Math.hypot(dx, dy)
    const min = radius
    if (d >= min || d === 0) return false
    const nx = dx / d
    const ny = dy / d
    b.x = px + nx * min
    b.y = py + ny * min
    const dot = b.vx * nx + b.vy * ny
    if (dot < 0) {
      b.vx -= (1 + restitution) * dot * nx
      b.vy -= (1 + restitution) * dot * ny
      b.spin += (b.vx * ny - b.vy * nx) * 0.01
    }
    return true
  }

  const step = (b: Ball, dt: number) => {
    b.vy += G * dt
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.spin += (b.vx / 60) * dt
    if (b.z < 1) {
      b.z = Math.min(1, b.z + b.vz * dt)
      return
    }
    // In the hoop plane: real collisions with the rim's two edges and the backboard.
    const r = R * SCALE_AT_HOOP
    for (const px of rimPoints()) {
      if (bounceOff(b, px, RIM_Y, r + RIM_R, 0.55)) {
        if (!b.touched) env.sfx.tone(260, 50, 'square', 0.05)
        b.touched = true
      }
    }
    const bl = hoopX - BOARD.w / 2
    const br = hoopX + BOARD.w / 2
    const bt = RIM_Y - BOARD.above
    // Backboard: bounces the ball back down in front of it (a bank shot).
    // Only a ball still rising hard when it reaches the hoop plane carries on into the board.
    if (b.x > bl - r && b.x < br + r && b.y > bt - r && b.y < RIM_Y - 6 && b.vy < -250 && !b.above) {
      b.vy = Math.abs(b.vy) * 0.35
      b.vx *= 0.7
      b.touched = true
      shake = 0.5
      env.sfx.tone(140, 70, 'square', 0.06)
      env.fx.vibrate(20)
    }
    if (b.y < RIM_Y - r) b.above = true
    // Thrown over the backboard: it's gone, no basket.
    if (b.y < bt - r && Math.abs(b.x - hoopX) < BOARD.w / 2 + r) b.over = true
    // Basket: crossing the rim line downward between the edges, having been above it.
    if (!b.scored && !b.over && b.above && b.vy > 0 && Math.abs(b.y - RIM_Y) < 12 && Math.abs(b.x - hoopX) < RIM_HALF - r * 0.4) {
      b.scored = true
      streak += 1
      const base = b.touched ? 2 : 3
      const pts = base * (streak >= 3 ? 2 : 1)
      score += pts
      env.score(score)
      popText = `${b.touched ? '' : '¡LIMPIA! '}+${pts}${streak >= 3 ? ' 🔥' : ''}`
      popT = 1.2
      netT = 0.6
      env.sfx.tone(b.touched ? 660 : 880, 140, 'triangle', 0.08)
      env.fx.burst(hoopX, RIM_Y + 20, b.touched ? '#ff9f43' : '#ffd35c', b.touched ? 18 : 36, 320)
      if (!b.touched) env.fx.shake(0.35)
      env.fx.vibrate(b.touched ? 25 : 60)
      if (!b.touched) setTimeout(() => env.sfx.tone(1175, 160, 'triangle', 0.07), 90)
    }
  }

  const throwBall = (vx: number, vy: number) => {
    if (!ball || ball.live) return
    started = true
    ball.live = true
    // Flick speed sets the arc; aim comes from the sideways part of the swipe.
    const power = Math.min(1.25, Math.max(0.55, -vy / 1700))
    ball.vy = -1050 * power
    ball.vx = Math.max(-420, Math.min(420, vx * 0.35))
    ball.vz = 1 / FLIGHT
    env.sfx.noise(80, 0.04)
    env.fx.vibrate(12)
  }

  return {
    bg: '#2a1a3d',
    update(dt) {
      popT = Math.max(0, popT - dt)
      netT = Math.max(0, netT - dt)
      shake = Math.max(0, shake - dt * 2)
      if (!started) return
      t -= dt
      clock += dt
      // The hoop starts moving after 15 s and keeps speeding up.
      if (clock > 15) {
        const k = Math.min(1, (clock - 15) / 40)
        const amp = 40 + 70 * k
        hoopX = W / 2 + Math.sin((clock - 15) * (0.8 + 1.8 * k)) * amp
      }
      if (ball?.live) {
        const sub = 4
        for (let i = 0; i < sub; i += 1) step(ball, dt / sub)
        if (ball.y > H + 80 || ball.x < -120 || ball.x > W + 120) {
          if (!ball.scored) {
            streak = 0
            popText = '¡FALLO!'
            popT = 0.7
            env.fx.vibrate(18)
          }
          ball = fresh()
        }
      }
      if (t <= 0) env.end(score)
    },
    down(x, y) {
      if (!ball || ball.live) return
      drag = [{ x, y, t: performance.now() }]
    },
    move(x, y) {
      if (!drag.length) return
      drag.push({ x, y, t: performance.now() })
      if (drag.length > 8) drag.shift()
    },
    up(x, y) {
      if (!drag.length) return
      const now = performance.now()
      drag.push({ x, y, t: now })
      const first = drag.find(p => now - p.t < 160) ?? drag[0]
      const dtm = Math.max(16, now - first.t) / 1000
      const vx = (x - first.x) / dtm
      const vy = (y - first.y) / dtm
      drag = []
      if (vy < -250) throwBall(vx, vy)
      // A plain tap (keyboard / mouse click) throws straight with a medium arc.
      else if (Math.hypot(x - first.x, y - first.y) < 8) throwBall(0, -1700)
    },
    draw(g) {
      g.save()
      if (shake > 0) g.translate(Math.sin(clock * 90) * shake * 4, 0)
      // Gym: wall, floor with perspective lines.
      const wall = g.createLinearGradient(0, 0, 0, H)
      wall.addColorStop(0, '#3b2457')
      wall.addColorStop(0.55, '#2a1a3d')
      wall.addColorStop(0.56, '#c98a4b')
      wall.addColorStop(1, '#8a5a2e')
      g.fillStyle = wall
      g.fillRect(-10, 0, W + 20, H)
      g.strokeStyle = 'rgba(0,0,0,0.18)'
      g.lineWidth = 2
      for (let i = -6; i <= 6; i += 1) {
        g.beginPath()
        g.moveTo(W / 2 + i * 22, H * 0.56)
        g.lineTo(W / 2 + i * 90, H)
        g.stroke()
      }
      g.strokeStyle = 'rgba(255,255,255,0.5)'
      g.lineWidth = 3
      g.beginPath()
      g.ellipse(W / 2, H - 70, 150, 34, 0, Math.PI, Math.PI * 2)
      g.stroke()
      // Pole and backboard.
      g.fillStyle = '#9aa3b5'
      g.fillRect(hoopX - 6, RIM_Y - BOARD.above + BOARD.h, 12, H * 0.56 - (RIM_Y - BOARD.above + BOARD.h))
      g.fillStyle = 'rgba(255,255,255,0.92)'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 4
      rrect(g, hoopX - BOARD.w / 2, RIM_Y - BOARD.above, BOARD.w, BOARD.h, 8)
      g.fill()
      g.stroke()
      g.strokeStyle = '#ff5a2e'
      g.lineWidth = 4
      g.strokeRect(hoopX - 34, RIM_Y - 52, 68, 48)
      if (drag.length && ball && !ball.live) {
        const first = drag[0]
        const last = drag[drag.length - 1]
        const dx = last.x - first.x
        const dy = last.y - first.y
        const len = Math.max(1, Math.hypot(dx, dy))
        const power = Math.min(1, Math.max(0.25, -dy / 170))
        const aimX = START.x + Math.max(-110, Math.min(110, dx * 0.65))
        g.save()
        g.globalAlpha = 0.8
        g.strokeStyle = power > 0.75 ? '#ffd35c' : '#7ef9ff'
        g.lineWidth = 3
        g.setLineDash([7, 8])
        g.beginPath()
        g.moveTo(START.x, START.y)
        g.quadraticCurveTo(aimX, START.y - 150 - power * 90, hoopX, RIM_Y + 8)
        g.stroke()
        g.setLineDash([])
        g.fillStyle = 'rgba(27,24,56,0.75)'
        rrect(g, 24, H - 58, W - 48, 12, 6)
        g.fill()
        g.fillStyle = power > 0.75 ? '#ffd35c' : '#7ef9ff'
        rrect(g, 24, H - 58, (W - 48) * power, 12, 6)
        g.fill()
        text(g, len > 8 ? 'Suelta para lanzar' : 'Desliza hacia arriba', W / 2, H - 78, 15, '#fff7e8', 'center', 800)
        g.restore()
      }
      const drawBall = (b: Ball) => {
        const s = scaleOf(b.z)
        const r = R * s
        g.fillStyle = 'rgba(0,0,0,0.25)'
        g.beginPath()
        g.ellipse(b.x, H * 0.56 + (H * 0.44 - 60) * (1 - Math.min(1, b.z)) + 10, r * 0.9, r * 0.25, 0, 0, Math.PI * 2)
        g.fill()
        g.save()
        g.translate(b.x, b.y)
        g.rotate(b.spin)
        const grd = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r)
        grd.addColorStop(0, '#ffb066')
        grd.addColorStop(1, '#e0601f')
        g.fillStyle = grd
        g.strokeStyle = '#1b1838'
        g.lineWidth = 3
        g.beginPath()
        g.arc(0, 0, r, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.strokeStyle = 'rgba(27,24,56,0.85)'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(-r, 0)
        g.lineTo(r, 0)
        g.moveTo(0, -r)
        g.lineTo(0, r)
        g.stroke()
        g.beginPath()
        g.arc(-r * 1.25, 0, r * 0.9, -0.8, 0.8)
        g.stroke()
        g.beginPath()
        g.arc(r * 1.25, 0, r * 0.9, Math.PI - 0.8, Math.PI + 0.8)
        g.stroke()
        g.restore()
      }
      // The ball passes behind the front of the rim once it's in the hoop plane and below it.
      const behind = ball && ball.z >= 1 && ball.y > RIM_Y - 4
      if (ball && !behind) drawBall(ball)
      // Rim + net.
      const swing = Math.sin(netT * 30) * netT * 8
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = 2
      for (let i = 0; i <= 6; i += 1) {
        const x0 = hoopX - RIM_HALF + (i * RIM_HALF * 2) / 6
        g.beginPath()
        g.moveTo(x0, RIM_Y)
        g.lineTo(hoopX - 30 + (i * 60) / 6 + swing, RIM_Y + 54 + netT * 16)
        g.stroke()
      }
      if (ball && behind) drawBall(ball)
      g.strokeStyle = '#ff5a2e'
      g.lineWidth = 7
      g.beginPath()
      g.ellipse(hoopX, RIM_Y, RIM_HALF, 9, 0, 0, Math.PI * 2)
      g.stroke()
      g.restore()
      // HUD.
      g.fillStyle = 'rgba(255,255,255,0.15)'
      rrect(g, 30, 30, W - 60, 12, 6)
      g.fill()
      g.fillStyle = t < 10 ? '#ff5f7e' : '#7ef9ff'
      rrect(g, 30, 30, (W - 60) * Math.max(0, t / TIME), 12, 6)
      g.fill()
      text(g, String(score), W / 2, 80, 46, '#ffd35c')
      if (streak >= 3) text(g, `🔥 x2 · racha ${streak}`, W / 2, 118, 16, '#ff9f43', 'center', 800)
      if (popT > 0) text(g, popText, W / 2, RIM_Y - 130 - (1.2 - popT) * 30, 30, '#7ef9ff')
      if (!started) text(g, 'Desliza hacia arriba para tirar', W / 2, H - 200, 20)
    },
  }
}
