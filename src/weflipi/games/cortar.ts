// Cortar (like Playus' Slicer): fruit flies up; swipe through it. Several in one swipe = combo.
// Touch a bomb and it's over; let three fruits fall and it's over too. Score = points.
import { H, W, text, type Factory } from '../engine'

const FRUITS = [
  { e: '🍉', c: '#ff5f7e' },
  { e: '🍊', c: '#ff9f43' },
  { e: '🍎', c: '#ff2d55' },
  { e: '🍍', c: '#ffd35c' },
  { e: '🥝', c: '#2bd47d' },
  { e: '🍋', c: '#ffe66d' },
]
const R = 34

type Thing = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; bomb: boolean; kind: number; cut: boolean }
type Half = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; e: string; side: number }
type Drop = { x: number; y: number; vx: number; vy: number; life: number; c: string }

export const cortar: Factory = env => {
  const things: Thing[] = []
  const halves: Half[] = []
  const drops: Drop[] = []
  const trail: { x: number; y: number; t: number }[] = []
  let cutting = false
  let started = false
  let score = 0
  let misses = 0
  let wave = 0
  let nextWave = 0.6
  let over = false
  let overT = 0
  let boom = 0
  let t = 0
  let comboText = ''
  let comboT = 0

  const pace = () => Math.min(1.45, 1 + wave * 0.02)
  const launch = () => {
    wave += 1
    const n = 1 + Math.floor(env.rand() * Math.min(4, 1 + wave / 4))
    for (let i = 0; i < n; i += 1) {
      const bomb = wave > 2 && env.rand() < Math.min(0.35, 0.1 + wave * 0.015)
      const x = 60 + env.rand() * (W - 120)
      // Later waves are thrown harder (and fall faster, see `pace`).
      things.push({ x, y: H + R, vx: (W / 2 - x) * (0.4 + env.rand() * 0.5) * pace(), vy: -(820 + env.rand() * 260) * pace(), rot: 0, vr: (env.rand() - 0.5) * 6, bomb, kind: Math.floor(env.rand() * FRUITS.length), cut: false })
    }
    nextWave = Math.max(0.38, 1.2 - wave * 0.05)
  }

  const slice = (x1: number, y1: number, x2: number, y2: number) => {
    let hits = 0
    for (const th of things) {
      if (th.cut) continue
      // Distance from the fruit to the swipe segment.
      const dx = x2 - x1
      const dy = y2 - y1
      const len2 = dx * dx + dy * dy || 1
      const k = Math.max(0, Math.min(1, ((th.x - x1) * dx + (th.y - y1) * dy) / len2))
      if (Math.hypot(x1 + dx * k - th.x, y1 + dy * k - th.y) > R) continue
      th.cut = true
      if (th.bomb) {
        over = true
        boom = 1
        env.sfx.noise(500, 0.15)
        env.sfx.tone(90, 500, 'sawtooth', 0.08, -40)
        return
      }
      hits += 1
      const f = FRUITS[th.kind]
      for (const side of [-1, 1]) halves.push({ x: th.x, y: th.y, vx: th.vx * 0.5 + side * 120, vy: th.vy * 0.4 - 100, rot: th.rot, vr: side * 5, e: f.e, side })
      for (let i = 0; i < 10; i += 1) drops.push({ x: th.x, y: th.y, vx: (Math.random() - 0.5) * 400, vy: (Math.random() - 0.8) * 400, life: 0.6, c: f.c })
    }
    if (hits) {
      score += hits + (hits >= 3 ? hits : 0)
      if (hits >= 3) {
        comboText = `¡COMBO ×${hits}!`
        comboT = 1
      }
      env.score(score)
      env.sfx.noise(80, 0.07)
      env.sfx.tone(500 + hits * 120, 80, 'triangle', 0.06)
    }
  }

  return {
    bg: '#3b2414',
    update(dt) {
      t += dt
      boom = Math.max(0, boom - dt * 1.5)
      comboT = Math.max(0, comboT - dt)
      while (trail.length && t - trail[0].t > 0.15) trail.shift()
      for (const h of halves) {
        h.vy += 1400 * dt
        h.x += h.vx * dt
        h.y += h.vy * dt
        h.rot += h.vr * dt
      }
      for (const d of drops) {
        d.vy += 900 * dt
        d.x += d.vx * dt
        d.y += d.vy * dt
        d.life -= dt
      }
      while (halves.length && halves[0].y > H + 100) halves.shift()
      while (drops.length && drops[0].life <= 0) drops.shift()
      if (over) {
        overT += dt
        if (overT > 1.1) env.end(score)
        return
      }
      if (!started) return
      nextWave -= dt
      if (nextWave <= 0) launch()
      for (const th of things) {
        th.vy += 1050 * pace() * pace() * dt
        th.x += th.vx * dt
        th.y += th.vy * dt
        th.rot += th.vr * dt
      }
      for (let i = things.length - 1; i >= 0; i -= 1) {
        const th = things[i]
        if (th.cut) things.splice(i, 1)
        else if (th.y > H + R + 10 && th.vy > 0) {
          things.splice(i, 1)
          if (!th.bomb) {
            misses += 1
            env.sfx.tone(220, 150, 'square', 0.04)
            if (misses >= 3) over = true
          }
        }
      }
    },
    down(x, y) {
      if (over) return
      started = true
      cutting = true
      trail.length = 0
      trail.push({ x, y, t })
    },
    move(x, y) {
      if (!cutting || over) return
      const last = trail[trail.length - 1]
      trail.push({ x, y, t })
      if (last) slice(last.x, last.y, x, y)
    },
    up() {
      cutting = false
    },
    draw(g) {
      const wood = g.createLinearGradient(0, 0, 0, H)
      wood.addColorStop(0, '#5a3720')
      wood.addColorStop(1, '#2e1b0f')
      g.fillStyle = wood
      g.fillRect(0, 0, W, H)
      g.strokeStyle = 'rgba(0,0,0,0.25)'
      g.lineWidth = 3
      for (let y = 60; y < H; y += 90) {
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(W, y + 10)
        g.stroke()
      }
      for (const d of drops) {
        g.globalAlpha = Math.max(0, d.life / 0.6)
        g.fillStyle = d.c
        g.beginPath()
        g.arc(d.x, d.y, 5, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillStyle = '#000'
      for (const th of things) {
        g.save()
        g.translate(th.x, th.y)
        g.rotate(th.rot)
        g.font = `${R * 2}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
        g.fillText(th.bomb ? '💣' : FRUITS[th.kind].e, 0, 0)
        g.restore()
      }
      for (const h of halves) {
        g.save()
        g.translate(h.x, h.y)
        g.rotate(h.rot)
        g.beginPath()
        g.rect(h.side < 0 ? -R - 4 : 0, -R - 4, R + 4, R * 2 + 8)
        g.clip()
        g.font = `${R * 2}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
        g.fillText(h.e, 0, 0)
        g.restore()
      }
      if (trail.length > 1) {
        g.strokeStyle = '#fff7e8'
        g.lineCap = 'round'
        for (let i = 1; i < trail.length; i += 1) {
          g.lineWidth = 2 + (i / trail.length) * 9
          g.beginPath()
          g.moveTo(trail[i - 1].x, trail[i - 1].y)
          g.lineTo(trail[i].x, trail[i].y)
          g.stroke()
        }
      }
      if (boom > 0) {
        g.fillStyle = `rgba(255,255,255,${boom})`
        g.fillRect(0, 0, W, H)
      }
      text(g, String(score), 60, 60, 44, '#ffd35c')
      for (let i = 0; i < 3; i += 1) text(g, i < misses ? '✖' : '✕', W - 110 + i * 34, 60, 26, i < misses ? '#ff2d55' : 'rgba(255,255,255,0.35)')
      if (comboT > 0) text(g, comboText, W / 2, 200, 34, '#7ef9ff')
      if (!started) {
        text(g, 'Desliza para cortar la fruta', W / 2, H / 2 - 20, 22)
        text(g, '¡Cuidado con las bombas! 💣', W / 2, H / 2 + 16, 18, '#ff9f43', 'center', 800)
      }
      if (over && boom === 0 && misses >= 3) text(g, '¡Se te han caído 3!', W / 2, H / 2, 30, '#ff5f7e')
    },
  }
}
