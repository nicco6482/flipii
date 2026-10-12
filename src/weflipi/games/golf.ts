// Golf: three mini-golf holes. Drag back from anywhere like a slingshot and let go to putt.
// Score = total strokes (lower is better); a hole is capped at 8 strokes.
import { H, W, rrect, text, type Factory } from '../engine'

const BALL_R = 9
const CUP_R = 14
const MAX_STROKES = 8
const MAX_PULL = 170
const MAX_SPEED = 1000

type Rect = { x: number; y: number; w: number; h: number }
/** A bar sliding left and right between x0 and x1 (each hole's is faster than the last). */
type Mover = { y: number; w: number; h: number; x0: number; x1: number; speed: number }
type Hole = { tee: [number, number]; cup: [number, number]; walls: Rect[]; movers: Mover[]; par: number }

const BORDER: Rect[] = [
  { x: 0, y: 0, w: W, h: 24 },
  { x: 0, y: H - 24, w: W, h: 24 },
  { x: 0, y: 0, w: 24, h: H },
  { x: W - 24, y: 0, w: 24, h: H },
]

export const HOLES: Hole[] = [
  { tee: [200, 610], cup: [200, 120], par: 2, walls: [{ x: 110, y: 350, w: 180, h: 22 }], movers: [{ y: 220, w: 120, h: 18, x0: 24, x1: 256, speed: 1.3 }] },
  {
    tee: [80, 620],
    cup: [320, 100],
    par: 3,
    walls: [
      { x: 24, y: 430, w: 250, h: 22 },
      { x: 126, y: 250, w: 250, h: 22 },
    ],
    movers: [{ y: 160, w: 100, h: 18, x0: 24, x1: 276, speed: 1.8 }],
  },
  {
    tee: [200, 625],
    cup: [200, 110],
    par: 3,
    walls: [
      { x: 24, y: 360, w: 140, h: 22 },
      { x: 236, y: 360, w: 140, h: 22 },
      { x: 170, y: 190, w: 60, h: 60 },
      { x: 90, y: 500, w: 40, h: 40 },
      { x: 270, y: 500, w: 40, h: 40 },
    ],
    movers: [{ y: 290, w: 90, h: 18, x0: 24, x1: 286, speed: 2.4 }],
  },
]

