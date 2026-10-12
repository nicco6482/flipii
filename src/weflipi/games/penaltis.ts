// Penaltis: 10 shots against a goalkeeper who gets sharper every shot. Swipe from the ball towards
// the goal: the swipe's direction aims, its speed sets the power and a curved swipe bends the shot
// (real side-spin). Goal = 1 point, top corner ("escuadra") = 2. Posts bounce the ball out.
import { H, W, rrect, sphere, text, type Factory } from '../engine'

const SHOTS = 10
const GOAL = { x: 70, y: 150, w: 260, h: 110 } // goal mouth in the goal plane (screen units)
const POST = 7
const BALL_START = { x: W / 2, y: H - 120 }
const R = 26
const FLIGHT = 0.55 // seconds to reach the goal plane at normal power

type Shot = { x: number; y: number; z: number; tx: number; ty: number; curve: number; dur: number; t: number; done: boolean }

export const penaltis: Factory = env => {
  let shot = 0
  let score = 0
  let current: Shot | null = null
  let keeper = { x: W / 2, y: GOAL.y + GOAL.h, w: 70, h: 96, dive: 0, vx: 0, targetX: W / 2, react: 0 }
  let result = ''
  let resultT = 0
  let pause = 0
  let finished = false
  let drag: { x: number; y: number; t: number }[] = []
  const history: ('gol' | 'escuadra' | 'fallo')[] = []
  let clock = 0

  const resetKeeper = () => {
    keeper = { x: W / 2, y: GOAL.y + GOAL.h, w: 70, h: 96, dive: 0, vx: 0, targetX: W / 2, react: 0 }
  }

  // Keeper skill per shot: reaction delay shrinks, dive speed grows, idle sway widens.
  const skill = () => ({ delay: Math.max(0.1, 0.34 - shot * 0.025), speed: 160 + shot * 25, reach: 0.3 + shot * 0.03 })

  const finishShot = (kind: 'gol' | 'escuadra' | 'fallo', msg: string) => {
    if (!current) return
    current.done = true
    history.push(kind)
    if (kind !== 'fallo') {
      score += kind === 'escuadra' ? 2 : 1
      env.score(score)
      env.sfx.tone(784, 160, 'triangle', 0.08)
      setTimeout(() => env.sfx.tone(1047, 220, 'triangle', 0.08), 120)
      env.sfx.noise(400, 0.05)
      env.fx.burst(current.x, current.y, undefined, 45, 420)
      env.fx.shake(0.5)
      env.fx.vibrate(80)
    } else {
      env.sfx.tone(200, 260, 'sawtooth', 0.05)
      env.fx.vibrate(60)
    }
    result = msg
    resultT = 1.3
    pause = 1.3
  }

  return {
    bg: '#1f6b34',
    update(dt) {
      clock += dt
      resultT = Math.max(0, resultT - dt)
      if (pause > 0) {
        pause -= dt
        if (pause <= 0) {
          current = null
          shot += 1
          resetKeeper()
          if (shot >= SHOTS && !finished) {
            finished = true
            env.end(score)
          }
        }
        return
      }
      const sk = skill()
      if (!current) {
        // Idle sway, faster with each shot.
        keeper.x = W / 2 + Math.sin(clock * (1.4 + shot * 0.15)) * (25 + shot * 4)
        return
      }
      const c = current
      if (c.done) return
      c.t += dt
      // Keeper reads the shot after a delay and dives towards where it will cross.
      if (c.t > sk.delay) {
        const guess = Math.max(GOAL.x + keeper.w / 2, Math.min(GOAL.x + GOAL.w - keeper.w / 2, c.tx + c.curve * 0.25))
        keeper.targetX = guess
        const dx = keeper.targetX - keeper.x
        const step = Math.sign(dx) * Math.min(Math.abs(dx), sk.speed * dt)
        keeper.x += step
        keeper.dive = Math.min(1, keeper.dive + dt * 3) * Math.sign(dx || 1)
      }
      // Ball: eased path towards the target with a side-spin bend, shrinking with depth.
      const k = Math.min(1, c.t / c.dur)
      const bend = Math.sin(k * Math.PI) * c.curve * 0.5 + c.curve * k * 0.5
      c.x = BALL_START.x + (c.tx - BALL_START.x) * k + bend * k
      c.y = BALL_START.y + (c.ty - BALL_START.y) * k - Math.sin(k * Math.PI) * 30
      c.z = k
      if (k < 1) return
      // Arrived at the goal plane: posts, crossbar, keeper, net or wide.
      const r = R * 0.45
      const inX = c.x > GOAL.x + POST && c.x < GOAL.x + GOAL.w - POST
      const inY = c.y > GOAL.y + POST && c.y < GOAL.y + GOAL.h
      const nearPost = Math.abs(c.x - GOAL.x) < POST + r || Math.abs(c.x - (GOAL.x + GOAL.w)) < POST + r
      const nearBar = Math.abs(c.y - GOAL.y) < POST + r && c.x > GOAL.x - r && c.x < GOAL.x + GOAL.w + r
      const reach = keeper.w * (0.5 + Math.abs(keeper.dive) * sk.reach)
      // Standing he covers his body; diving he stretches sideways and up.
      const saved = Math.abs(c.x - keeper.x) < reach && c.y > keeper.y - keeper.h * (0.75 + Math.abs(keeper.dive) * 0.4) && c.y < GOAL.y + GOAL.h + 10
      if (nearPost || nearBar) finishShot('fallo', nearBar ? '¡Larguero!' : '¡Al palo!')
      else if (!inX || !inY) finishShot('fallo', 'Fuera')
      else if (saved) finishShot('fallo', '¡Parada!')
      else {
        const corner = c.y < GOAL.y + GOAL.h * 0.38 && (c.x < GOAL.x + GOAL.w * 0.2 || c.x > GOAL.x + GOAL.w * 0.8)
        finishShot(corner ? 'escuadra' : 'gol', corner ? '¡ESCUADRA! +2' : '¡GOOOL!')
      }
    },
    down(x, y) {
      if (current || pause > 0 || finished) return
      drag = [{ x, y, t: performance.now() }]
    },
    move(x, y) {
      if (!drag.length) return
      drag.push({ x, y, t: performance.now() })
    },
    up(x, y) {
      if (!drag.length || current || finished) return
      const now = performance.now()
      drag.push({ x, y, t: now })
      const a = drag[0]
      const b = drag[drag.length - 1]
      const mid = drag[Math.floor(drag.length / 2)]
      drag = []
      let dx = b.x - a.x
      let dy = b.y - a.y
      // Plain tap (keyboard / click): a firm shot to the middle-left.
      if (Math.hypot(dx, dy) < 10) {
        dx = -60
        dy = -300
      }
      if (dy > -40) return
      const secs = Math.max(0.05, (b.t - a.t) / 1000)
      const speed = Math.hypot(dx, dy) / secs
      // Aim: extend the swipe direction up to the goal plane.
      const scale = (BALL_START.y - (GOAL.y + GOAL.h * 0.5)) / -dy
      const tx = BALL_START.x + dx * scale * 0.9
      // Power lifts the ball: soft shots stay low, hard ones rise (and can fly over).
      const power = Math.min(1.6, Math.max(0.5, speed / 1400))
      const ty = GOAL.y + GOAL.h - 20 - (power - 0.5) * 120
      // Curve: how far the middle of the swipe bulges from the straight line.
      const lineX = a.x + (mid.y - a.y) / (dy || -1) * dx
      const curve = Math.max(-140, Math.min(140, (mid.x - lineX) * -2.2))
      current = { x: BALL_START.x, y: BALL_START.y, z: 0, tx, ty, curve, dur: FLIGHT / Math.min(1.4, Math.max(0.7, power)), t: 0, done: false }
      env.sfx.noise(90, 0.06)
      env.sfx.tone(160, 80, 'square', 0.05)
      env.fx.vibrate(12 + Math.round(power * 10))
    },
    draw(g) {
      // Pitch with stripes and perspective.
      g.fillStyle = '#2f8f44'
      g.fillRect(0, 0, W, H)
      for (let i = 0; i < 8; i += 1) {
        g.fillStyle = i % 2 ? '#2f8f44' : '#36a04d'
        g.fillRect(0, GOAL.y + GOAL.h + i * 60, W, 60)
      }
      g.fillStyle = '#1d5f30'
      g.fillRect(0, 0, W, GOAL.y + GOAL.h)
      g.fillStyle = 'rgba(255,255,255,0.08)'
      for (let i = 0; i < 12; i += 1) g.fillRect(i * 40, 30, 20, GOAL.y - 40)
      g.strokeStyle = 'rgba(255,255,255,0.75)'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(10, GOAL.y + GOAL.h)
      g.lineTo(W - 10, GOAL.y + GOAL.h)
      g.moveTo(GOAL.x - 40, GOAL.y + GOAL.h)
      g.lineTo(GOAL.x - 70, GOAL.y + GOAL.h + 120)
      g.lineTo(GOAL.x + GOAL.w + 70, GOAL.y + GOAL.h + 120)
      g.lineTo(GOAL.x + GOAL.w + 40, GOAL.y + GOAL.h)
      g.stroke()
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(BALL_START.x, BALL_START.y + 10, 4, 0, Math.PI * 2)
      g.fill()
      // Net.
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h)
      g.strokeStyle = 'rgba(255,255,255,0.35)'
      g.lineWidth = 1
      for (let x = GOAL.x; x <= GOAL.x + GOAL.w; x += 14) {
        g.beginPath()
        g.moveTo(x, GOAL.y)
        g.lineTo(x, GOAL.y + GOAL.h)
        g.stroke()
      }
      for (let y = GOAL.y; y <= GOAL.y + GOAL.h; y += 14) {
        g.beginPath()
        g.moveTo(GOAL.x, y)
        g.lineTo(GOAL.x + GOAL.w, y)
        g.stroke()
      }
      // Top-corner targets.
      g.strokeStyle = 'rgba(255,211,92,0.55)'
      g.setLineDash([5, 5])
      g.lineWidth = 2
      g.strokeRect(GOAL.x + POST, GOAL.y + POST, GOAL.w * 0.2, GOAL.h * 0.38)
      g.strokeRect(GOAL.x + GOAL.w * 0.8 - POST, GOAL.y + POST, GOAL.w * 0.2, GOAL.h * 0.38)
      g.setLineDash([])
      if (drag.length) {
        const a = drag[0]
        const b = drag[drag.length - 1]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.max(1, Math.hypot(dx, dy))
        const power = Math.min(1, Math.max(0.25, len / 170))
        const scale = (BALL_START.y - (GOAL.y + GOAL.h * 0.5)) / Math.max(40, -dy)
        const targetX = BALL_START.x + dx * scale * 0.9
        g.save()
        g.globalAlpha = 0.8
        g.strokeStyle = power > 0.8 ? '#ffd35c' : '#7ef9ff'
        g.lineWidth = 3
        g.setLineDash([7, 8])
        g.beginPath()
        g.moveTo(BALL_START.x, BALL_START.y)
        g.quadraticCurveTo((BALL_START.x + targetX) / 2, BALL_START.y - 130 - power * 60, targetX, GOAL.y + GOAL.h * 0.5)
        g.stroke()
        g.setLineDash([])
        g.fillStyle = '#ffd35c'
        g.beginPath()
        g.arc(targetX, GOAL.y + GOAL.h * 0.5, 7 + power * 4, 0, Math.PI * 2)
        g.fill()
        text(g, power > 0.8 ? 'Potente' : 'Coloca el tiro', W / 2, H - 76, 15, '#fff7e8', 'center', 800)
        g.restore()
      }
      // Keeper.
      g.save()
      g.translate(keeper.x, keeper.y)
      g.rotate(keeper.dive * 0.9)
      g.fillStyle = '#ffd35c'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 3
      rrect(g, -keeper.w / 2 + 14, -keeper.h + 34, keeper.w - 28, keeper.h - 34, 10)
      g.fill()
      g.stroke()
      g.fillStyle = '#f2c79b'
      g.beginPath()
      g.arc(0, -keeper.h + 22, 15, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#7ef9ff'
      for (const side of [-1, 1]) {
        g.beginPath()
        g.arc(side * (keeper.w / 2 - 2), -keeper.h + 40 - Math.abs(keeper.dive) * 14, 10, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      }
      g.restore()
      // Posts and bar.
      g.fillStyle = '#fff'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 2
      g.fillRect(GOAL.x - POST, GOAL.y - POST, POST, GOAL.h + POST)
      g.fillRect(GOAL.x + GOAL.w, GOAL.y - POST, POST, GOAL.h + POST)
      g.fillRect(GOAL.x - POST, GOAL.y - POST, GOAL.w + POST * 2, POST)
      // Ball.
      const bx = current ? current.x : BALL_START.x
      const by = current ? current.y : BALL_START.y
      const s = current ? 1 - current.z * 0.55 : 1
      const r = R * s
      g.save()
      g.translate(bx, by)
      g.rotate((current?.t ?? 0) * (current ? current.curve / 10 : 0))
      sphere(g, 0, 0, r, '#f3f7ff')
      g.fillStyle = '#1b1838'
      g.beginPath()
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2
        const px = Math.cos(a) * r * 0.32
        const py = Math.sin(a) * r * 0.32
        if (k === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.closePath()
      g.fill()
      g.restore()
      // HUD: one dot per shot.
      for (let i = 0; i < SHOTS; i += 1) {
        const h = history[i]
        g.fillStyle = h === 'escuadra' ? '#ffd35c' : h === 'gol' ? '#2bd47d' : h === 'fallo' ? '#ff2d55' : 'rgba(255,255,255,0.25)'
        g.beginPath()
        g.arc(W / 2 + (i - 4.5) * 30, 40, 9, 0, Math.PI * 2)
        g.fill()
      }
      text(g, String(score), W / 2, 90, 40, '#ffd35c')
      if (resultT > 0) text(g, result, W / 2, H / 2, 40, result.startsWith('¡G') || result.startsWith('¡E') ? '#ffd35c' : '#fff7e8')
      else if (!current && shot === 0) text(g, 'Desliza desde el balón hacia la portería', W / 2, H - 50, 17, '#fff7e8', 'center', 800)
    },
  }
}
