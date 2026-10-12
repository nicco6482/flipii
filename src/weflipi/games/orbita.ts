// Órbita: pilot a small ship through an incoming asteroid field. Tap either side of the screen,
// or use the arrow keys, to change lane. Distance travelled is the score.
import { H, W, rrect, text, type Factory } from '../engine'

type Rock = { lane: number; y: number; size: number; spin: number; rot: number; tint: string }

const LANES = [86, W / 2, W - 86]
const SHIP_Y = 555
const ROCKS = ['#ff865e', '#b77dff', '#6cd6d9', '#f0b05b']

export const orbita: Factory = env => {
  const stars = Array.from({ length: 46 }, () => ({ x: env.rand() * W, y: env.rand() * H, z: 0.25 + env.rand() * 0.9 }))
  const rocks: Rock[] = []
  let lane = 1
  let started = false
  let distance = 0
  let shownScore = -1
  let spawnIn = 0.75
  let lastLane = 1
  let thrust = 0
  let crashT = -1
  let lastMove = 0

  const steer = (delta: number) => {
    if (!started || crashT >= 0) return
    const next = Math.max(0, Math.min(LANES.length - 1, lane + delta))
    if (next === lane) return
    lastMove = delta
    lane = next
    thrust = 1
    env.sfx.tone(delta < 0 ? 410 : 510, 55, 'triangle', 0.045, delta < 0 ? -55 : 55)
    env.fx.vibrate(10)
  }

  const start = (x: number) => {
    if (started) return
    started = true
    thrust = 1
    env.sfx.tone(260, 150, 'triangle', 0.07, 300)
    env.fx.vibrate(18)
    if (x < W * 0.36) steer(-1)
    else if (x > W * 0.64) steer(1)
  }

  const addRock = () => {
    let next = Math.floor(env.rand() * LANES.length)
    // Avoid a flat wall of identical lanes; every obstacle still stays deterministic for the day.
    if (next === lastLane && env.rand() < 0.62) next = (next + 1 + Math.floor(env.rand() * 2)) % LANES.length
    lastLane = next
    rocks.push({ lane: next, y: -80, size: 30 + env.rand() * 19, spin: (env.rand() - 0.5) * 3.4, rot: env.rand() * Math.PI * 2, tint: ROCKS[Math.floor(env.rand() * ROCKS.length)] })
  }

  const crash = (rock: Rock) => {
    crashT = 0
    env.sfx.noise(260, 0.1)
    env.sfx.tone(110, 280, 'sawtooth', 0.08, -45)
    env.fx.burst(LANES[lane], SHIP_Y, '#ff5f7e', 42, 390)
    env.fx.shake(0.82)
    env.fx.vibrate(90)
    rock.y = H + 150
  }

  const asteroid = (g: CanvasRenderingContext2D, x: number, y: number, size: number, tint: string, rot: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    g.fillStyle = 'rgba(0,0,0,0.33)'
    g.beginPath()
    g.ellipse(size * 0.18, size * 0.45, size * 0.9, size * 0.26, 0, 0, Math.PI * 2)
    g.fill()
    const body = g.createRadialGradient(-size * 0.35, -size * 0.42, size * 0.08, 0, 0, size * 1.12)
    body.addColorStop(0, '#fff1d5')
    body.addColorStop(0.16, tint)
    body.addColorStop(0.72, tint)
    body.addColorStop(1, '#211938')
    g.fillStyle = body
    g.strokeStyle = '#17132d'
    g.lineWidth = Math.max(2, size * 0.1)
    g.beginPath()
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2
      const r = size * (0.83 + Math.sin(i * 7.2) * 0.12)
      const px = Math.cos(a) * r
      const py = Math.sin(a) * r
      if (!i) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.closePath()
    g.fill()
    g.stroke()
    g.globalAlpha = 0.23
    g.fillStyle = '#251d3c'
    for (const [px, py, r] of [[-0.18, 0.18, 0.18], [0.31, -0.15, 0.13], [0.12, 0.36, 0.1]] as [number, number, number][]) {
      g.beginPath()
      g.arc(px * size, py * size, r * size, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
  }

  return {
    bg: '#0d1230',
    update(dt) {
      thrust = Math.max(0, thrust - dt * 3.5)
      for (const star of stars) {
        star.y += (45 + distance * 0.5) * star.z * dt
        if (star.y > H + 8) {
          star.y = -8
          star.x = env.rand() * W
        }
      }
      if (!started) return
      if (crashT >= 0) {
        crashT += dt
        if (crashT > 0.62) env.end(Math.max(0, Math.floor(distance)))
        return
      }
      distance += dt * (15 + Math.min(24, distance * 0.055))
      const nextScore = Math.floor(distance)
      if (nextScore !== shownScore) {
        shownScore = nextScore
        env.score(nextScore)
      }
      spawnIn -= dt
      if (spawnIn <= 0) {
        addRock()
        spawnIn += Math.max(0.42, 1.1 - distance * 0.011)
      }
      const speed = 244 + Math.min(230, distance * 2.1)
      for (const rock of rocks) {
        rock.y += speed * dt
        rock.rot += rock.spin * dt
        const scale = 0.56 + Math.max(0, rock.y) / H * 0.74
        if (rock.lane === lane && Math.abs(rock.y - SHIP_Y) < rock.size * scale + 30) {
          crash(rock)
          break
        }
      }
      while (rocks.length && rocks[0].y > H + 120) rocks.shift()
    },
    down(x) {
      if (!started) start(x)
      else steer(x < W / 2 ? -1 : 1)
    },
    key(key, pressed) {
      if (!pressed) return
      if (!started) {
        start(W / 2)
        return
      }
      if (key === 'left') steer(-1)
      if (key === 'right') steer(1)
    },
    draw(g) {
      const space = g.createLinearGradient(0, 0, 0, H)
      space.addColorStop(0, '#101a4a')
      space.addColorStop(0.55, '#15144a')
      space.addColorStop(1, '#090d25')
      g.fillStyle = space
      g.fillRect(0, 0, W, H)
      const haze = g.createRadialGradient(W / 2, 250, 20, W / 2, 250, 350)
      haze.addColorStop(0, 'rgba(126,249,255,0.18)')
      haze.addColorStop(1, 'rgba(126,249,255,0)')
      g.fillStyle = haze
      g.fillRect(0, 0, W, H)
      for (const star of stars) {
        g.globalAlpha = 0.32 + star.z * 0.6
        g.fillStyle = star.z > 0.75 ? '#dffeff' : '#9da9ff'
        g.fillRect(star.x, star.y, star.z * 2.4, star.z * 2.4)
      }
      g.globalAlpha = 1
      // Receding lane markers create a small sense of cockpit depth.
      g.strokeStyle = 'rgba(126,249,255,0.13)'
      g.lineWidth = 2
      for (const x of [W * 0.26, W * 0.5, W * 0.74]) {
        g.beginPath()
        g.moveTo(W / 2 + (x - W / 2) * 0.16, 190)
        g.lineTo(x, H)
        g.stroke()
      }
      for (const rock of rocks) {
        const scale = 0.56 + Math.max(0, rock.y) / H * 0.74
        asteroid(g, LANES[rock.lane], rock.y, rock.size * scale, rock.tint, rock.rot)
      }
      const sx = LANES[lane] + (lastMove * thrust * -8)
      g.save()
      g.translate(sx, SHIP_Y)
      const glow = g.createRadialGradient(0, 15, 4, 0, 15, 64 + thrust * 18)
      glow.addColorStop(0, `rgba(126,249,255,${0.68 + thrust * 0.2})`)
      glow.addColorStop(1, 'rgba(126,249,255,0)')
      g.fillStyle = glow
      g.beginPath()
      g.arc(0, 16, 64 + thrust * 18, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#080c23'
      g.beginPath()
      g.moveTo(0, -46)
      g.lineTo(35, 36)
      g.lineTo(0, 25)
      g.lineTo(-35, 36)
      g.closePath()
      g.fill()
      const hull = g.createLinearGradient(-26, -30, 26, 40)
      hull.addColorStop(0, '#e9ffff')
      hull.addColorStop(0.27, '#62dce7')
      hull.addColorStop(1, '#3474c5')
      g.fillStyle = hull
      g.strokeStyle = '#17132d'
      g.lineWidth = 5
      g.beginPath()
      g.moveTo(0, -46)
      g.lineTo(28, 29)
      g.lineTo(0, 18)
      g.lineTo(-28, 29)
      g.closePath()
      g.fill()
      g.stroke()
      g.fillStyle = '#182b5d'
      g.beginPath()
      g.ellipse(0, -5, 11, 18, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
      text(g, `${Math.floor(distance)} m`, W / 2, 72, 42, '#ffd35c')
      text(g, 'ÓRBITA', W / 2, 112, 15, '#b9eaff', 'center', 800)
      if (!started) {
        g.fillStyle = 'rgba(8,12,35,0.72)'
        rrect(g, 36, 192, W - 72, 112, 24)
        g.fill()
        text(g, 'ESQUIVA LAS ROCAS', W / 2, 226, 27, '#fff7e8')
        text(g, 'Toca izquierda o derecha para mover la nave', W / 2, 266, 16, '#7ef9ff', 'center', 700)
      } else if (crashT < 0) {
        for (const [x, label] of [[72, '‹'], [W - 72, '›']] as [number, string][]) {
          g.fillStyle = 'rgba(255,255,255,0.1)'
          rrect(g, x - 38, H - 94, 76, 56, 18)
          g.fill()
          text(g, label, x, H - 66, 38, '#dffeff')
        }
      }
    },
  }
}