export const golf: Factory = env => {
  let hole = 0
  let strokes = 0
  let total = 0
  let bx = HOLES[0].tee[0]
  let by = HOLES[0].tee[1]
  let vx = 0
  let vy = 0
  let pulling = false
  let px = 0
  let py = 0
  let sx = 0
  let sy = 0
  let sinking = -1
  let banner = ''
  let bannerT = 0
  let done = false
  let lastSafe: [number, number] = [bx, by]

  const moving = () => Math.hypot(vx, vy) > 4
  const h = () => HOLES[hole]

  const nextHole = () => {
    total += strokes
    env.score(total)
    strokes = 0
    if (hole + 1 >= HOLES.length) {
      done = true
      setTimeout(() => env.end(total), 900)
      return
    }
    sinking = -1
    hole += 1
    ;[bx, by] = h().tee
    vx = vy = 0
  }

  let clock = 0
  const moverRect = (m: Mover): Rect => ({ x: m.x0 + ((Math.sin(clock * m.speed) + 1) / 2) * (m.x1 - m.x0), y: m.y, w: m.w, h: m.h })
  const walls = () => [...h().walls, ...h().movers.map(moverRect)]

  const hitWalls = () => {
    for (const r of [...BORDER, ...walls()]) {
      const cx = Math.max(r.x, Math.min(bx, r.x + r.w))
      const cy = Math.max(r.y, Math.min(by, r.y + r.h))
      const dx = bx - cx
      const dy = by - cy
      const d = Math.hypot(dx, dy)
      if (d < BALL_R && d > 0) {
        const nx = dx / d
        const ny = dy / d
        bx = cx + nx * BALL_R
        by = cy + ny * BALL_R
        const dot = vx * nx + vy * ny
        if (dot < 0) {
          vx -= 1.8 * dot * nx
          vy -= 1.8 * dot * ny
          if (Math.abs(dot) > 80) env.sfx.tone(300, 30, 'square', 0.03)
        }
      } else if (d === 0) {
        // Centre inside a wall (tunnelled): put it back where it last rested.
        ;[bx, by] = lastSafe
        vx = vy = 0
      }
    }
  }

  return {
    bg: '#1f6b34',
    update(dt) {
      bannerT = Math.max(0, bannerT - dt)
      clock += dt
      if (done) return
      if (sinking >= 0) {
        sinking += dt
        const [cx, cy] = h().cup
        bx += (cx - bx) * Math.min(1, dt * 12)
        by += (cy - by) * Math.min(1, dt * 12)
        if (sinking > 0.7) nextHole()
        return
      }
      const steps = 6
      for (let s = 0; s < steps; s += 1) {
        const step = dt / steps
        bx += vx * step
        by += vy * step
        hitWalls()
        const sp = Math.hypot(vx, vy)
        if (sp > 0) {
          const ns = Math.max(0, sp - (260 + sp * 0.9) * step)
          vx *= ns / sp
          vy *= ns / sp
        }
        const [cx, cy] = h().cup
        const dc = Math.hypot(bx - cx, by - cy)
        if (dc < CUP_R - 2 && Math.hypot(vx, vy) < 520) {
          sinking = 0
          vx = vy = 0
          const diff = strokes - h().par
          banner = strokes === 1 ? '¡HOYO EN UNO!' : diff <= -1 ? '¡BIRDIE!' : diff === 0 ? 'PAR' : `+${diff}`
          bannerT = 1.4
          env.sfx.tone(523, 120, 'triangle', 0.08)
          setTimeout(() => env.sfx.tone(784, 180, 'triangle', 0.08), 120)
          return
        }
        if (dc < CUP_R + 6 && dc > 0) {
          // The cup's slope pulls a slow ball in.
          vx += ((cx - bx) / dc) * 300 * step
          vy += ((cy - by) / dc) * 300 * step
        }
      }
      if (!moving()) {
        vx = vy = 0
        lastSafe = [bx, by]
        if (strokes >= MAX_STROKES && sinking < 0) {
          banner = 'Máximo de golpes'
          bannerT = 1.2
          nextHole()
        }
      }
    },
    down(x, y) {
      if (moving() || sinking >= 0 || done) return
      pulling = true
      sx = px = x
      sy = py = y
    },
    move(x, y) {
      if (!pulling) return
      px = x
      py = y
    },
    up(x, y) {
      if (!pulling) return
      pulling = false
      let dx = sx - x
      let dy = sy - y
      const len = Math.hypot(dx, dy)
      if (len < 12) return
      const power = Math.min(len, MAX_PULL) / MAX_PULL
      dx /= len
      dy /= len
      vx = dx * power * MAX_SPEED
      vy = dy * power * MAX_SPEED
      strokes += 1
      env.sfx.tone(180 + power * 300, 60, 'triangle', 0.08)
    },
    draw(g) {
      g.fillStyle = '#1f6b34'
      g.fillRect(0, 0, W, H)
      for (let y = 0; y < H; y += 40) {
        g.fillStyle = (y / 40) % 2 ? '#3fa35a' : '#46ad61'
        g.fillRect(24, y, W - 48, 40)
      }
      g.fillStyle = '#8d5a2b'
      for (const r of BORDER) g.fillRect(r.x, r.y, r.w, r.h)
      for (const r of walls()) {
        g.fillStyle = 'rgba(0,0,0,0.25)'
        rrect(g, r.x + 4, r.y + 5, r.w, r.h, 6)
        g.fill()
        g.fillStyle = '#b07a3f'
        g.strokeStyle = '#1b1838'
        g.lineWidth = 3
        rrect(g, r.x, r.y, r.w, r.h, 6)
        g.fill()
        g.stroke()
      }
      const [cx, cy] = h().cup
      g.fillStyle = '#0d1f12'
      g.beginPath()
      g.arc(cx, cy, CUP_R, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#fff7e8'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(cx + 2, cy)
      g.lineTo(cx + 2, cy - 54)
      g.stroke()
      g.fillStyle = '#ff2d55'
      g.beginPath()
      g.moveTo(cx + 2, cy - 54)
      g.lineTo(cx + 30, cy - 45)
      g.lineTo(cx + 2, cy - 36)
      g.closePath()
      g.fill()
      if (pulling) {
        const dx = sx - px
        const dy = sy - py
        const len = Math.min(Math.hypot(dx, dy), MAX_PULL)
        const a = Math.atan2(dy, dx)
        const power = len / MAX_PULL
        g.strokeStyle = `hsl(${120 - power * 120}, 90%, 60%)`
        g.lineWidth = 6
        g.setLineDash([10, 8])
        g.beginPath()
        g.moveTo(bx, by)
        g.lineTo(bx + Math.cos(a) * len * 1.1, by + Math.sin(a) * len * 1.1)
        g.stroke()
        g.setLineDash([])
      }
      const r = sinking >= 0 ? BALL_R * Math.max(0.2, 1 - sinking) : BALL_R
      g.fillStyle = 'rgba(0,0,0,0.3)'
      g.beginPath()
      g.arc(bx + 3, by + 4, r, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#ffffff'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 2.5
      g.beginPath()
      g.arc(bx, by, r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = 'rgba(27,24,56,0.8)'
      rrect(g, 34, H - 70, W - 68, 36, 10)
      g.fill()
      text(g, `Hoyo ${hole + 1}/${HOLES.length} · Par ${h().par}`, 130, H - 52, 15, '#fff7e8', 'center', 800)
      text(g, `Golpes ${strokes} · Total ${total + strokes}`, 280, H - 52, 15, '#ffd35c', 'center', 800)
      if (bannerT > 0) text(g, banner, W / 2, H / 2 - 30, 40, '#7ef9ff')
      else if (hole === 0 && strokes === 0 && !pulling) {
        text(g, 'Arrastra hacia atrás', W / 2, H / 2 + 120, 20)
        text(g, 'y suelta para golpear', W / 2, H / 2 + 148, 20)
      }
    },
  }
}
