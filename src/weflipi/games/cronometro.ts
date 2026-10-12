// Cronómetro: stop the clock at exactly 10.00 s. The digits vanish after a few seconds,
// so each of the three rounds relies on internal timing. Lower total error wins.
import { H, W, rrect, text, type Factory } from '../engine'

const ROUNDS = 3
const TARGET = 10_000
/** How long the digits stay visible, per round: less help each time. */
const VISIBLE = [3_000, 2_000, 1_000]

export const cronometro: Factory = env => {
  type Phase = 'ready' | 'running' | 'shown'
  let phase: Phase = 'ready'
  let startAt = 0
  let elapsed = 0
  const errors: number[] = []
  let last = 0
  let shownT = 0
  let pulse = 0
  let hiddenCue = false
  let impact = 0

  return {
    bg: '#14112e',
    update(dt) {
      pulse += dt
      impact = Math.max(0, impact - dt * 2.8)
      if (phase === 'running') {
        elapsed = performance.now() - startAt
        const visibleUntil = VISIBLE[Math.min(errors.length, VISIBLE.length - 1)]
        if (!hiddenCue && elapsed >= visibleUntil) {
          hiddenCue = true
          env.sfx.tone(290, 55, 'triangle', 0.035, -35)
          env.fx.vibrate(10)
        }
      }
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
        hiddenCue = false
        impact = 0.35
        env.sfx.tone(520, 80, 'triangle', 0.07)
        env.fx.vibrate(14)
      } else if (phase === 'running') {
        elapsed = performance.now() - startAt
        last = elapsed
        const err = Math.round(Math.abs(elapsed - TARGET))
        errors.push(err)
        env.score(errors.reduce((a, b) => a + b, 0))
        phase = 'shown'
        shownT = 0
        impact = 1
        env.sfx.tone(err < 100 ? 990 : err < 500 ? 660 : 300, 160, 'triangle', 0.08)
        env.fx.burst(W / 2, 300, err < 100 ? '#2bd47d' : err < 500 ? '#ffd35c' : '#ff9f43', err < 100 ? 40 : 18, err < 100 ? 360 : 220)
        if (err > 800) env.fx.shake(0.22)
        env.fx.vibrate(err < 100 ? 60 : err < 500 ? 30 : 20)
      }
    },
    draw(g) {
      const backdrop = g.createRadialGradient(W / 2, 275, 20, W / 2, 320, 480)
      backdrop.addColorStop(0, '#312a6b')
      backdrop.addColorStop(0.54, '#1d1949')
      backdrop.addColorStop(1, '#0d0b25')
      g.fillStyle = backdrop
      g.fillRect(0, 0, W, H)
      // Clock face.
      const cx = W / 2
      const cy = 300
      const r = 140
      g.fillStyle = 'rgba(0,0,0,0.32)'
      g.beginPath()
      g.ellipse(cx + 8, cy + r + 18, r * 0.88, 18, 0, 0, Math.PI * 2)
      g.fill()
      const rim = g.createRadialGradient(cx - r * 0.34, cy - r * 0.42, r * 0.1, cx, cy, r * 1.1)
      rim.addColorStop(0, '#ffffff')
      rim.addColorStop(0.16, '#f8edce')
      rim.addColorStop(0.8, '#b6a16c')
      rim.addColorStop(1, '#584d38')
      g.fillStyle = rim
      g.strokeStyle = '#1b1838'
      g.lineWidth = 8
      g.beginPath()
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#f6e7c4'
      g.beginPath()
      g.arc(cx, cy, r - 11, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.56)'
      g.beginPath()
      g.ellipse(cx - 32, cy - 54, 62, 32, -0.7, 0, Math.PI * 2)
      g.fill()
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2
        g.strokeStyle = '#1b1838'
        g.lineWidth = i === 0 ? 6 : 3
        g.beginPath()
        g.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14))
        g.lineTo(cx + Math.cos(a) * (r - 30), cy + Math.sin(a) * (r - 30))
        g.stroke()
      }
      g.strokeStyle = '#ffd35c'
      g.lineWidth = 7
      g.beginPath()
      g.moveTo(cx, cy - r + 7)
      g.lineTo(cx, cy - r + 27)
      g.stroke()
      g.fillStyle = '#ff2d55'
      g.beginPath()
      g.arc(cx, cy - r + 36, 7, 0, Math.PI * 2)
      g.fill()
      const hidden = phase === 'running' && elapsed > VISIBLE[Math.min(errors.length, VISIBLE.length - 1)]
      const shownMs = phase === 'shown' ? last : elapsed
      if (!hidden) {
        const a = (shownMs / TARGET) * Math.PI * 2 - Math.PI / 2
        g.strokeStyle = `rgba(255,45,85,${0.22 + impact * 0.3})`
        g.lineWidth = 15 + impact * 9
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(cx, cy)
        g.lineTo(cx + Math.cos(a) * (r - 35), cy + Math.sin(a) * (r - 35))
        g.stroke()
        g.strokeStyle = '#ff2d55'
        g.lineWidth = 5
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(cx, cy)
        g.lineTo(cx + Math.cos(a) * (r - 34), cy + Math.sin(a) * (r - 34))
        g.stroke()
      } else {
        const mask = g.createRadialGradient(cx - 35, cy - 48, 10, cx, cy, r)
        mask.addColorStop(0, '#3c3868')
        mask.addColorStop(1, '#15122f')
        g.fillStyle = mask
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
        text(g, `${(last > TARGET ? '+' : '−') + (e / 1000).toFixed(2).replace('.', ',')} s`, W / 2, 570, 26, e < 100 ? '#2bd47d' : '#ff9f43')
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
