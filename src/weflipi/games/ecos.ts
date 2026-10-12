// Ecos: watch the illuminated pads, then replay their order. Each cleared sequence adds one pulse.
import { H, W, rrect, text, type Factory } from '../engine'

type Pad = { x: number; y: number; color: string; edge: string; key: 'left' | 'up' | 'down' | 'right' }

const PAD_SIZE = 138
const PADS: Pad[] = [
  { x: 47, y: 284, color: '#ff6584', edge: '#9e244b', key: 'left' },
  { x: 215, y: 284, color: '#5b8cff', edge: '#274f9d', key: 'up' },
  { x: 47, y: 462, color: '#f6b947', edge: '#aa6819', key: 'down' },
  { x: 215, y: 462, color: '#46cf91', edge: '#16714a', key: 'right' },
]

export const ecos: Factory = env => {
  type Phase = 'intro' | 'show' | 'input' | 'between' | 'fail'
  let phase: Phase = 'intro'
  const sequence: number[] = []
  let preview = -1
  let showIndex = 0
  let timer = 0
  let inputIndex = 0
  let pressed = -1
  let pressedT = 0
  let score = 0
  let pulse = 0

  const beginRound = () => {
    sequence.push(Math.floor(env.rand() * PADS.length))
    phase = 'show'
    preview = -1
    showIndex = 0
    timer = 0.36
    inputIndex = 0
  }

  const activate = (index: number) => {
    if (phase === 'intro') {
      env.fx.vibrate(16)
      env.sfx.tone(350, 100, 'triangle', 0.07, 160)
      beginRound()
      return
    }
    if (phase !== 'input' || index < 0) return
    pressed = index
    pressedT = 0.2
    const pad = PADS[index]
    if (sequence[inputIndex] !== index) {
      phase = 'fail'
      timer = 0
      preview = index
      env.sfx.noise(220, 0.09)
      env.sfx.tone(150, 260, 'sawtooth', 0.07, -70)
      env.fx.shake(0.58)
      env.fx.vibrate(90)
      return
    }
    inputIndex += 1
    env.sfx.tone(500 + index * 90, 75, 'triangle', 0.055, 35)
    env.fx.vibrate(12)
    if (inputIndex >= sequence.length) {
      score += 1
      env.score(score)
      phase = 'between'
      timer = 0.58
      env.fx.burst(pad.x + PAD_SIZE / 2, pad.y + PAD_SIZE / 2, pad.color, 20, 255)
      env.fx.shake(0.18)
      env.fx.vibrate(34)
    }
  }

  const padAt = (x: number, y: number) => PADS.findIndex(p => x >= p.x && x <= p.x + PAD_SIZE && y >= p.y && y <= p.y + PAD_SIZE)

  return {
    bg: '#171338',
    update(dt) {
      pulse += dt
      pressedT = Math.max(0, pressedT - dt * 4.5)
      if (phase === 'show') {
        timer -= dt
        if (timer > 0) return
        if (preview < 0) {
          if (showIndex >= sequence.length) {
            phase = 'input'
            preview = -1
            env.fx.vibrate(10)
            return
          }
          preview = sequence[showIndex]
          timer = Math.max(0.34, 0.52 - sequence.length * 0.012)
          env.sfx.tone(470 + preview * 95, 100, 'triangle', 0.05)
          env.fx.vibrate(8)
        } else {
          preview = -1
          showIndex += 1
          timer = 0.16
        }
      } else if (phase === 'between') {
        timer -= dt
        if (timer <= 0) beginRound()
      } else if (phase === 'fail') {
        timer += dt
        if (timer > 0.95) env.end(score)
      }
    },
    down(x, y) {
      activate(padAt(x, y))
    },
    key(key, pressedKey) {
      if (!pressedKey) return
      activate(PADS.findIndex(p => p.key === key))
    },
    draw(g) {
      const bg = g.createRadialGradient(W / 2, 310, 20, W / 2, 390, 480)
      bg.addColorStop(0, '#39317c')
      bg.addColorStop(0.58, '#201b51')
      bg.addColorStop(1, '#100d2d')
      g.fillStyle = bg
      g.fillRect(0, 0, W, H)
      // Soft concentric rings give the board a physical, speaker-like depth.
      for (let i = 0; i < 4; i += 1) {
        g.strokeStyle = `rgba(126,249,255,${0.06 - i * 0.009})`
        g.lineWidth = 2
        g.beginPath()
        g.arc(W / 2, 424, 94 + i * 82 + Math.sin(pulse * 2) * 3, 0, Math.PI * 2)
        g.stroke()
      }
      g.fillStyle = 'rgba(7,6,24,0.35)'
      rrect(g, 25, 214, W - 50, 438, 32)
      g.fill()
      for (let i = 0; i < PADS.length; i += 1) {
        const p = PADS[i]
        const active = i === preview || (i === pressed && pressedT > 0)
        const cx = p.x + PAD_SIZE / 2
        const cy = p.y + PAD_SIZE / 2
        const lift = active ? 8 : 0
        g.save()
        g.translate(0, -lift)
        g.fillStyle = 'rgba(0,0,0,0.42)'
        rrect(g, p.x + 5, p.y + 13, PAD_SIZE, PAD_SIZE, 27)
        g.fill()
        const material = g.createLinearGradient(p.x, p.y, p.x + PAD_SIZE, p.y + PAD_SIZE)
        material.addColorStop(0, active ? '#fff9e5' : p.color)
        material.addColorStop(0.24, active ? p.color : p.color)
        material.addColorStop(1, p.edge)
        g.fillStyle = material
        g.strokeStyle = '#17132d'
        g.lineWidth = 5
        rrect(g, p.x, p.y, PAD_SIZE, PAD_SIZE, 27)
        g.fill()
        g.stroke()
        g.globalAlpha = active ? 0.7 : 0.25
        g.fillStyle = '#ffffff'
        rrect(g, p.x + 15, p.y + 14, PAD_SIZE - 30, 25, 13)
        g.fill()
        g.globalAlpha = 1
        if (active) {
          const glow = g.createRadialGradient(cx, cy, 10, cx, cy, 100)
          glow.addColorStop(0, 'rgba(255,255,255,0.64)')
          glow.addColorStop(1, 'rgba(255,255,255,0)')
          g.fillStyle = glow
          g.beginPath()
          g.arc(cx, cy, 100, 0, Math.PI * 2)
          g.fill()
        }
        g.restore()
      }
      text(g, 'ECOS', W / 2, 64, 35, '#ffd35c')
      text(g, `${score}`, W / 2, 112, 52, '#fff7e8')
      text(g, 'secuencias', W / 2, 150, 15, '#b6f4ff', 'center', 800)
      if (phase === 'intro') {
        text(g, 'MIRA Y REPITE', W / 2, 188, 24, '#fff7e8')
      } else if (phase === 'show') {
        text(g, 'Mira las luces', W / 2, 188, 19, '#b6f4ff')
      } else if (phase === 'input') {
        text(g, `Repite · ${inputIndex + 1} / ${sequence.length}`, W / 2, 188, 19, '#fff7e8')
      } else if (phase === 'between') {
        text(g, `Siguiente pulso · ${sequence.length + 1}`, W / 2, 188, 19, '#ffd35c')
      } else {
        text(g, 'La secuencia se apagó', W / 2, 188, 19, '#ff9bb0')
      }
      if (phase === 'intro') text(g, 'Toca un bloque para empezar', W / 2, H - 24, 17, '#7ef9ff', 'center', 800)
    },
  }
}
