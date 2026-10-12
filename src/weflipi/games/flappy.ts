// Flappy: tap to flap through the gaps. The course comes from the daily seed, so everybody flies
// the same pipes today. Score = pipes passed.
import { H, W, sphere, text, type Factory } from '../engine'

const GROUND = H - 70
const BIRD_X = 110
const R = 14
const PIPE_W = 66

type Pipe = { x: number; gap: number; size: number; passed: boolean }

export const flappy: Factory = env => {
  let y = H / 2 - 40
  let vy = 0
  let started = false
  let dead = false
  let deadT = 0
  let score = 0
  let scroll = 0
  let next = W + 60
  const pipes: Pipe[] = []
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 90 + env.rand() * 60, y: 60 + env.rand() * 260, s: 0.6 + env.rand() * 0.8 }))

  const speed = () => Math.min(340, 175 + score * 4)
  const spawn = () => {
    const size = Math.max(122, 178 - score * 2)
    const gap = 120 + env.rand() * (GROUND - 240)
    pipes.push({ x: next, gap, size, passed: false })
    next += Math.max(170, 210 - score * 1.5) + env.rand() * 40
  }
  const die = () => {
    if (dead) return
    dead = true
    env.sfx.noise(220, 0.09)
    env.sfx.tone(300, 400, 'sawtooth', 0.05, -220)
    env.fx.shake(0.7)
    env.fx.burst(BIRD_X, y, '#ffd35c', 24, 300)
    env.fx.vibrate(120)
  }

  return {
    bg: '#5ec8f2',
    update(dt) {
      if (dead) {
        deadT += dt
        vy += 1500 * dt
        y = Math.min(GROUND - R, y + vy * dt)
        if (deadT > 0.9) env.end(score)
        return
      }
      if (!started) {
        y = H / 2 - 40 + Math.sin(performance.now() / 220) * 8
        return
      }
      vy = Math.min(720, vy + 1500 * dt)
      y += vy * dt
      const dx = speed() * dt
      scroll += dx
      next -= dx
      for (const c of clouds) {
        c.x -= dx * 0.25 * c.s
        if (c.x < -80) c.x += W + 160
      }
      while (next < W + 80) spawn()
      for (const p of pipes) {
        p.x -= dx
        if (!p.passed && p.x + PIPE_W < BIRD_X - R) {
          p.passed = true
          score += 1
          env.score(score)
          env.sfx.tone(880, 70, 'square', 0.05)
          env.fx.burst(BIRD_X, y, '#ffffff', 6, 140)
          env.fx.vibrate(8)
        }
        const inX = BIRD_X + R > p.x + 3 && BIRD_X - R < p.x + PIPE_W - 3
        if (inX && (y - R < p.gap - p.size / 2 || y + R > p.gap + p.size / 2)) die()
      }
      while (pipes.length && pipes[0].x < -PIPE_W - 10) pipes.shift()
      if (y + R >= GROUND || y - R < -40) die()
    },
    down() {
      if (dead) return
      started = true
      vy = -470
      env.sfx.tone(520, 60, 'triangle', 0.05, 200)
      env.fx.vibrate(8)
    },
    draw(g) {
      const sky = g.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#5ec8f2')
      sky.addColorStop(1, '#c9f1ff')
      g.fillStyle = sky
      g.fillRect(0, 0, W, H)
      g.fillStyle = 'rgba(255,255,255,0.85)'
      for (const c of clouds) {
        g.beginPath()
        g.ellipse(c.x, c.y, 40 * c.s, 16 * c.s, 0, 0, Math.PI * 2)
        g.ellipse(c.x + 24 * c.s, c.y - 10 * c.s, 26 * c.s, 16 * c.s, 0, 0, Math.PI * 2)
        g.fill()
      }
      for (const p of pipes) {
        const top = p.gap - p.size / 2
        const bottom = p.gap + p.size / 2
        const pipe = g.createLinearGradient(p.x, 0, p.x + PIPE_W, 0)
        pipe.addColorStop(0, '#247f35')
        pipe.addColorStop(0.28, '#71e36c')
        pipe.addColorStop(0.55, '#3fbf4f')
        pipe.addColorStop(1, '#195b2b')
        g.fillStyle = pipe
        g.fillRect(p.x, -10, PIPE_W, top + 10)
        g.fillRect(p.x, bottom, PIPE_W, GROUND - bottom)
        g.fillStyle = '#2f9a3d'
        g.fillRect(p.x - 5, top - 24, PIPE_W + 10, 24)
        g.fillRect(p.x - 5, bottom, PIPE_W + 10, 24)
        g.fillStyle = 'rgba(255,255,255,0.25)'
        g.fillRect(p.x + 8, -10, 8, top + 10 - 24)
        g.fillRect(p.x + 8, bottom + 24, 8, GROUND - bottom - 24)
        g.strokeStyle = '#1b1838'
        g.lineWidth = 3
        g.strokeRect(p.x, -10, PIPE_W, top - 14)
        g.strokeRect(p.x - 5, top - 24, PIPE_W + 10, 24)
        g.strokeRect(p.x - 5, bottom, PIPE_W + 10, 24)
        g.strokeRect(p.x, bottom + 24, PIPE_W, GROUND - bottom - 24)
      }
      g.fillStyle = '#e8d38a'
      g.fillRect(0, GROUND, W, H - GROUND)
      g.fillStyle = '#7bd34f'
      g.fillRect(0, GROUND, W, 14)
      g.fillStyle = '#5fb53a'
      for (let x = -(scroll % 24); x < W; x += 24) g.fillRect(x, GROUND + 4, 12, 10)
      g.strokeStyle = '#1b1838'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(0, GROUND)
      g.lineTo(W, GROUND)
      g.stroke()
      // Bird.
      g.save()
      g.translate(BIRD_X, y)
      g.rotate(Math.max(-0.5, Math.min(1.2, vy / 600)))
      g.strokeStyle = '#1b1838'
      sphere(g, 0, 0, R + 2, '#ffd35c')
      g.fillStyle = '#ffb020'
      g.beginPath()
      g.ellipse(-6, 4, 9, 6, Math.sin(performance.now() / 70) * 0.5, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(6, -5, 6, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#1b1838'
      g.beginPath()
      g.arc(8, -5, 2.6, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#ff7a45'
      g.beginPath()
      g.moveTo(12, 1)
      g.lineTo(24, 4)
      g.lineTo(12, 8)
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
      text(g, String(score), W / 2, 80, 60)
      if (!started) text(g, 'Toca para volar', W / 2, H / 2 + 60, 26)
    },
  }
}
