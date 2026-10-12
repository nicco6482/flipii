// Apilar: a block slides side to side; tap to drop it on the tower. The overhang is cut off, so
// the tower narrows unless you land a perfect drop. Score = floors stacked.
import { H, W, rrect, text, type Factory } from '../engine'

const BLOCK_H = 34
const BASE_Y = H - 90
const PERFECT = 4

type Block = { x: number; w: number; hue: number }
type Chip = { x: number; y: number; w: number; vy: number; hue: number; rot: number }

export const apilar: Factory = env => {
  const tower: Block[] = [{ x: 90, w: 220, hue: 200 }]
  let cur: Block = { x: 0, w: 220, hue: 209 }
  let dir = 1
  let cam = 0
  let started = false
  let over = false
  let overT = 0
  let perfectFlash = 0
  let combo = 0
  const chips: Chip[] = []

  // Speeds up with every floor: ~190 px/s at the start, 650 px/s from floor ~33.
  const speed = () => Math.min(650, 190 + tower.length * 14)
  const levelY = (i: number) => BASE_Y - i * BLOCK_H

  return {
    bg: '#14122e',
    update(dt) {
      perfectFlash = Math.max(0, perfectFlash - dt * 2.5)
      for (const c of chips) {
        c.vy += 1400 * dt
        c.y += c.vy * dt
        c.rot += dt * 2
      }
      while (chips.length && chips[0].y > H + 400) chips.shift()
      const target = Math.max(0, tower.length * BLOCK_H - (BASE_Y - 260))
      cam += (target - cam) * Math.min(1, dt * 6)
      if (over) {
        overT += dt
        if (overT > 0.9) env.end(tower.length - 1)
        return
      }
      if (!started) return
      cur.x += dir * speed() * dt
      if (cur.x + cur.w > W + 30) dir = -1
      if (cur.x < -30) dir = 1
    },
    down() {
      if (over) return
      if (!started) {
        started = true
        return
      }
      const prev = tower[tower.length - 1]
      const y = levelY(tower.length)
      if (Math.abs(cur.x - prev.x) <= PERFECT) {
        cur.x = prev.x
        combo += 1
        perfectFlash = 1
        // Perfect streaks slowly grow the block back.
        if (combo >= 3) cur.w = Math.min(220, cur.w + 10)
        env.sfx.tone(520 + combo * 60, 120, 'triangle', 0.08)
      } else {
        combo = 0
        const left = Math.max(cur.x, prev.x)
        const right = Math.min(cur.x + cur.w, prev.x + prev.w)
        if (right <= left) {
          chips.push({ x: cur.x, y, w: cur.w, vy: 0, hue: cur.hue, rot: 0 })
          over = true
          env.sfx.tone(200, 400, 'sawtooth', 0.06, -150)
          return
        }
        if (cur.x < left) chips.push({ x: cur.x, y, w: left - cur.x, vy: 0, hue: cur.hue, rot: 0 })
        if (cur.x + cur.w > right) chips.push({ x: right, y, w: cur.x + cur.w - right, vy: 0, hue: cur.hue, rot: 0 })
        cur = { ...cur, x: left, w: right - left }
        env.sfx.tone(330 + tower.length * 8, 70, 'square', 0.05)
      }
      tower.push(cur)
      env.score(tower.length - 1)
      dir = tower.length % 2 ? 1 : -1
      cur = { x: dir > 0 ? -cur.w * 0.6 : W - cur.w * 0.4, w: cur.w, hue: (cur.hue + 9) % 360 }
    },
    draw(g) {
      const sky = g.createLinearGradient(0, 0, 0, H)
      const t = Math.min(1, tower.length / 60)
      sky.addColorStop(0, `hsl(${250 - t * 60}, 55%, ${18 + t * 8}%)`)
      sky.addColorStop(1, `hsl(${280 - t * 60}, 50%, ${28 + t * 10}%)`)
      g.fillStyle = sky
      g.fillRect(0, 0, W, H)
      g.save()
      g.translate(0, cam)
      const drawBlock = (b: Block, y: number) => {
        g.fillStyle = `hsl(${b.hue}, 75%, 58%)`
        g.fillRect(b.x, y, b.w, BLOCK_H)
        g.fillStyle = `hsl(${b.hue}, 80%, 72%)`
        g.fillRect(b.x, y, b.w, 7)
        g.fillStyle = `hsl(${b.hue}, 60%, 42%)`
        g.fillRect(b.x, y + BLOCK_H - 5, b.w, 5)
      }
      g.fillStyle = '#0d0b22'
      g.fillRect(40, BASE_Y + BLOCK_H, W - 80, 400)
      tower.forEach((b, i) => drawBlock(b, levelY(i)))
      if (!over) drawBlock(cur, levelY(tower.length))
      for (const c of chips) {
        g.save()
        g.translate(c.x + c.w / 2, c.y + BLOCK_H / 2)
        g.rotate(c.rot * (c.x < W / 2 ? -1 : 1) * 0.4)
        g.fillStyle = `hsl(${c.hue}, 60%, 50%)`
        g.fillRect(-c.w / 2, -BLOCK_H / 2, c.w, BLOCK_H)
        g.restore()
      }
      if (perfectFlash > 0) {
        const top = tower[tower.length - 1]
        g.strokeStyle = `rgba(255,255,255,${perfectFlash})`
        g.lineWidth = 4
        rrect(g, top.x - 6 * (1 - perfectFlash), levelY(tower.length - 1) - 6 * (1 - perfectFlash), top.w + 12 * (1 - perfectFlash), BLOCK_H + 12 * (1 - perfectFlash), 4)
        g.stroke()
      }
      g.restore()
      text(g, String(tower.length - 1), W / 2, 90, 64, '#ffd35c')
      if (perfectFlash > 0.3) text(g, combo >= 3 ? `¡PERFECTO ×${combo}!` : '¡PERFECTO!', W / 2, 150, 26, '#7ef9ff')
      if (!started) {
        text(g, 'Toca para soltar el bloque', W / 2, H / 2 - 120, 22)
        text(g, 'Si lo clavas, no se recorta', W / 2, H / 2 - 88, 17, '#7ef9ff', 'center', 700)
      }
    },
  }
}
