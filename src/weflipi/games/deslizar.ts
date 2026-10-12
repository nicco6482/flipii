// Deslizar (like Playus' Swipe Fast): a big arrow appears. Green → swipe that way; red → swipe the
// OPPOSITE way. Arrow keys work too. 30 seconds; right +1, wrong −1. Same arrows for everyone today.
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
      return
    }
    good = d === (red ? OPP[dir] : dir)
    score = Math.max(0, score + (good ? 1 : -1))
    flash = 1
    fly = good ? 1 : 0
    flyDir = d
    env.score(score)
    env.sfx.tone(good ? 640 + Math.min(score, 30) * 10 : 150, good ? 60 : 200, good ? 'triangle' : 'sawtooth', 0.06)
    next()
  }

  return {
    bg: '#1b1838',
    update(dt) {
      flash = Math.max(0, flash - dt * 3)
      fly = Math.max(0, fly - dt * 4)
      if (!started) return
      t -= dt
      left -= dt
      if (left <= 0) {
        good = false
        score = Math.max(0, score - 1)
        flash = 1
        env.score(score)
        env.sfx.tone(150, 200, 'sawtooth', 0.06)
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
      g.fillStyle = '#1b1838'
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
        g.fillStyle = color
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
