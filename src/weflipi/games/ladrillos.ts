// Ladrillos (like Playus' Brick): classic breakout. Drag (or use the arrows) to move the paddle;
// clear the wall and a faster one drops in. One ball: miss it and it's over. Score = points.
import { H, W, rrect, text, type Factory } from '../engine'

const COLS = 7
const ROWS = 6
const BW = 50
const BH = 22
const GAP = 4
const TOP = 110
const PADDLE_Y = H - 90
const R = 9
const ROW_COLORS = ['#ff5f7e', '#ff9f43', '#ffd35c', '#2bd47d', '#7ef9ff', '#a77bff']

type Brick = { x: number; y: number; hp: number; row: number }

export const ladrillos: Factory = env => {
  let bricks: Brick[] = []
  let px = W / 2
  let pw = 90
  let bx = W / 2
  let by = PADDLE_Y - R - 2
  let vx = 0
  let vy = 0
  let speed = 420
  let started = false
  let over = false
  let overT = 0
  let score = 0
  let level = 0
  let keyDir = 0
  let flash = 0

  const build = () => {
    level += 1
    bricks = []
    const left = (W - (COLS * BW + (COLS - 1) * GAP)) / 2
    for (let r = 0; r < ROWS; r += 1)
      for (let c = 0; c < COLS; c += 1) if (level === 1 || env.rand() > 0.12) bricks.push({ x: left + c * (BW + GAP), y: TOP + r * (BH + GAP), hp: level > 2 && r < 2 ? 2 : 1, row: r })
    speed = 420 + (level - 1) * 60
    pw = Math.max(64, 96 - (level - 1) * 8)
  }
  build()

  const serve = () => {
    started = true
    const a = -Math.PI / 2 + (env.rand() - 0.5) * 0.8
    vx = Math.cos(a) * speed
    vy = Math.sin(a) * speed
  }

  return {
    bg: '#0e0c26',
    update(dt) {
      flash = Math.max(0, flash - dt * 3)
      px = Math.max(pw / 2, Math.min(W - pw / 2, px + keyDir * 520 * dt))
      if (over) {
        overT += dt
        if (overT > 1) env.end(score)
        return
      }
      if (!started) {
        bx = px
        by = PADDLE_Y - R - 2
        return
      }
      const steps = 4
      for (let s = 0; s < steps; s += 1) {
        const h = dt / steps
        bx += vx * h
        by += vy * h
        if (bx < R) {
          bx = R
          vx = Math.abs(vx)
        }
        if (bx > W - R) {
          bx = W - R
          vx = -Math.abs(vx)
        }
        if (by < 60 + R) {
          by = 60 + R
          vy = Math.abs(vy)
        }
        // Paddle: the hit point sets the bounce angle.
        if (vy > 0 && by + R >= PADDLE_Y && by + R <= PADDLE_Y + 16 && Math.abs(bx - px) <= pw / 2 + R) {
          const k = Math.max(-1, Math.min(1, (bx - px) / (pw / 2)))
          const a = -Math.PI / 2 + k * 1.05
          vx = Math.cos(a) * speed
          vy = Math.sin(a) * speed
          by = PADDLE_Y - R
          env.sfx.tone(330, 40, 'square', 0.04)
        }
        for (const b of bricks) {
          if (b.hp <= 0) continue
          const cx = Math.max(b.x, Math.min(bx, b.x + BW))
          const cy = Math.max(b.y, Math.min(by, b.y + BH))
          if (Math.hypot(bx - cx, by - cy) > R) continue
          if (Math.abs(bx - cx) > Math.abs(by - cy)) vx = -vx
          else vy = -vy
          b.hp -= 1
          if (b.hp <= 0) {
            score += 10 * level
            env.score(score)
          }
          env.sfx.tone(500 + (ROWS - b.row) * 60, 50, 'triangle', 0.05)
          break
        }
      }
      if (by > H + R) {
        over = true
        env.sfx.tone(180, 400, 'sawtooth', 0.06, -100)
      }
      if (bricks.every(b => b.hp <= 0)) {
        flash = 1
        env.sfx.tone(880, 300, 'triangle', 0.08, 300)
        build()
        started = false
      }
    },
    down(x) {
      px = x
      if (!started && !over) serve()
    },
    move(x) {
      px = x
    },
    key(k, pressed) {
      if (k === 'left') keyDir = pressed ? -1 : keyDir === -1 ? 0 : keyDir
      if (k === 'right') keyDir = pressed ? 1 : keyDir === 1 ? 0 : keyDir
      if (pressed && !started && !over && (k === 'up' || k === 'left' || k === 'right')) serve()
    },
    draw(g) {
      g.fillStyle = '#0e0c26'
      g.fillRect(0, 0, W, H)
      g.strokeStyle = 'rgba(126,249,255,0.06)'
      g.lineWidth = 1
      for (let x = 0; x < W; x += 25) {
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, H)
        g.stroke()
      }
      if (flash > 0) {
        g.fillStyle = `rgba(255,211,92,${flash * 0.3})`
        g.fillRect(0, 0, W, H)
      }
      for (const b of bricks) {
        if (b.hp <= 0) continue
        g.fillStyle = ROW_COLORS[b.row]
        g.strokeStyle = '#1b1838'
        g.lineWidth = 3
        rrect(g, b.x, b.y, BW, BH, 5)
        g.fill()
        g.stroke()
        g.fillStyle = 'rgba(255,255,255,0.35)'
        g.fillRect(b.x + 4, b.y + 3, BW - 8, 4)
        if (b.hp > 1) {
          g.strokeStyle = 'rgba(27,24,56,0.7)'
          g.lineWidth = 2
          g.strokeRect(b.x + 6, b.y + 6, BW - 12, BH - 12)
        }
      }
      g.fillStyle = '#ffd35c'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 3
      rrect(g, px - pw / 2, PADDLE_Y, pw, 16, 8)
      g.fill()
      g.stroke()
      g.fillStyle = '#fff7e8'
      g.beginPath()
      g.arc(bx, by, R, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      text(g, String(score), 60, 34, 26, '#ffd35c')
      text(g, `Nivel ${level}`, W - 70, 34, 18, '#7ef9ff', 'center', 800)
      if (!started && !over) text(g, level === 1 ? 'Arrastra la pala y toca para sacar' : `¡Nivel ${level}! Toca para seguir`, W / 2, H / 2 + 60, 20)
      if (over) text(g, '¡Se escapó!', W / 2, H / 2 + 40, 34, '#ff5f7e')
    },
  }
}
