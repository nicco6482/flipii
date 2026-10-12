// Hockey (air hockey) against the machine: drag your mallet in the bottom half and smash the puck
// into the top goal. The puck carries your mallet's speed, bounces off the boards and barely slows
// down. The machine gets faster every second. 60 seconds; score = your goals.
import { H, W, rrect, text, type Factory } from '../engine'

const TIME = 60
const RINK = { x: 18, y: 60, w: W - 36, h: H - 100 }
const GOAL_W = 150
const PUCK_R = 18
const MALLET_R = 32
const MAX_PUCK = 1500
const MID = RINK.y + RINK.h / 2

type Body = { x: number; y: number; vx: number; vy: number }

export const hockey: Factory = env => {
  let t = TIME
  let started = false
  let mine = 0
  let theirs = 0
  let pause = 0
  let flash = ''
  let flashT = 0
  let shake = 0
  const puck: Body = { x: W / 2, y: MID + 90, vx: 0, vy: 0 }
  const me: Body = { x: W / 2, y: RINK.y + RINK.h - 90, vx: 0, vy: 0 }
  const cpu: Body = { x: W / 2, y: RINK.y + 90, vx: 0, vy: 0 }
  let target = { x: me.x, y: me.y }
  const trail: { x: number; y: number }[] = []

  const cpuSpeed = () => 260 + (TIME - t) * 7 // ~680 px/s by the end

  const resetPuck = (towardsMe: boolean) => {
    puck.x = W / 2
    puck.y = towardsMe ? MID + 90 : MID - 90
    puck.vx = 0
    puck.vy = 0
    pause = 0.8
  }

  /** Mallets are immovable for the puck: it bounces off them with their velocity added. */
  const hit = (m: Body) => {
    const dx = puck.x - m.x
    const dy = puck.y - m.y
    const d = Math.hypot(dx, dy)
    const min = PUCK_R + MALLET_R
    if (d >= min || d === 0) return
    const nx = dx / d
    const ny = dy / d
    puck.x = m.x + nx * min
    puck.y = m.y + ny * min
    const rvx = puck.vx - m.vx
    const rvy = puck.vy - m.vy
    const dot = rvx * nx + rvy * ny
    if (dot < 0) {
      puck.vx = rvx - 1.9 * dot * nx + m.vx
      puck.vy = rvy - 1.9 * dot * ny + m.vy
      const sp = Math.hypot(puck.vx, puck.vy)
      if (sp > MAX_PUCK) {
        puck.vx *= MAX_PUCK / sp
        puck.vy *= MAX_PUCK / sp
      }
      env.sfx.tone(300 + Math.min(600, sp / 3), 35, 'square', 0.05)
      env.fx.vibrate(sp > 900 ? 24 : 8)
      if (sp > 900) shake = 0.4
    }
  }

  const moveMallet = (m: Body, tx: number, ty: number, maxSpeed: number, top: boolean, dt: number) => {
    const minY = top ? RINK.y + MALLET_R : MID + MALLET_R
    const maxY = top ? MID - MALLET_R : RINK.y + RINK.h - MALLET_R
    tx = Math.max(RINK.x + MALLET_R, Math.min(RINK.x + RINK.w - MALLET_R, tx))
    ty = Math.max(minY, Math.min(maxY, ty))
    let dx = tx - m.x
    let dy = ty - m.y
    const d = Math.hypot(dx, dy)
    const stepMax = maxSpeed * dt
    if (d > stepMax) {
      dx *= stepMax / d
      dy *= stepMax / d
    }
    m.vx = dt > 0 ? dx / dt : 0
    m.vy = dt > 0 ? dy / dt : 0
    m.x += dx
    m.y += dy
  }

  const goalLeft = W / 2 - GOAL_W / 2
  const goalRight = W / 2 + GOAL_W / 2

  return {
    bg: '#0b1f3a',
    update(dt) {
      flashT = Math.max(0, flashT - dt)
      shake = Math.max(0, shake - dt * 2)
      if (!started) return
      t -= dt
      if (t <= 0) {
        env.end(mine)
        return
      }
      const steps = 6
      for (let s = 0; s < steps; s += 1) {
        const h = dt / steps
        moveMallet(me, target.x, target.y, 2600, false, h)
        // The machine: defends its goal, attacks when the puck is on its side.
        const attacking = puck.y < MID && puck.vy < 200
        const cx = attacking ? puck.x : W / 2 + (puck.x - W / 2) * 0.6
        const cy = attacking ? puck.y - 10 : RINK.y + 70
        moveMallet(cpu, cx, cy, cpuSpeed(), true, h)
        if (pause > 0) continue
        puck.x += puck.vx * h
        puck.y += puck.vy * h
        const drag = Math.exp(-0.25 * h)
        puck.vx *= drag
        puck.vy *= drag
        if (puck.x < RINK.x + PUCK_R) {
          puck.x = RINK.x + PUCK_R
          puck.vx = Math.abs(puck.vx) * 0.9
          env.sfx.tone(180, 25, 'square', 0.03)
          if (Math.abs(puck.vx) > 500) env.fx.vibrate(6)
        }
        if (puck.x > RINK.x + RINK.w - PUCK_R) {
          puck.x = RINK.x + RINK.w - PUCK_R
          puck.vx = -Math.abs(puck.vx) * 0.9
          env.sfx.tone(180, 25, 'square', 0.03)
          if (Math.abs(puck.vx) > 500) env.fx.vibrate(6)
        }
        const inMouth = puck.x > goalLeft + 4 && puck.x < goalRight - 4
        if (puck.y < RINK.y + PUCK_R) {
          if (inMouth) {
            mine += 1
            env.score(mine)
            flash = '¡GOL!'
            flashT = 1
            env.sfx.tone(880, 200, 'triangle', 0.09)
            env.fx.burst(W / 2, RINK.y + 10, undefined, 45, 420)
            env.fx.vibrate(80)
            resetPuck(false)
            break
          }
          puck.y = RINK.y + PUCK_R
          puck.vy = Math.abs(puck.vy) * 0.9
        }
        if (puck.y > RINK.y + RINK.h - PUCK_R) {
          if (inMouth) {
            theirs += 1
            flash = 'Gol de la máquina'
            flashT = 1
            env.sfx.tone(160, 300, 'sawtooth', 0.06)
            env.fx.vibrate(120)
            resetPuck(true)
            break
          }
          puck.y = RINK.y + RINK.h - PUCK_R
          puck.vy = -Math.abs(puck.vy) * 0.9
        }
        hit(me)
        hit(cpu)
      }
      if (pause > 0) pause -= dt
      trail.push({ x: puck.x, y: puck.y })
      if (trail.length > 10) trail.shift()
    },
    down(x, y) {
      started = true
      target = { x, y }
    },
    move(x, y) {
      target = { x, y }
    },
    key(k, pressed) {
      if (!pressed) return
      started = true
      const d = 60
      if (k === 'left') target.x -= d
      if (k === 'right') target.x += d
      if (k === 'up') target.y -= d
      if (k === 'down') target.y += d
    },
    draw(g) {
      g.save()
      if (shake > 0) g.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10)
      g.fillStyle = '#0b1f3a'
      g.fillRect(-10, -10, W + 20, H + 20)
      // Rink.
      g.fillStyle = '#e9f4ff'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 6
      rrect(g, RINK.x, RINK.y, RINK.w, RINK.h, 30)
      g.fill()
      g.stroke()
      g.fillStyle = 'rgba(61,123,255,0.08)'
      for (let i = 0; i < 40; i += 1) for (let j = 0; j < 14; j += 1) g.fillRect(RINK.x + 14 + j * 26, RINK.y + 12 + i * 16, 2, 2)
      g.strokeStyle = '#ff5f7e'
      g.lineWidth = 4
      g.beginPath()
      g.moveTo(RINK.x, MID)
      g.lineTo(RINK.x + RINK.w, MID)
      g.stroke()
      g.strokeStyle = '#5b8cff'
      g.lineWidth = 3
      g.beginPath()
      g.arc(W / 2, MID, 60, 0, Math.PI * 2)
      g.stroke()
      g.beginPath()
      g.arc(W / 2, RINK.y, 80, 0, Math.PI)
      g.stroke()
      g.beginPath()
      g.arc(W / 2, RINK.y + RINK.h, 80, Math.PI, 0)
      g.stroke()
      // Goals.
      g.fillStyle = '#1b1838'
      g.fillRect(goalLeft, RINK.y - 8, GOAL_W, 12)
      g.fillRect(goalLeft, RINK.y + RINK.h - 4, GOAL_W, 12)
      if (started && pause <= 0) {
        g.save()
        g.globalAlpha = 0.3
        g.strokeStyle = '#2bd47d'
        g.lineWidth = 2
        g.setLineDash([6, 8])
        g.beginPath()
        g.moveTo(me.x, me.y)
        g.lineTo(target.x, target.y)
        g.stroke()
        g.setLineDash([])
        g.beginPath()
        g.arc(target.x, target.y, MALLET_R * 0.75, 0, Math.PI * 2)
        g.stroke()
        g.restore()
      }
      // Puck trail and puck.
      trail.forEach((p, i) => {
        g.fillStyle = `rgba(27,24,56,${(i / trail.length) * 0.18})`
        g.beginPath()
        g.arc(p.x, p.y, PUCK_R * (i / trail.length), 0, Math.PI * 2)
        g.fill()
      })
      g.fillStyle = 'rgba(0,0,0,0.28)'
      g.beginPath()
      g.ellipse(puck.x + 4, puck.y + 7, PUCK_R * 1.1, PUCK_R * 0.55, 0, 0, Math.PI * 2)
      g.fill()
      const puckGrd = g.createRadialGradient(puck.x - 7, puck.y - 8, 2, puck.x, puck.y, PUCK_R * 1.2)
      puckGrd.addColorStop(0, '#8b93b6')
      puckGrd.addColorStop(0.25, '#3d466d')
      puckGrd.addColorStop(1, '#10152d')
      g.fillStyle = puckGrd
      g.beginPath()
      g.arc(puck.x, puck.y, PUCK_R, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#0d1026'
      g.lineWidth = 3
      g.stroke()
      g.fillStyle = 'rgba(255,255,255,0.45)'
      g.beginPath()
      g.ellipse(puck.x - 6, puck.y - 7, 5, 3, -0.3, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#ffd35c'
      g.lineWidth = 3
      g.beginPath()
      g.arc(puck.x, puck.y, PUCK_R - 6, 0, Math.PI * 2)
      g.stroke()
      const mallet = (m: Body, color: string) => {
        g.fillStyle = 'rgba(0,0,0,0.18)'
        g.beginPath()
        g.arc(m.x + 4, m.y + 6, MALLET_R, 0, Math.PI * 2)
        g.fill()
        const mat = g.createRadialGradient(m.x - 10, m.y - 12, 2, m.x, m.y, MALLET_R * 1.15)
        mat.addColorStop(0, '#ffffff')
        mat.addColorStop(0.18, color)
        mat.addColorStop(1, '#1b1838')
        g.fillStyle = mat
        g.strokeStyle = '#1b1838'
        g.lineWidth = 4
        g.beginPath()
        g.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = 'rgba(255,255,255,0.45)'
        g.beginPath()
        g.arc(m.x, m.y, MALLET_R * 0.45, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      }
      mallet(cpu, '#ff5f7e')
      mallet(me, '#2bd47d')
      g.restore()
      text(g, `${mine}`, 60, 30, 30, '#2bd47d')
      text(g, `${theirs}`, W - 60, 30, 30, '#ff5f7e')
      text(g, `${Math.max(0, Math.ceil(t))} s`, W / 2, 30, 20, '#fff7e8')
      text(g, 'TÚ', 60, H - 22, 14, '#2bd47d', 'center', 800)
      text(g, 'MÁQUINA', W - 70, H - 22, 14, '#ff5f7e', 'center', 800)
      if (flashT > 0) text(g, flash, W / 2, MID, flash === '¡GOL!' ? 54 : 30, flash === '¡GOL!' ? '#ffd35c' : '#ff5f7e')
      if (!started) text(g, 'Arrastra tu mazo verde y marca', W / 2, MID + 160, 20, '#1b1838')
    },
  }
}
