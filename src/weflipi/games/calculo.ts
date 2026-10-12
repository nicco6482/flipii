// Cálculo (like Playus' Quick Maths): 60 seconds of quick sums. Tap the right answer of four;
// a wrong one costs a point. Questions come from the daily seed, so everyone gets the same ones.
import { H, W, rrect, text, type Factory } from '../engine'

const TIME = 60
const BTN = { w: 170, h: 96, gap: 16, top: 400 }

type Q = { label: string; answer: number; options: number[] }

export const calculo: Factory = env => {
  let t = TIME
  let started = false
  let score = 0
  let streak = 0
  let q: Q
  let flash = 0
  let flashGood = true
  let level = 0

  const int = (a: number, b: number) => a + Math.floor(env.rand() * (b - a + 1))
  const next = () => {
    level += 1
    const kind = level < 6 ? 0 : level < 14 ? int(0, 2) : int(0, 3)
    let a: number
    let b: number
    let answer: number
    let label: string
    if (kind === 0) {
      a = int(2, 9 + level * 2)
      b = int(2, 9 + level * 2)
      answer = a + b
      label = `${a} + ${b}`
    } else if (kind === 1) {
      a = int(10, 20 + level * 3)
      b = int(2, a - 1)
      answer = a - b
      label = `${a} − ${b}`
    } else if (kind === 2) {
      a = int(2, 9)
      b = int(2, Math.min(12, 3 + level / 2))
      answer = a * b
      label = `${a} × ${b}`
    } else {
      b = int(2, 9)
      answer = int(2, 10)
      a = b * answer
      label = `${a} ÷ ${b}`
    }
    const options = new Set([answer])
    while (options.size < 4) {
      const off = int(1, Math.max(3, Math.round(answer * 0.25))) * (env.rand() < 0.5 ? -1 : 1)
      if (answer + off >= 0) options.add(answer + off)
    }
    const list = [...options].sort(() => env.rand() - 0.5)
    q = { label, answer, options: list }
  }
  next()

  const btnRect = (i: number) => {
    const x = W / 2 - BTN.w - BTN.gap / 2 + (i % 2) * (BTN.w + BTN.gap)
    const y = BTN.top + Math.floor(i / 2) * (BTN.h + BTN.gap)
    return { x, y }
  }

  return {
    bg: '#1d2b5c',
    update(dt) {
      flash = Math.max(0, flash - dt * 3)
      if (!started) return
      t -= dt
      if (t <= 0) env.end(Math.max(0, score))
    },
    down(x, y) {
      if (!started) {
        started = true
        return
      }
      for (let i = 0; i < 4; i += 1) {
        const r = btnRect(i)
        if (x < r.x || x > r.x + BTN.w || y < r.y || y > r.y + BTN.h) continue
        if (q.options[i] === q.answer) {
          score += 1
          streak += 1
          flashGood = true
          env.sfx.tone(600 + Math.min(streak, 10) * 40, 80, 'triangle', 0.07)
        } else {
          score = Math.max(0, score - 1)
          streak = 0
          flashGood = false
          env.sfx.tone(160, 200, 'sawtooth', 0.05)
        }
        flash = 1
        env.score(score)
        next()
        return
      }
    },
    draw(g) {
      const bg = g.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#2b3f8c')
      bg.addColorStop(1, '#141b3d')
      g.fillStyle = bg
      g.fillRect(0, 0, W, H)
      if (flash > 0) {
        g.fillStyle = flashGood ? `rgba(43,212,125,${flash * 0.35})` : `rgba(255,45,85,${flash * 0.4})`
        g.fillRect(0, 0, W, H)
      }
      // Time bar.
      g.fillStyle = 'rgba(255,255,255,0.15)'
      rrect(g, 30, 40, W - 60, 16, 8)
      g.fill()
      g.fillStyle = t < 10 ? '#ff5f7e' : '#7ef9ff'
      rrect(g, 30, 40, (W - 60) * Math.max(0, t / TIME), 16, 8)
      g.fill()
      text(g, `${Math.ceil(t)} s`, W / 2, 84, 20, '#fff7e8', 'center', 800)
      text(g, String(score), W / 2, 140, 44, '#ffd35c')
      if (streak >= 3) text(g, `🔥 ${streak} seguidas`, W / 2, 182, 18, '#ff9f43', 'center', 800)
      // Question card.
      g.fillStyle = '#fff7e8'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 5
      rrect(g, 40, 220, W - 80, 140, 24)
      g.fill()
      g.stroke()
      g.font = '900 64px Sora, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillStyle = '#1b1838'
      g.fillText(started ? `${q.label} = ?` : '¿Listo?', W / 2, 292)
      const colors = ['#ff5f7e', '#ffd35c', '#2bd47d', '#a77bff']
      for (let i = 0; i < 4; i += 1) {
        const r = btnRect(i)
        g.fillStyle = 'rgba(0,0,0,0.35)'
        rrect(g, r.x + 4, r.y + 7, BTN.w, BTN.h, 20)
        g.fill()
        g.fillStyle = colors[i]
        g.strokeStyle = '#1b1838'
        g.lineWidth = 4
        rrect(g, r.x, r.y, BTN.w, BTN.h, 20)
        g.fill()
        g.stroke()
        if (started) text(g, String(q.options[i]), r.x + BTN.w / 2, r.y + BTN.h / 2, 40, '#fff7e8')
      }
      if (!started) text(g, 'Toca para empezar', W / 2, H - 50, 22)
    },
  }
}
