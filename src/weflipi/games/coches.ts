// Coches: dodge traffic on a three-lane road that keeps getting faster. Tap the left or right half
// of the screen (or use the arrows) to change lane. Score = metres driven.
import { H, W, rrect, text, type Factory } from '../engine'

const ROAD_X = 50
const LANE = 100
const CAR_W = 54
const CAR_H = 92
const PLAYER_Y = H - 150
const COLORS = ['#ff5f7e', '#7ef9ff', '#a77bff', '#ff9f43', '#2bd47d', '#f5f5f5']

type Car = { lane: number; y: number; color: string; speed: number }

const laneX = (lane: number) => ROAD_X + LANE * lane + LANE / 2

export const coches: Factory = env => {
  let lane = 1
  let x = laneX(1)
  let speed = 360
  let dist = 0
  let started = false
  let crashed = false
  let crashT = 0
  let nextRow = 420
  let dash = 0
  const cars: Car[] = []

  const metres = () => Math.floor(dist / 12)

  const spawnRow = () => {
    const free = Math.floor(env.rand() * 3)
    const blocked = [0, 1, 2].filter(l => l !== free && env.rand() < (metres() > 300 ? 0.75 : 0.55))
    if (!blocked.length) blocked.push((free + 1 + Math.floor(env.rand() * 2)) % 3)
    for (const l of blocked) cars.push({ lane: l, y: -CAR_H - env.rand() * 30, color: COLORS[Math.floor(env.rand() * COLORS.length)], speed: 60 + env.rand() * 90 })
  }

  const shift = (d: number) => {
    if (crashed) return
    started = true
    const next = Math.max(0, Math.min(2, lane + d))
    if (next !== lane) {
      env.sfx.tone(420, 50, 'triangle', 0.04, 120)
      env.fx.vibrate(8)
    }
    lane = next
  }

  const drawCar = (g: CanvasRenderingContext2D, cx: number, y: number, color: string, player = false) => {
    g.fillStyle = 'rgba(0,0,0,0.25)'
    rrect(g, cx - CAR_W / 2 + 5, y + 6, CAR_W, CAR_H, 12)
    g.fill()
    const body = g.createLinearGradient(cx - CAR_W / 2, y, cx + CAR_W / 2, y + CAR_H)
    body.addColorStop(0, '#ffffff')
    body.addColorStop(0.12, color)
    body.addColorStop(0.7, color)
    body.addColorStop(1, '#1b1838')
    g.fillStyle = body
    g.strokeStyle = '#1b1838'
    g.lineWidth = 3
    rrect(g, cx - CAR_W / 2, y, CAR_W, CAR_H, 12)
    g.fill()
    g.stroke()
    const glass = g.createLinearGradient(0, y + 10, 0, y + 80)
    glass.addColorStop(0, '#92e8ff')
    glass.addColorStop(0.35, '#35517d')
    glass.addColorStop(1, '#10152d')
    g.fillStyle = glass
    rrect(g, cx - CAR_W / 2 + 8, y + (player ? 22 : 14), CAR_W - 16, 18, 5)
    g.fill()
    rrect(g, cx - CAR_W / 2 + 8, y + (player ? 62 : 56), CAR_W - 16, 14, 5)
    g.fill()
    g.fillStyle = player ? '#fff7e8' : '#ff2d55'
    g.fillRect(cx - CAR_W / 2 + 6, y + (player ? 2 : CAR_H - 7), 10, 5)
    g.fillRect(cx + CAR_W / 2 - 16, y + (player ? 2 : CAR_H - 7), 10, 5)
    g.fillStyle = '#101329'
    for (const wheelY of [y + 18, y + CAR_H - 18]) {
      g.beginPath()
      g.ellipse(cx - CAR_W / 2 - 2, wheelY, 6, 12, 0, 0, Math.PI * 2)
      g.ellipse(cx + CAR_W / 2 + 2, wheelY, 6, 12, 0, 0, Math.PI * 2)
      g.fill()
    }
  }

  return {
    bg: '#2e7d32',
    update(dt) {
      x += (laneX(lane) - x) * Math.min(1, dt * 16)
      if (crashed) {
        crashT += dt
        if (crashT > 1) env.end(metres())
        return
      }
      if (!started) return
      // Keeps accelerating: ~+18 km/h every 4 s, up to 1300 px/s.
      speed = Math.min(1300, speed + dt * 18)
      const dy = speed * dt
      dist += dy
      dash = (dash + dy) % 80
      nextRow -= dy
      if (nextRow <= 0) {
        spawnRow()
        nextRow = Math.max(220, speed * 0.5) + env.rand() * 100
      }
      for (const c of cars) c.y += dy - c.speed * dt
      while (cars.length && cars[0].y > H + 20) cars.shift()
      env.score(metres())
      for (const c of cars) {
        if (Math.abs(laneX(c.lane) - x) < CAR_W - 10 && Math.abs(c.y - PLAYER_Y) < CAR_H - 14) {
          crashed = true
          env.sfx.noise(400, 0.12)
          env.sfx.tone(140, 400, 'sawtooth', 0.06, -80)
          env.fx.shake(0.9)
          env.fx.burst(x, PLAYER_Y + 40, '#ff9f43', 30, 380)
          env.fx.vibrate(150)
          break
        }
      }
    },
    down(px) {
      shift(px < W / 2 ? -1 : 1)
    },
    key(k, pressed) {
      if (!pressed) return
      if (k === 'left') shift(-1)
      if (k === 'right') shift(1)
    },
    draw(g) {
      g.fillStyle = '#3a9a3e'
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#4caf50'
      for (let y = -80 + (dist % 80); y < H; y += 80) g.fillRect(0, y, ROAD_X - 6, 40)
      for (let y = -80 + (dist % 80); y < H; y += 80) g.fillRect(W - ROAD_X + 6, y + 40, ROAD_X - 6, 40)
      g.fillStyle = '#3b3b4f'
      g.fillRect(ROAD_X, 0, LANE * 3, H)
      g.fillStyle = '#f5f5f5'
      g.fillRect(ROAD_X, 0, 5, H)
      g.fillRect(ROAD_X + LANE * 3 - 5, 0, 5, H)
      g.fillStyle = 'rgba(255,255,255,0.7)'
      for (let l = 1; l < 3; l += 1) for (let y = -80 + dash; y < H; y += 80) g.fillRect(ROAD_X + LANE * l - 3, y, 6, 42)
      for (const c of cars) drawCar(g, laneX(c.lane), c.y, c.color)
      drawCar(g, x, PLAYER_Y, '#ffd35c', true)
      if (crashed) {
        g.fillStyle = `rgba(255,120,60,${Math.max(0, 0.6 - crashT * 0.6)})`
        g.beginPath()
        g.arc(x, PLAYER_Y + 10, 60 + crashT * 80, 0, Math.PI * 2)
        g.fill()
        text(g, '¡CRASH!', W / 2, H / 2 - 60, 54, '#ff7a45')
      }
      text(g, `${metres()} m`, W / 2, 70, 44)
      text(g, `${Math.round(speed / 4)} km/h`, W / 2, 112, 18, '#7ef9ff', 'center', 700)
      if (!started) {
        text(g, 'Toca izquierda o derecha', W / 2, H / 2 - 40, 22)
        text(g, 'para cambiar de carril', W / 2, H / 2 - 10, 22)
      }
    },
  }
}
