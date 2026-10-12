// Dardos: nine darts on a real dartboard. Hold to aim (the sight floats above your finger and
// wobbles like a shaky hand), release to throw. Score = total points (max 540).
import { H, W, text, type Factory } from '../engine'

const DARTS = 9
const CX = W / 2
const CY = 285
const K = 160 / 170 // board drawn 160 px for a real 170 mm radius
const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
const RING = { bull: 6.35 * K, outerBull: 15.9 * K, tripleIn: 99 * K, tripleOut: 107 * K, doubleIn: 162 * K, doubleOut: 170 * K }
const FINGER_OFFSET = 90

/** Points and label for a hit at world (x, y). Exported for tests. */
export function dartScore(x: number, y: number): { points: number; label: string } {
  const dx = x - CX
  const dy = y - CY
  const r = Math.hypot(dx, dy)
  if (r <= RING.bull) return { points: 50, label: 'DIANA' }
  if (r <= RING.outerBull) return { points: 25, label: '25' }
  if (r > RING.doubleOut) return { points: 0, label: 'FUERA' }
  // Angle clockwise from straight up; segment 20 is centred on the top.
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
  const n = ORDER[Math.floor((((angle + 9) % 360) + 360) % 360 / 18)]
  if (r >= RING.tripleIn && r <= RING.tripleOut) return { points: n * 3, label: `T${n}` }
  if (r >= RING.doubleIn) return { points: n * 2, label: `D${n}` }
  return { points: n, label: String(n) }
}

export const dardos: Factory = env => {
  let thrown = 0
  let total = 0
  let aiming = false
  let fx = CX
  let fy = CY + FINGER_OFFSET
  let t = 0
  let hold = 0
  let flight: { x: number; y: number; t: number } | null = null
  const hits: { x: number; y: number }[] = []
  let label = ''
  let labelT = 0
  let doneT = -1

  const aim = () => {
    // Wobble grows the longer you hold: aim fast but not too fast.
    // Shakier with every dart and the longer you hold.
    const amp = 12 + thrown * 2.5 + Math.min(30, hold * 11)
    return { x: fx + Math.sin(t * 2.9) * amp + Math.sin(t * 5.3) * amp * 0.35, y: fy - FINGER_OFFSET + Math.cos(t * 2.3) * amp + Math.sin(t * 4.1) * amp * 0.3 }
  }

  return {
    bg: '#14231a',
    update(dt) {
      t += dt
      labelT = Math.max(0, labelT - dt)
      if (aiming) hold += dt
      if (flight) {
        flight.t += dt / 0.22
        if (flight.t >= 1) {
          const { x, y } = flight
          hits.push({ x, y })
          const s = dartScore(x, y)
          total += s.points
          thrown += 1
          label = s.points ? `${s.label} · ${s.points}` : s.label
          labelT = 1.2
          env.score(total)
          env.sfx.tone(s.points >= 50 ? 990 : s.points >= 40 ? 784 : s.points ? 523 : 196, 110, 'triangle', 0.08)
          env.sfx.noise(40, 0.06)
          flight = null
          if (thrown >= DARTS) doneT = 0
        }
      }
      if (doneT >= 0) {
        doneT += dt
        if (doneT > 1.2) env.end(total)
      }
    },
    down(x, y) {
      if (flight || thrown >= DARTS) return
      aiming = true
      hold = 0
      fx = x
      fy = Math.max(y, 120)
    },
    move(x, y) {
      if (!aiming) return
      fx = x
      fy = Math.max(y, 120)
    },
    up() {
      if (!aiming) return
      aiming = false
      const a = aim()
      flight = { x: a.x, y: a.y, t: 0 }
      env.sfx.tone(700, 80, 'sine', 0.04, -300)
    },
    draw(g) {
      g.fillStyle = '#14231a'
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#1d3326'
      for (let i = 0; i < 12; i += 1) g.fillRect(0, i * 60, W, 30)
      // Board.
      g.fillStyle = '#1b1838'
      g.beginPath()
      g.arc(CX, CY, RING.doubleOut + 26, 0, Math.PI * 2)
      g.fill()
      for (let i = 0; i < 20; i += 1) {
        const a0 = ((i * 18 - 9 - 90) * Math.PI) / 180
        const a1 = a0 + (18 * Math.PI) / 180
        const dark = i % 2 === 0
        const ring = (r0: number, r1: number, color: string) => {
          g.fillStyle = color
          g.beginPath()
          g.arc(CX, CY, r1, a0, a1)
          g.arc(CX, CY, r0, a1, a0, true)
          g.closePath()
          g.fill()
        }
        ring(RING.outerBull, RING.doubleOut, dark ? '#222' : '#f3e6c4')
        ring(RING.tripleIn, RING.tripleOut, dark ? '#e0244e' : '#2bb35a')
        ring(RING.doubleIn, RING.doubleOut, dark ? '#e0244e' : '#2bb35a')
        const mid = a0 + (9 * Math.PI) / 180
        text(g, String(ORDER[i]), CX + Math.cos(mid) * (RING.doubleOut + 14), CY + Math.sin(mid) * (RING.doubleOut + 14), 15, '#fff7e8', 'center', 800)
      }
      g.fillStyle = '#2bb35a'
      g.beginPath()
      g.arc(CX, CY, RING.outerBull, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#e0244e'
      g.beginPath()
      g.arc(CX, CY, RING.bull, 0, Math.PI * 2)
      g.fill()
      // Darts on the board (current round of three stays visible).
      const round = hits.slice(Math.floor(Math.max(0, thrown - 1) / 3) * 3)
      for (const h of round) {
        g.fillStyle = '#ffd35c'
        g.strokeStyle = '#1b1838'
        g.lineWidth = 2
        g.beginPath()
        g.arc(h.x, h.y, 5, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.strokeStyle = '#7ef9ff'
        g.lineWidth = 3
        g.beginPath()
        g.moveTo(h.x, h.y)
        g.lineTo(h.x + 10, h.y + 22)
        g.stroke()
      }
      if (flight) {
        const s = 1 + (1 - flight.t) * 1.5
        g.fillStyle = '#ffd35c'
        g.beginPath()
        g.arc(flight.x, flight.y + (1 - flight.t) * 120, 5 * s, 0, Math.PI * 2)
        g.fill()
      }
      if (aiming) {
        const a = aim()
        g.strokeStyle = '#7ef9ff'
        g.lineWidth = 2.5
        g.beginPath()
        g.arc(a.x, a.y, 12, 0, Math.PI * 2)
        g.moveTo(a.x - 20, a.y)
        g.lineTo(a.x + 20, a.y)
        g.moveTo(a.x, a.y - 20)
        g.lineTo(a.x, a.y + 20)
        g.stroke()
        g.fillStyle = 'rgba(126,249,255,0.25)'
        g.beginPath()
        g.arc(fx, fy, 22, 0, Math.PI * 2)
        g.fill()
      }
      text(g, `${total}`, W / 2, 545, 52, '#ffd35c')
      for (let i = 0; i < DARTS; i += 1) {
        g.fillStyle = i < thrown ? 'rgba(255,255,255,0.2)' : '#7ef9ff'
        g.fillRect(W / 2 - DARTS * 13 + i * 26 + 4, 590, 18, 6)
      }
      if (labelT > 0) text(g, label, W / 2, 60, 34, label.startsWith('T') || label === 'DIANA' ? '#7ef9ff' : '#fff7e8')
      else if (!thrown && !aiming) text(g, 'Mantén para apuntar, suelta para lanzar', W / 2, 640, 17, '#fff7e8', 'center', 700)
    },
  }
}
