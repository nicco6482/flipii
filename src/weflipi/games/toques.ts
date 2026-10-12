// Toques (like Playus' Keep Up): keep the ball in the air. Tap it to kick it up; where you hit it
// sends it left or right. Gravity slowly grows. Score = kicks before it touches the grass.
import { H, W, sphere, text, type Factory } from '../engine'

const R = 36
const GROUND = H - 70

export const toques: Factory = env => {
  let x = W / 2
  let y = 330
  let vx = 0
  let vy = 0
  let spin = 0
  let started = false
  let kicks = 0
  let dead = false
  let deadT = 0
  let pop = 0
  const gravity = () => 1240 + Math.min(980, kicks * 22)

  return {
    bg: '#3a9a3e',
    update(dt) {
      pop = Math.max(0, pop - dt * 4)
      if (dead) {
        deadT += dt
        if (deadT > 0.9) env.end(kicks)
        return
      }
      if (!started) {
        y = 330 + Math.sin(performance.now() / 300) * 6
        return
      }
      vy += gravity() * dt
      x += vx * dt
      y += vy * dt
      spin += (vx / R) * dt
      if (x < R) {
        x = R
        vx = Math.abs(vx) * 0.8
      }
      if (x > W - R) {
        x = W - R
        vx = -Math.abs(vx) * 0.8
      }
      if (y < R) {
        y = R
        vy = Math.abs(vy) * 0.5
      }
      if (y + R >= GROUND) {
        y = GROUND - R
        dead = true
        env.sfx.noise(200, 0.08)
        env.sfx.tone(200, 300, 'sawtooth', 0.05, -100)
        env.fx.shake(0.6)
        env.fx.vibrate(120)
      }
    },
    down(px, py) {
      if (dead) return
      const dx = px - x
      const dy = py - y
      // Generous hit area: the ball plus a finger's width.
      if (Math.hypot(dx, dy) > R + 34) return
      started = true
      kicks += 1
      env.score(kicks)
      vy = -820 - Math.min(200, kicks * 4)
      vx = -dx * 9 + (Math.random() - 0.5) * 60
      pop = 1
      env.sfx.tone(380 + Math.min(kicks, 30) * 12, 60, 'square', 0.06)
      env.fx.burst(x, y + R * 0.6, '#ffffff', 8, 200)
      env.fx.vibrate(10)
    },
    draw(g) {
      const sky = g.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#6fd0ff')
      sky.addColorStop(1, '#c9f1ff')
      g.fillStyle = sky
      g.fillRect(0, 0, W, GROUND)
      g.fillStyle = '#3a9a3e'
      g.fillRect(0, GROUND, W, H - GROUND)
      g.fillStyle = '#4caf50'
      for (let i = 0; i < W; i += 40) g.fillRect(i, GROUND, 20, H - GROUND)
      g.fillStyle = '#fff'
      g.fillRect(0, GROUND, W, 4)
      // Shadow.
      const h = Math.max(0, GROUND - y - R)
      g.fillStyle = `rgba(0,0,0,${0.3 - Math.min(0.2, h / 2000)})`
      g.beginPath()
      g.ellipse(x, GROUND + 6, R * (1 - Math.min(0.5, h / 1200)), 8, 0, 0, Math.PI * 2)
      g.fill()
      // Ball.
      g.save()
      g.translate(x, y)
      g.scale(1 + pop * 0.12, 1 - pop * 0.12)
      g.rotate(spin)
      sphere(g, 0, 0, R, '#f3f7ff')
      g.fillStyle = '#1b1838'
      const patch = (a: number, d: number, s: number) => {
        g.beginPath()
        for (let k = 0; k < 5; k += 1) {
          const ang = a + (k / 5) * Math.PI * 2
          const px = Math.cos(a) * d + Math.cos(ang) * s
          const py = Math.sin(a) * d + Math.sin(ang) * s
          if (k === 0) g.moveTo(px, py)
          else g.lineTo(px, py)
        }
        g.closePath()
        g.fill()
      }
      patch(0, 0, 11)
      for (let k = 0; k < 5; k += 1) patch((k / 5) * Math.PI * 2 - Math.PI / 2, 28, 8)
      g.restore()
      if (!dead && started && vy > 80) {
        g.save()
        g.globalAlpha = 0.55
        g.strokeStyle = '#7ef9ff'
        g.lineWidth = 3
        g.setLineDash([7, 7])
        g.beginPath()
        g.arc(x, y, R + 12, Math.PI * 0.15, Math.PI * 0.85)
        g.stroke()
        g.restore()
      }
      text(g, String(kicks), W / 2, 90, 64, '#ffd35c')
      if (!started) text(g, 'Toca el balón para darle', W / 2, 470, 22)
      if (dead) text(g, '¡Al suelo!', W / 2, 220, 40, '#ff5f7e')
    },
  }
}
