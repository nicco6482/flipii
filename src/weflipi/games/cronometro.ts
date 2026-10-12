// Cronómetro (like Playus' Times Up): stop the clock at exactly 10.00 s. The digits vanish after
// 3 seconds, so you have to count in your head. Three rounds; score = total error in ms (lower wins).
import { H, W, rrect, text, type Factory } from '../engine'

const ROUNDS = 3
const TARGET = 10_000
const VISIBLE = 3_000

export const cronometro: Factory = env => {
  type Phase = 'ready' | 'running' | 'shown'
  let phase: Phase = 'ready'
  let startAt = 0
  let elapsed = 0
  const errors: number[] = []
  let last = 0
  let shownT = 0
  let pulse = 0

  return {
    bg: '#14112e',
    update(dt) {
      pulse += dt
      if (phase === 'running') elapsed = performance.now() - startAt
      if (phase === 'shown') {
        shownT += dt
        if (errors.length >= ROUNDS && shownT > 1.6) env.end(Math.min(30_000, errors.reduce((a, b) => a + b, 0)))
      }
    },
    down() {
      if (phase === 'ready' || (phase === 'shown' && errors.length < ROUNDS && shownT > 0.4)) {
        phase = 'running'
        startAt = performance.now()
        elapsed = 0
        env.sfx.tone(520, 80, 'triangle', 0.07)
      } else if (phase === 'running') {
        elapsed = performance.now() - startAt
        last = elapsed
        const err = Math.round(Math.abs(elapsed - TARGET))
        errors.push(err)
        env.score(errors.reduce((a, b) => a + b, 0))
        phase = 'shown'
        shownT = 0
        env.sfx.tone(err < 100 ? 990 : err < 500 ? 660 : 300, 160, 'triangle', 0.08)
      }
    },
    draw(g) {
      g.fillStyle = '#14112e'
      g.fillRect(0, 0, W, H)
      // Clock face.
      const cx = W / 2
      const cy = 300
      const r = 140
      g.fillStyle = '#fff7e8'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 8
      g.beginPath()
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2
        g.strokeStyle = '#1b1838'
        g.lineWidth = i === 0 ? 6 : 3
        g.beginPath()
        g.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14))
        g.lineTo(cx + Math.cos(a) * (r - 30), cy + Math.sin(a) * (r - 30))
        g.stroke()
      }
      g.fillStyle = '#ff2d55'
      g.beginPath()
      g.arc(cx, cy - r + 36, 7, 0, Math.PI * 2)
      g.fill()
      const hidden = phase === 'running' && elapsed > VISIBLE
      const shownMs = phase === 'shown' ? last : elapsed
      if (!hidden) {
        const a = (shownMs / TARGET) * Math.PI * 2 - Math.PI / 2
        g.strokeStyle = '#ff2d55'
        g.lineWidth = 5
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(cx, cy)
        g.lineTo(cx + Math.cos(a) * (r - 34), cy + Math.sin(a) * (r - 34))
        g.stroke()
      } else {
        g.fillStyle = 'rgba(27,24,56,0.9)'
        g.beginPath()
        g.arc(cx, cy, r - 6, 0, Math.PI * 2)
        g.fill()
        text(g, '?', cx, cy, 110 + Math.sin(pulse * 4) * 6, '#ffd35c')
      }
      g.fillStyle = '#1b1838'
      g.beginPath()
      g.arc(cx, cy, 10, 0, Math.PI * 2)
      g.fill()
      const secs = (shownMs / 1000).toFixed(2).replace('.', ',')
      text(g, hidden ? '??,??' : `${secs} s`, W / 2, 500, 48, phase === 'shown' ? '#ffd35c' : '#fff7e8')
      if (phase === 'ready') text(g, 'Toca para arrancar y para en 10,00 s', W / 2, 570, 18, '#7ef9ff', 'center', 800)
      if (phase === 'running') text(g, hidden ? 'Cuenta en tu cabeza… ¡y toca!' : 'Toca en 10,00 s', W / 2, 570, 18, '#7ef9ff', 'center', 800)
      if (phase === 'shown') {
        const e = errors[errors.length - 1]
        text(g, e < 50 ? '¡CLAVADO!' : `${(elapsed > TARGET ? '+' : '−') + (e / 1000).toFixed(2).replace('.', ',')} s`, W / 2, 570, 26, e < 100 ? '#2bd47d' : '#ff9f43')
        if (errors.length < ROUNDS) text(g, 'Toca para la siguiente', W / 2, 615, 18)
      }
      for (let i = 0; i < ROUNDS; i += 1) {
        g.fillStyle = i < errors.length ? '#ffd35c' : 'rgba(255,255,255,0.2)'
        rrect(g, W / 2 - 60 + i * 44, 80, 32, 10, 5)
        g.fill()
      }
      text(g, 'Error total', W / 2, 120, 14, 'rgba(255,247,232,0.7)', 'center', 700)
      text(g, `${errors.reduce((a, b) => a + b, 0)} ms`, W / 2, 148, 24, '#ffd35c')
    },
  }
}
