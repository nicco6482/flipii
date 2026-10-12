// Deslizar: a big arrow appears. Green means swipe that way; red means the opposite.
// Arrow keys work too. The 30-second pattern is seeded so every daily run is comparable.
import { H, W, rrect, text, type Factory } from '../engine'

const TIME = 30
type Dir = 'up' | 'down' | 'left' | 'right'
const DIRS: Dir[] = ['up', 'right', 'down', 'left']
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
const ANGLE: Record<Dir, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }

export const deslizar: Factory = env => {
  let t = TIME
  let started = false
  let score = 0
  let dir: Dir = 'up'
  let red = false
  let flash = 0
  let good = true
  let fly = 0
  let flyDir: Dir = 'up'
  let sx = 0
  let sy = 0
  let swiping = false
  let left = 0
  let pulse = 0
  // Time for each arrow: 1.6 s at first, down to 0.55 s.
  const limit = () => Math.max(0.55, 1.6 - score * 0.045)

  const next = () => {
    dir = DIRS[Math.floor(env.rand() * 4)]
    red = score > 3 && env.rand() < Math.min(0.5, 0.2 + score * 0.01)
    left = limit()
  }
  next()

  const answer = (d: Dir) => {
    if (!started) {
      started = true
      pulse = 1
      env.sfx.tone(460, 90, 'triangle', 0.07, 80)
      env.fx.vibrate(14)
      return
    }
    good = d === (red ? OPP[dir] : dir)
    score = Math.max(0, score + (good ? 1 : -1))
    flash = 1
    fly = good ? 1 : 0
    flyDir = d
    env.score(score)
    env.sfx.tone(good ? 640 + Math.min(score, 30) * 10 : 150, good ? 60 : 200, good ? 'triangle' : 'sawtooth', 0.06)
    if (good) {
      pulse = 1
      env.fx.burst(W / 2, 360, '#2bd47d', 14, 250)
      env.fx.shake(0.12)
      env.fx.vibrate(18)
    }
    else {
      env.fx.shake(0.35)
      env.fx.vibrate(60)
    }
    next()
  }

  return {
    bg: '#1b1838',
    update(dt) {
      flash = Math.max(0, flash - dt * 3)
      fly = Math.max(0, fly - dt * 4)
      pulse = Math.max(0, pulse - dt * 3.6)
      if (!started) return
      t -= dt
      left -= dt
      if (left <= 0) {
        good = false
        score = Math.max(0, score - 1)
        flash = 1
        env.score(score)
        env.sfx.tone(150, 200, 'sawtooth', 0.06)
        env.fx.shake(0.28)
        env.fx.vibrate(60)
        next()
      }
      if (t <= 0) env.end(score)
    },
    down(x, y) {
      swiping = true
      sx = x
      sy = y
      if (!started) answer('up')
    },
    up(x, y) {
      if (!swiping) return
      swiping = false
      const dx = x - sx
      const dy = y - sy
      if (Math.hypot(dx, dy) < 30) return
      answer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    },
    key(k, pressed) {
      if (pressed) answer(k)
    },
    draw(g) {
      const bg = g.createRadialGradient(W / 2, 340, 30, W / 2, 340, 480)
      bg.addColorStop(0, red && started ? '#4a1e4b' : '#312866')
      bg.addColorStop(0.58, '#201b4c')
      bg.addColorStop(1, '#100d28')
      g.fillStyle = bg
      g.fillRect(0, 0, W, H)
      if (flash > 0) {
        g.fillStyle = good ? `rgba(43,212,125,${flash * 0.25})` : `rgba(255,45,85,${flash * 0.35})`
        g.fillRect(0, 0, W, H)
      }
      g.fillStyle = 'rgba(255,255,255,0.12)'
      rrect(g, 30, 40, W - 60, 16, 8)
      g.fill()
      g.fillStyle = t < 8 ? '#ff5f7e' : '#7ef9ff'
      rrect(g, 30, 40, (W - 60) * Math.max(0, t / TIME), 16, 8)
      g.fill()
      text(g, String(score), W / 2, 110, 52, '#ffd35c')
      if (started) {
        g.fillStyle = `rgba(255,255,255,${0.06 + pulse * 0.12})`
        rrect(g, 44, 212, W - 88, 296, 38)
        g.fill()
        g.strokeStyle = 'rgba(255,255,255,0.12)'
        g.lineWidth = 3
        rrect(g, 44, 212, W - 88, 296, 38)
        g.stroke()
      }
      const arrow = (d: Dir, color: string, ox: number, oy: number, alpha: number) => {
        g.save()
        g.globalAlpha = alpha
        g.translate(W / 2 + ox, 360 + oy)
        g.rotate(ANGLE[d])
        g.fillStyle = 'rgba(0,0,0,0.35)'
        g.beginPath()
        g.moveTo(-90 + 6, -40 + 8)
        g.lineTo(10 + 6, -40 + 8)
        g.lineTo(10 + 6, -90 + 8)
        g.lineTo(110 + 6, 0 + 8)
        g.lineTo(10 + 6, 90 + 8)
        g.lineTo(10 + 6, 40 + 8)
        g.lineTo(-90 + 6, 40 + 8)
        g.closePath()
        g.fill()
        const material = g.createLinearGradient(-90, -90, 110, 90)
        material.addColorStop(0, '#fff7e8')
        material.addColorStop(0.16, color)
        material.addColorStop(0.72, color)
        material.addColorStop(1, red ? '#a72045' : '#168d5a')
        g.fillStyle = material
        g.strokeStyle = '#1b1838'
        g.lineWidth = 7
        g.lineJoin = 'round'
        g.beginPath()
        g.moveTo(-90, -40)
        g.lineTo(10, -40)
        g.lineTo(10, -90)
        g.lineTo(110, 0)
        g.lineTo(10, 90)
        g.lineTo(10, 40)
        g.lineTo(-90, 40)
        g.closePath()
        g.fill()
        g.stroke()
        g.globalAlpha = alpha * 0.34
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.moveTo(-74, -27)
        g.lineTo(0, -27)
        g.lineTo(0, -59)
        g.lineTo(57, -7)
        g.lineTo(0, -2)
        g.lineTo(0, 4)
        g.lineTo(-74, 4)
        g.closePath()
        g.fill()
        g.restore()
      }
      if (fly > 0) {
        const d = 160 * (1 - fly)
        const v = { up: [0, -d], down: [0, d], left: [-d, 0], right: [d, 0] }[flyDir]
        arrow(flyDir, '#2bd47d', v[0], v[1], fly)
      }
      if (started) arrow(dir, red ? '#ff2d55' : '#2bd47d', 0, 0, 1)
      if (started) {
        g.fillStyle = 'rgba(255,255,255,0.15)'
        rrect(g, 80, 490, W - 160, 10, 5)
        g.fill()
        g.fillStyle = left < 0.4 ? '#ff2d55' : '#ffd35c'
        rrect(g, 80, 490, (W - 160) * Math.max(0, left / limit()), 10, 5)
        g.fill()
      }
      text(g, started ? (red ? '¡AL REVÉS!' : 'Desliza así') : 'Toca para empezar', W / 2, 560, 26, red ? '#ff5f7e' : '#fff7e8')
      text(g, 'Verde: hacia donde apunta · Roja: al contrario', W / 2, 610, 15, 'rgba(255,247,232,0.75)', 'center', 700)
      if (started) text(g, `${Math.ceil(t)} s`, W / 2, 660, 18)
    },
  }
}
