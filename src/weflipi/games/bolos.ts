// Bolos: five frames, two balls each. Drag the ball sideways to line it up and flick it up the
// lane; pins bounce into each other. Score = pins knocked + 10 per strike + 5 per spare.
import { H, W, rrect, text, type Factory } from '../engine'

const FRAMES = 5
const LANE_L = 110
const LANE_R = 290
const BALL_R = 17
const PIN_R = 9
const BALL_Y = H - 90
const HEAD_Y = 150

type Body = { x: number; y: number; vx: number; vy: number; r: number; m: number }
type Pin = Body & { hx: number; hy: number; down: boolean; out: boolean }

function rack(): Pin[] {
  const pins: Pin[] = []
  for (let row = 0; row < 4; row += 1) {
    for (let i = 0; i <= row; i += 1) {
      const x = W / 2 + (i - row / 2) * 34
      const y = HEAD_Y - row * 30
      pins.push({ x, y, hx: x, hy: y, vx: 0, vy: 0, r: PIN_R, m: 1, down: false, out: false })
    }
  }
  return pins
}

export const bolos: Factory = env => {
  let frame = 0
  let roll = 0
  let total = 0
  let firstRoll = 0
  let pins = rack()
  const ball: Body = { x: W / 2, y: BALL_Y, vx: 0, vy: 0, r: BALL_R, m: 6 }
  let rolling = false
  let gutter = false
  let simT = 0
  let dragging = false
  const trail: { x: number; y: number; t: number }[] = []
  let banner = ''
  let bannerT = 0
  let wait = -1
  let finished = false
  const scores: string[] = []

  const collide = (a: Body, b: Body) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.hypot(dx, dy)
    const min = a.r + b.r
    if (d === 0 || d >= min) return false
    const nx = dx / d
    const ny = dy / d
    const overlap = min - d
    const total = a.m + b.m
    a.x -= nx * overlap * (b.m / total)
    a.y -= ny * overlap * (b.m / total)
    b.x += nx * overlap * (a.m / total)
    b.y += ny * overlap * (a.m / total)
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
    if (rel > 0) return true
    const j = (-(1 + 0.75) * rel) / (1 / a.m + 1 / b.m)
    a.vx -= (j / a.m) * nx
    a.vy -= (j / a.m) * ny
    b.vx += (j / b.m) * nx
    b.vy += (j / b.m) * ny
    return true
  }

  const finishRoll = () => {
    rolling = false
    const knockedNow = pins.filter(p => !p.out && (p.down || Math.hypot(p.x - p.hx, p.y - p.hy) > 7)).length
    for (const p of pins) if (!p.out && Math.hypot(p.x - p.hx, p.y - p.hy) > 7) p.down = true
    pins.forEach(p => p.down && (p.out = true))
    if (roll === 0) {
      firstRoll = knockedNow
      if (knockedNow === 10) {
        total += 20
        banner = '¡STRIKE!'
        scores.push('X')
        env.sfx.tone(784, 300, 'triangle', 0.09, 400)
        endFrame()
      } else {
        total += knockedNow
        banner = knockedNow ? `${knockedNow} bolos` : '¡Al canal!'
        roll = 1
        wait = 0.9
      }
    } else {
      total += knockedNow
      if (firstRoll + knockedNow === 10) {
        total += 5
        banner = '¡SPARE!'
        scores.push(`${firstRoll}/`)
        env.sfx.tone(660, 250, 'triangle', 0.08, 300)
      } else {
        banner = `${knockedNow} bolos`
        scores.push(`${firstRoll}·${knockedNow}`)
      }
      endFrame()
    }
    bannerT = 1.3
    env.score(total)
  }

  const endFrame = () => {
    frame += 1
    roll = 0
    wait = 1.2
  }

  const resetBall = () => {
    ball.x = W / 2
    ball.y = BALL_Y
    ball.vx = 0
    ball.vy = 0
    gutter = false
  }

  return {
    bg: '#2a1a12',
    update(dt) {
      bannerT = Math.max(0, bannerT - dt)
      if (wait >= 0) {
        wait -= dt
        if (wait < 0) {
          if (frame >= FRAMES) {
            if (!finished) {
              finished = true
              env.end(total)
            }
            return
          }
          if (roll === 0) pins = rack()
          resetBall()
        }
        return
      }
      if (!rolling) return
      simT += dt
      const steps = 4
      for (let s = 0; s < steps; s += 1) {
        const h = dt / steps
        ball.x += ball.vx * h
        ball.y += ball.vy * h
        if (!gutter && (ball.x - BALL_R < LANE_L || ball.x + BALL_R > LANE_R)) {
          gutter = true
          ball.vx = 0
          ball.x = ball.x < W / 2 ? LANE_L - BALL_R - 4 : LANE_R + BALL_R + 4
          env.sfx.noise(160, 0.05)
        }
        for (const p of pins) {
          if (p.out) continue
          p.x += p.vx * h
          p.y += p.vy * h
          const damp = Math.exp(-2.2 * h)
          p.vx *= damp
          p.vy *= damp
          if (!gutter && collide(ball, p)) env.sfx.tone(240 + Math.random() * 80, 40, 'square', 0.04)
          if (p.x < LANE_L - 6 || p.x > LANE_R + 6 || p.y < 30) p.down = true
        }
        for (let i = 0; i < pins.length; i += 1) for (let j = i + 1; j < pins.length; j += 1) if (!pins[i].out && !pins[j].out) collide(pins[i], pins[j])
      }
      const still = pins.every(p => p.out || Math.hypot(p.vx, p.vy) < 6)
      if ((ball.y < 20 && still) || simT > 5) finishRoll()
    },
    down(x, y) {
      if (rolling || wait >= 0 || finished) return
      if (y < H / 2) return
      dragging = true
      trail.length = 0
      trail.push({ x, y, t: performance.now() })
      ball.x = Math.max(LANE_L + BALL_R, Math.min(LANE_R - BALL_R, x))
    },
    move(x, y) {
      if (!dragging) return
      trail.push({ x, y, t: performance.now() })
      if (trail.length > 8) trail.shift()
      if (y > BALL_Y - 60) ball.x = Math.max(LANE_L + BALL_R, Math.min(LANE_R - BALL_R, x))
    },
    up(x, y) {
      if (!dragging) return
      dragging = false
      const now = performance.now()
      trail.push({ x, y, t: now })
      const first = trail.find(p => now - p.t < 140) ?? trail[0]
      const dtm = Math.max(16, now - first.t) / 1000
      let vx = (x - first.x) / dtm
      let vy = (y - first.y) / dtm
      // Keyboard / tap: roll straight at a medium speed.
      if (vy > -150) {
        if (Math.abs(y - first.y) < 8 && Math.abs(x - first.x) < 8 && trail.length <= 2) {
          vx = 0
          vy = -750
        } else return
      }
      const sp = Math.min(1150, Math.max(520, Math.hypot(vx, vy)))
      const ang = Math.max(-0.22, Math.min(0.22, Math.atan2(vx, -vy)))
      ball.vx = Math.sin(ang) * sp
      ball.vy = -Math.cos(ang) * sp
      rolling = true
      simT = 0
      env.sfx.noise(300, 0.04)
    },
    key(k, pressed) {
      if (!pressed || rolling || wait >= 0) return
      if (k === 'left') ball.x = Math.max(LANE_L + BALL_R, ball.x - 12)
      if (k === 'right') ball.x = Math.min(LANE_R - BALL_R, ball.x + 12)
    },
    draw(g) {
      g.fillStyle = '#2a1a12'
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#1b1838'
      g.fillRect(LANE_L - 34, 0, LANE_R - LANE_L + 68, H)
      g.fillStyle = '#4b4560'
      g.fillRect(LANE_L - 30, 0, 26, H)
      g.fillRect(LANE_R + 4, 0, 26, H)
      const lane = g.createLinearGradient(LANE_L, 0, LANE_R, 0)
      lane.addColorStop(0, '#d9a066')
      lane.addColorStop(0.5, '#f0c38e')
      lane.addColorStop(1, '#d9a066')
      g.fillStyle = lane
      g.fillRect(LANE_L, 0, LANE_R - LANE_L, H)
      g.strokeStyle = 'rgba(120,70,30,0.25)'
      g.lineWidth = 1
      for (let x = LANE_L + 18; x < LANE_R; x += 18) {
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, H)
        g.stroke()
      }
      g.fillStyle = '#a0522d'
      for (let i = 0; i < 7; i += 1) {
        const x = LANE_L + 22 + i * 22.5
        g.beginPath()
        g.moveTo(x, 470)
        g.lineTo(x - 6, 484)
        g.lineTo(x + 6, 484)
        g.closePath()
        g.fill()
      }
      g.fillStyle = '#c0392b'
      g.fillRect(LANE_L, BALL_Y - 50, LANE_R - LANE_L, 3)
      for (const p of pins) {
        if (p.out) continue
        g.fillStyle = 'rgba(0,0,0,0.25)'
        g.beginPath()
        g.arc(p.x + 3, p.y + 4, p.r, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = p.down ? '#bbb' : '#fffaf0'
        g.strokeStyle = '#1b1838'
        g.lineWidth = 2
        g.beginPath()
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = '#e0244e'
        g.fillRect(p.x - p.r + 2, p.y - 2, p.r * 2 - 4, 3)
      }
      if (!(wait >= 0 && roll === 0 && frame > 0 && wait < 0.6)) {
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.beginPath()
        g.arc(ball.x + 4, ball.y + 5, BALL_R, 0, Math.PI * 2)
        g.fill()
        const bg = g.createRadialGradient(ball.x - 6, ball.y - 6, 2, ball.x, ball.y, BALL_R)
        bg.addColorStop(0, '#9b8cff')
        bg.addColorStop(1, '#4a2fbf')
        g.fillStyle = bg
        g.strokeStyle = '#1b1838'
        g.lineWidth = 3
        g.beginPath()
        g.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = '#1b1838'
        for (const [ox, oy] of [[-4, -6], [4, -6], [0, 2]]) {
          g.beginPath()
          g.arc(ball.x + ox, ball.y + oy, 2.4, 0, Math.PI * 2)
          g.fill()
        }
      }
      // Score sheet.
      g.fillStyle = 'rgba(27,24,56,0.85)'
      rrect(g, 8, 8, W - 16, 44, 10)
      g.fill()
      for (let i = 0; i < FRAMES; i += 1) {
        const x = 20 + i * 52
        g.strokeStyle = i === frame ? '#ffd35c' : 'rgba(255,255,255,0.3)'
        g.lineWidth = 2
        g.strokeRect(x, 16, 46, 28)
        if (scores[i]) text(g, scores[i], x + 23, 30, 15, scores[i] === 'X' ? '#7ef9ff' : '#fff7e8', 'center', 800)
      }
      text(g, String(total), W - 48, 30, 24, '#ffd35c')
      if (bannerT > 0) text(g, banner, W / 2, H / 2 - 20, 42, banner.startsWith('¡S') ? '#7ef9ff' : '#fff7e8')
      else if (!rolling && wait < 0 && frame === 0 && roll === 0) {
        text(g, 'Arrastra la bola para colocarla', W / 2, H / 2 + 40, 18, '#fff7e8', 'center', 800)
        text(g, 'y desliza hacia arriba para lanzar', W / 2, H / 2 + 66, 18, '#fff7e8', 'center', 800)
      }
    },
  }
}
