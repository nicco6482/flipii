// Reflejos: five rounds, tap the moment the screen turns green. Score = average reaction in ms
// (lower is better). Tapping early costs a 300 ms penalty and repeats the round. From round 2
// a blue decoy flash may appear first: tapping it counts as early.
import { H, W, text, type Factory } from '../engine'

const ROUNDS = 5
const PENALTY = 300

export const reflejos: Factory = env => {
  type Phase = 'intro' | 'wait' | 'decoy' | 'go' | 'early' | 'shown'
  let phase: Phase = 'intro'
  let timer = 0
  let goAt = 0
  let last = 0
  const times: number[] = []
  let penalty = 0
  let pulse = 0
  let decoyAt = -1
  let decoyT = 0

  const arm = () => {
    phase = 'wait'
    // Real randomness: a daily seed would let players learn the delays.
    timer = 0.9 + Math.random() * 2.2
    // Decoys get likelier each round (none in the first).
    const n = times.length
    decoyAt = n >= 1 && Math.random() < 0.35 + n * 0.15 ? timer * (0.3 + Math.random() * 0.4) : -1
  }

  return {
    bg: '#1b1838',
    update(dt) {
      pulse += dt
      if (phase === 'decoy') {
        decoyT -= dt
        if (decoyT <= 0) phase = 'wait'
      } else if (phase === 'wait') {
        timer -= dt
        if (decoyAt >= 0 && timer <= decoyAt) {
          decoyAt = -1
          phase = 'decoy'
          decoyT = 0.45
          env.sfx.tone(440, 90, 'square', 0.05)
        } else if (timer <= 0) {
          phase = 'go'
          goAt = performance.now()
          env.sfx.tone(880, 120, 'square', 0.07)
        }
      } else if (phase === 'early' || phase === 'shown') {
        timer -= dt
        if (timer <= 0) {
          if (times.length >= ROUNDS) {
            const avg = Math.round((times.reduce((a, b) => a + b, 0) + penalty) / ROUNDS)
            env.end(Math.max(80, Math.min(5000, avg)))
            phase = 'intro'
            return
          }
          arm()
        }
      }
    },
    down() {
      if (phase === 'intro') {
        if (times.length < ROUNDS) arm()
      } else if (phase === 'wait' || phase === 'decoy') {
        phase = 'early'
        penalty += PENALTY
        timer = 1.1
        env.sfx.tone(160, 260, 'sawtooth', 0.06, -60)
      } else if (phase === 'go') {
        last = Math.round(performance.now() - goAt)
        times.push(last)
        env.score(Math.round((times.reduce((a, b) => a + b, 0) + penalty) / times.length))
        phase = 'shown'
        timer = 1.0
        env.sfx.tone(660 + Math.max(0, 400 - last), 90, 'triangle', 0.08)
      }
    },
    draw(g) {
      const colors: Record<Phase, string> = { intro: '#2a2552', wait: '#e0244e', decoy: '#3d7bff', go: '#2bd47d', early: '#ff7a45', shown: '#3d3673' }
      g.fillStyle = colors[phase]
      g.fillRect(0, 0, W, H)
      const r = 120 + Math.sin(pulse * 4) * 6
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.beginPath()
      g.arc(W / 2, H / 2 - 40, r, 0, Math.PI * 2)
      g.fill()
      if (phase === 'intro') {
        text(g, '⚡', W / 2, H / 2 - 40, 90)
        text(g, 'Toca cuando', W / 2, H / 2 + 110, 30)
        text(g, 'se ponga VERDE', W / 2, H / 2 + 148, 30, '#7ef9ff')
        text(g, 'Toca para empezar', W / 2, H - 90, 20, '#ffd35c')
      } else if (phase === 'wait') {
        text(g, 'Espera…', W / 2, H / 2 - 40, 48)
      } else if (phase === 'decoy') {
        text(g, '¡NO!', W / 2, H / 2 - 40, 84, '#fff7e8')
        text(g, 'Solo el VERDE', W / 2, H / 2 + 40, 24)
      } else if (phase === 'go') {
        text(g, '¡YA!', W / 2, H / 2 - 40, 84)
      } else if (phase === 'early') {
        text(g, '¡Muy pronto!', W / 2, H / 2 - 40, 40)
        text(g, `+${PENALTY} ms`, W / 2, H / 2 + 20, 28, '#ffd35c')
      } else {
        text(g, `${last} ms`, W / 2, H / 2 - 40, 64, '#ffd35c')
        text(g, last < 220 ? '¡Rapidísimo!' : last < 300 ? '¡Bien!' : 'Puedes mejorar', W / 2, H / 2 + 30, 24)
      }
      for (let i = 0; i < ROUNDS; i += 1) {
        g.fillStyle = i < times.length ? '#ffd35c' : 'rgba(255,255,255,0.25)'
        g.beginPath()
        g.arc(W / 2 + (i - 2) * 34, 70, 11, 0, Math.PI * 2)
        g.fill()
      }
    },
  }
}
