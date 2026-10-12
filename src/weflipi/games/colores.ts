// Colores (like Playus' Color Reflex): a colour name is written in a different ink. Tap the INK
// colour, not the word. 45 seconds; right +1, wrong −1. Same sequence for everyone today.
import { H, W, rrect, text, type Factory } from '../engine'

const TIME = 45
const COLORS = [
  { name: 'ROJO', hex: '#ff2d55' },
  { name: 'AZUL', hex: '#3d7bff' },
  { name: 'VERDE', hex: '#2bd47d' },
  { name: 'AMARILLO', hex: '#ffd35c' },
]
const BTN = { w: 170, h: 90, gap: 16, top: 430 }

export const colores: Factory = env => {
  let t = TIME
  let started = false
  let score = 0
  let word = 0
  let ink = 1
  let flash = 0
  let good = true
  let shake = 0
  let left = 0
  // Time to answer each word: 2.6 s at first, down to 0.9 s.
  const limit = () => Math.max(0.9, 2.6 - score * 0.07)

  const next = () => {
    word = Math.floor(env.rand() * 4)
    // Mostly mismatched (that's the trick), sometimes the same to keep you honest.
    ink = env.rand() < 0.2 ? word : (word + 1 + Math.floor(env.rand() * 3)) % 4
    left = limit()
  }
  next()

  const btn = (i: number) => ({ x: W / 2 - BTN.w - BTN.gap / 2 + (i % 2) * (BTN.w + BTN.gap), y: BTN.top + Math.floor(i / 2) * (BTN.h + BTN.gap) })

  return {
    bg: '#1b1838',
    update(dt) {
      flash = Math.max(0, flash - dt * 3)
      shake = Math.max(0, shake - dt * 4)
      if (!started) return
      t -= dt
      left -= dt
      if (left <= 0) {
        good = false
        score = Math.max(0, score - 1)
        flash = 1
        shake = 1
        env.score(score)
        env.sfx.tone(150, 200, 'sawtooth', 0.06)
        env.fx.vibrate(60)
        next()
      }
      if (t <= 0) env.end(Math.max(0, score))
    },
    down(x, y) {
      if (!started) {
        started = true
        return
      }
      for (let i = 0; i < 4; i += 1) {
        const r = btn(i)
        if (x < r.x || x > r.x + BTN.w || y < r.y || y > r.y + BTN.h) continue
        good = i === ink
        score = Math.max(0, score + (good ? 1 : -1))
        flash = 1
        if (!good) shake = 1
        env.score(score)
        env.sfx.tone(good ? 700 : 150, good ? 70 : 200, good ? 'triangle' : 'sawtooth', 0.06)
        if (good) env.fx.burst(r.x + BTN.w / 2, r.y + BTN.h / 2, COLORS[i].hex, 12, 220)
        else {
          env.fx.shake(0.35)
          env.fx.vibrate(60)
        }
        next()
        return
      }
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
      g.fillStyle = t < 10 ? '#ff5f7e' : '#7ef9ff'
      rrect(g, 30, 40, (W - 60) * Math.max(0, t / TIME), 16, 8)
      g.fill()
      text(g, String(score), W / 2, 110, 48, '#ffd35c')
      const sx = Math.sin(shake * 40) * shake * 10
      g.fillStyle = '#fff7e8'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 5
      rrect(g, 30 + sx, 190, W - 60, 180, 26)
      g.fill()
      g.stroke()
      if (started) {
        // Per-word fuse under the card.
        g.fillStyle = 'rgba(255,255,255,0.15)'
        rrect(g, 60, 386, W - 120, 10, 5)
        g.fill()
        g.fillStyle = left < 0.6 ? '#ff2d55' : '#ffd35c'
        rrect(g, 60, 386, (W - 120) * Math.max(0, left / limit()), 10, 5)
        g.fill()
        g.font = `900 ${COLORS[word].name.length > 5 ? 52 : 66}px Sora, system-ui, sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillStyle = COLORS[ink].hex
        g.fillText(COLORS[word].name, W / 2 + sx, 282)
      } else {
        text(g, 'Pulsa el color', W / 2, 260, 28, '#1b1838')
        text(g, 'de la TINTA', W / 2, 300, 28, '#ff2d55')
      }
      for (let i = 0; i < 4; i += 1) {
        const r = btn(i)
        g.fillStyle = 'rgba(0,0,0,0.35)'
        rrect(g, r.x + 4, r.y + 7, BTN.w, BTN.h, 22)
        g.fill()
        g.fillStyle = COLORS[i].hex
        g.strokeStyle = '#1b1838'
        g.lineWidth = 4
        rrect(g, r.x, r.y, BTN.w, BTN.h, 22)
        g.fill()
        g.stroke()
      }
      text(g, started ? `${Math.ceil(t)} s` : 'Toca para empezar', W / 2, H - 50, 20)
    },
  }
}
