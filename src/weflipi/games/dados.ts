// Dados (like Playus' Dice Roll): five dice, one at a time. Each die spins through 1→6 faster and
// faster; tap to stop it. Score = sum of the five dice (max 30), so aim for the six.
import { H, W, rrect, text, type Factory } from '../engine'

const DICE = 5
const SPEEDS = [0.13, 0.1, 0.08, 0.064, 0.052] // seconds per face, per die

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
}

function die(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, face: number, rot = 0, glow = false): void {
  g.save()
  g.translate(cx, cy)
  g.rotate(rot)
  g.fillStyle = 'rgba(0,0,0,0.35)'
  rrect(g, -size / 2 + 5, -size / 2 + 8, size, size, size * 0.18)
  g.fill()
  const faceMat = g.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2)
  faceMat.addColorStop(0, '#ffffff')
  faceMat.addColorStop(0.2, glow ? '#ffd35c' : '#fff7e8')
  faceMat.addColorStop(1, glow ? '#b86d3a' : '#aeb7c9')
  g.fillStyle = faceMat
  g.strokeStyle = '#1b1838'
  g.lineWidth = size * 0.06
  rrect(g, -size / 2, -size / 2, size, size, size * 0.18)
  g.fill()
  g.stroke()
  g.fillStyle = face === 6 && glow ? '#e0244e' : '#1b1838'
  for (const [px, py] of PIPS[face]) {
    g.beginPath()
    g.arc(px * size * 0.27, py * size * 0.27, size * 0.085, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

export const dados: Factory = env => {
  const results: number[] = []
  let face = 1
  let acc = 0
  let started = false
  let wobble = 0
  let doneT = -1
  let pop = 0

  return {
    bg: '#0f5132',
    update(dt) {
      pop = Math.max(0, pop - dt * 3)
      wobble += dt * 30
      if (doneT >= 0) {
        doneT += dt
        if (doneT > 1.2) env.end(results.reduce((a, b) => a + b, 0))
        return
      }
      if (!started) return
      acc += dt
      const step = SPEEDS[results.length]
      while (acc >= step) {
        acc -= step
        face = (face % 6) + 1
        env.sfx.tone(300 + face * 30, 15, 'square', 0.015)
      }
    },
    down() {
      if (doneT >= 0) return
      if (!started) {
        started = true
        env.fx.vibrate(8)
        return
      }
      results.push(face)
      pop = 1
      env.score(results.reduce((a, b) => a + b, 0))
      env.sfx.tone(face === 6 ? 880 : 440, face === 6 ? 220 : 90, 'triangle', 0.08)
      if (face === 6) {
        env.fx.burst(W / 2, 330, '#ffd35c', 30, 340)
        env.fx.shake(0.3)
      }
      env.fx.vibrate(face === 6 ? 50 : 15)
      env.sfx.noise(60, 0.05)
      face = 1 + Math.floor(env.rand() * 6)
      acc = 0
      if (results.length >= DICE) doneT = 0
    },
    draw(g) {
      const felt = g.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.45, H * 0.7)
      felt.addColorStop(0, '#1f8a55')
      felt.addColorStop(1, '#0b3d26')
      g.fillStyle = felt
      g.fillRect(0, 0, W, H)
      g.strokeStyle = 'rgba(255,211,92,0.4)'
      g.lineWidth = 4
      rrect(g, 20, 20, W - 40, H - 40, 30)
      g.stroke()
      const total = results.reduce((a, b) => a + b, 0)
      text(g, String(total), W / 2, 90, 60, '#ffd35c')
      text(g, 'Suma de los dados', W / 2, 136, 16, '#fff7e8', 'center', 700)
      if (results.length < DICE && doneT < 0) {
        const spin = started ? Math.sin(wobble) * 0.08 : 0
        die(g, W / 2, 330, 170, face, spin, face === 6)
        text(g, started ? `Dado ${results.length + 1} de ${DICE}` : 'Toca para empezar', W / 2, 470, 22)
        text(g, '¡Para en el 6!', W / 2, 505, 18, '#7ef9ff', 'center', 800)
      } else {
        text(g, total >= 25 ? '¡Tirada de campeón!' : total >= 18 ? '¡Bien jugado!' : 'Puedes mejorar', W / 2, 330, 30)
      }
      for (let i = 0; i < DICE; i += 1) {
        const x = W / 2 + (i - 2) * 70
        if (results[i]) die(g, x, 600, 56 * (i === results.length - 1 ? 1 + pop * 0.25 : 1), results[i], 0, results[i] === 6)
        else {
          g.strokeStyle = 'rgba(255,255,255,0.3)'
          g.setLineDash([6, 6])
          g.lineWidth = 3
          rrect(g, x - 28, 572, 56, 56, 10)
          g.stroke()
          g.setLineDash([])
        }
      }
    },
  }
}
