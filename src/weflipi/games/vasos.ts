// Vasos (like Playus' Balls & Cups): watch the ball go under a cup, follow the shuffle, tap the cup.
// Each round adds swaps and speed. One mistake ends it. Score = rounds won. Same shuffles for all.
import { H, W, text, type Factory } from '../engine'

const CUPS = 3
const SLOT_X = [W / 2 - 120, W / 2, W / 2 + 120]
const CUP_Y = 400

export const vasos: Factory = env => {
  type Phase = 'intro' | 'show' | 'shuffle' | 'pick' | 'reveal'
  let phase: Phase = 'intro'
  let round = 0
  let score = 0
  // pos[c] = slot of cup c; the ball sits under cup `ballCup`.
  let pos = [0, 1, 2]
  let ballCup = 1
  let swaps: [number, number][] = []
  let swapI = 0
  let swapT = 0
  let swapDur = 0.5
  let lift = 0
  let phaseT = 0
  let picked = -1
  let lost = false

  const startRound = () => {
    round += 1
    pos = [0, 1, 2]
    ballCup = Math.floor(env.rand() * CUPS)
    const n = 4 + round * 3
    swaps = Array.from({ length: n }, () => {
      const a = Math.floor(env.rand() * CUPS)
      const b = (a + 1 + Math.floor(env.rand() * (CUPS - 1))) % CUPS
      return [a, b] as [number, number]
    })
    swapDur = Math.max(0.11, 0.42 - round * 0.05)
    swapI = 0
    swapT = 0
    phase = 'show'
    phaseT = 0
    picked = -1
  }

  const cupX = (c: number) => {
    if (phase !== 'shuffle' || swapI >= swaps.length) return SLOT_X[pos[c]]
    const [a, b] = swaps[swapI]
    const k = Math.min(1, swapT / swapDur)
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
    if (c === a) return SLOT_X[pos[a]] + (SLOT_X[pos[b]] - SLOT_X[pos[a]]) * e
    if (c === b) return SLOT_X[pos[b]] + (SLOT_X[pos[a]] - SLOT_X[pos[b]]) * e
    return SLOT_X[pos[c]]
  }
  const cupYOffset = (c: number) => {
    if (phase !== 'shuffle' || swapI >= swaps.length) return 0
    const [a, b] = swaps[swapI]
    const k = Math.min(1, swapT / swapDur)
    return c === a ? -Math.sin(k * Math.PI) * 30 : c === b ? Math.sin(k * Math.PI) * 30 : 0
  }

  return {
    bg: '#5b2a86',
    update(dt) {
      phaseT += dt
      if (phase === 'show') {
        lift = phaseT < 1.2 ? Math.min(1, phaseT * 4) : Math.max(0, 1 - (phaseT - 1.2) * 4)
        if (phaseT > 1.5) {
          phase = 'shuffle'
          phaseT = 0
        }
      } else if (phase === 'shuffle') {
        swapT += dt
        if (swapT >= swapDur) {
          const [a, b] = swaps[swapI]
          ;[pos[a], pos[b]] = [pos[b], pos[a]]
          env.sfx.tone(260 + swapI * 8, 30, 'square', 0.03)
          swapI += 1
          swapT = 0
          if (swapI >= swaps.length) phase = 'pick'
        }
      } else if (phase === 'reveal') {
        lift = Math.min(1, phaseT * 4)
        if (phaseT > 1.3) {
          if (lost) env.end(score)
          else startRound()
        }
      }
    },
    down(x) {
      if (phase === 'intro') {
        startRound()
        return
      }
      if (phase !== 'pick') return
      let best = 0
      for (let c = 1; c < CUPS; c += 1) if (Math.abs(cupX(c) - x) < Math.abs(cupX(best) - x)) best = c
      picked = best
      lost = best !== ballCup
      if (!lost) {
        score += 1
        env.score(score)
        env.sfx.tone(784, 160, 'triangle', 0.08)
        env.fx.burst(cupX(best), CUP_Y - 40, '#2bd47d', 24, 300)
        env.fx.vibrate(30)
      } else {
        env.sfx.tone(180, 300, 'sawtooth', 0.06)
        env.fx.shake(0.4)
        env.fx.vibrate(100)
      }
      phase = 'reveal'
      phaseT = 0
    },
    draw(g) {
      const bg = g.createRadialGradient(W / 2, 380, 30, W / 2, 380, 500)
      bg.addColorStop(0, '#8a46c4')
      bg.addColorStop(1, '#2e1347')
      g.fillStyle = bg
      g.fillRect(0, 0, W, H)
      // Table.
      g.fillStyle = '#7a4a28'
      g.fillRect(0, CUP_Y + 70, W, H)
      g.fillStyle = '#9b6236'
      g.fillRect(0, CUP_Y + 70, W, 14)
      // Ball (visible when the right cup lifts).
      const showBall = phase === 'show' || phase === 'reveal' || phase === 'intro'
      if (showBall) {
        const bx = phase === 'intro' ? SLOT_X[1] : cupX(ballCup)
        g.fillStyle = '#ff2d55'
        g.strokeStyle = '#1b1838'
        g.lineWidth = 4
        g.beginPath()
        g.arc(bx, CUP_Y + 48, 20, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = 'rgba(255,255,255,0.6)'
        g.beginPath()
        g.arc(bx - 6, CUP_Y + 41, 6, 0, Math.PI * 2)
        g.fill()
      }
      for (let c = 0; c < CUPS; c += 1) {
        const up = (phase === 'show' && c === ballCup) || (phase === 'reveal' && (c === picked || c === ballCup)) ? lift * 90 : phase === 'intro' ? 0 : 0
        const x = cupX(c)
        const y = CUP_Y - up + cupYOffset(c)
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.beginPath()
        g.ellipse(x, CUP_Y + 72, 52, 10, 0, 0, Math.PI * 2)
        g.fill()
        const body = g.createLinearGradient(x - 55, 0, x + 55, 0)
        body.addColorStop(0, '#c0392b')
        body.addColorStop(0.45, '#ff5f4e')
        body.addColorStop(1, '#a52a1f')
        g.fillStyle = body
        g.strokeStyle = '#1b1838'
        g.lineWidth = 5
        g.beginPath()
        g.moveTo(x - 38, y - 70)
        g.lineTo(x + 38, y - 70)
        g.lineTo(x + 55, y + 70)
        g.lineTo(x - 55, y + 70)
        g.closePath()
        g.fill()
        g.stroke()
        g.fillStyle = '#fff7e8'
        g.fillRect(x - 46, y + 10, 92, 14)
        g.fillStyle = '#e04030'
        g.beginPath()
        g.ellipse(x, y - 70, 38, 9, 0, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      }
      text(g, String(score), W / 2, 90, 60, '#ffd35c')
      const msg =
        phase === 'intro' ? 'Sigue la bola. Toca para empezar' : phase === 'show' ? '¡Mira dónde está!' : phase === 'shuffle' ? 'No le quites ojo…' : phase === 'pick' ? '¿Dónde está la bola?' : lost ? '¡Uy! Era otro' : '¡Bien visto!'
      text(g, msg, W / 2, 190, 24, phase === 'reveal' ? (lost ? '#ff5f7e' : '#2bd47d') : '#fff7e8')
      if (round) text(g, `Ronda ${round}`, W / 2, 230, 16, '#7ef9ff', 'center', 800)
    },
  }
}
