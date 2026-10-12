// Futbolín: 60 seconds against the machine. Slide your finger left and right to move all your rods
// at once (yellow team, attacking upwards); every touch is a kick that fires the ball from any of
// your players it's touching. The ball bounces off the walls, the players and the rods' feet with
// real momentum. The machine's rods track the ball faster and faster. Score = your goals.
import { H, W, rrect, text, type Factory } from '../engine'

const TIME = 60
const F = { x: 30, y: 60, w: W - 60, h: H - 110 } // pitch
const GOAL_W = 120
const BALL_R = 10
const FOOT = { w: 22, h: 14 }
const KICK_TIME = 0.18
const MAX_BALL = 1400

type Rod = { y: number; players: number; spacing: number; mine: boolean; off: number; kick: number }

// From your goal (bottom) to theirs (top): GK, DEF, their ATT, MID, their MID, ATT, their DEF, their GK.
const LAYOUT: [number, number, boolean][] = [
  [1, 0, true],
  [2, 110, true],
  [3, 95, false],
  [5, 62, true],
  [5, 62, false],
  [3, 95, true],
  [2, 110, false],
  [1, 0, false],
]

export const futbolin: Factory = env => {
  let t = TIME
  let started = false
  let mine = 0
  let theirs = 0
  let pause = 0.6
  let msg = ''
  let msgT = 0
  let still = 0
  const ball = { x: W / 2, y: F.y + F.h / 2, vx: 0, vy: 0, spin: 0 }
  const rods: Rod[] = LAYOUT.map(([players, spacing, isMine], i) => ({
    y: F.y + F.h - 40 - (i * (F.h - 80)) / (LAYOUT.length - 1),
    players,
    spacing,
    mine: isMine,
    off: 0,
    kick: 0,
  }))
  let target = 0 // my rods' shared offset, from the finger
  const cpuSpeed = () => 150 + (TIME - t) * 5

  const maxOff = (r: Rod) => F.w / 2 - FOOT.w / 2 - 6 - ((r.players - 1) * r.spacing) / 2
  const footXs = (r: Rod) => Array.from({ length: r.players }, (_, i) => W / 2 + r.off + (i - (r.players - 1) / 2) * r.spacing)

  const serve = (towardsMe: boolean) => {
    ball.x = W / 2 + (env.rand() - 0.5) * 60
    ball.y = F.y + F.h / 2
    ball.vx = (env.rand() - 0.5) * 220
    ball.vy = towardsMe ? 160 : -160
    pause = 0.8
  }
  serve(true)

  const kickAll = () => {
    for (const r of rods) if (r.mine) r.kick = KICK_TIME
    env.sfx.tone(220, 40, 'square', 0.04)
  }

  /** Ball against one foot (axis-aligned box): bounce, plus a kick if that rod is swinging. */
  const hitFoot = (r: Rod, fx: number) => {
    const cx = Math.max(fx - FOOT.w / 2, Math.min(ball.x, fx + FOOT.w / 2))
    const cy = Math.max(r.y - FOOT.h / 2, Math.min(ball.y, r.y + FOOT.h / 2))
    const dx = ball.x - cx
    const dy = ball.y - cy
    const d = Math.hypot(dx, dy)
    if (d >= BALL_R) return
    let nx = 0
    let ny = 0
    if (d === 0) ny = r.mine ? -1 : 1
    else {
      nx = dx / d
      ny = dy / d
    }
    ball.x = cx + nx * BALL_R
    ball.y = cy + ny * BALL_R
    const dot = ball.vx * nx + ball.vy * ny
    if (dot < 0) {
      ball.vx -= 1.75 * dot * nx
      ball.vy -= 1.75 * dot * ny
    }
    if (r.kick > 0) {
      // A swinging foot fires the ball towards the other goal; hitting it off-centre angles it.
      const dir = r.mine ? -1 : 1
      const off = (ball.x - fx) / (FOOT.w / 2)
      ball.vy = dir * (950 + Math.random() * 150)
      ball.vx += off * 380
      ball.spin = off * 6
      r.kick = 0
      env.sfx.tone(140, 60, 'square', 0.08)
      env.fx.shake(0.25)
      env.fx.vibrate(15)
    }
    const sp = Math.hypot(ball.vx, ball.vy)
    if (sp > MAX_BALL) {
      ball.vx *= MAX_BALL / sp
      ball.vy *= MAX_BALL / sp
    }
  }

  const goal = (forMe: boolean) => {
    if (forMe) {
      mine += 1
      env.score(mine)
      msg = '¡GOOOL!'
      env.fx.burst(W / 2, F.y + 10, undefined, 40, 420)
      env.fx.shake(0.6)
      env.fx.vibrate(60)
      env.sfx.tone(880, 200, 'triangle', 0.09)
    } else {
      theirs += 1
      msg = 'Gol de la máquina'
      env.fx.vibrate(100)
      env.sfx.tone(160, 300, 'sawtooth', 0.06)
    }
    msgT = 1.2
    serve(!forMe)
  }

  return {
    bg: '#123a24',
    update(dt) {
      msgT = Math.max(0, msgT - dt)
      if (!started) return
      t -= dt
      if (t <= 0) {
        env.end(mine)
        return
      }
      for (const r of rods) {
        r.kick = Math.max(0, r.kick - dt)
        const lim = maxOff(r)
        if (r.mine) {
          const goalOff = Math.max(-lim, Math.min(lim, target))
          r.off += (goalOff - r.off) * Math.min(1, dt * 18)
        } else {
          // Line the nearest foot up with the ball, at a limited speed; kick when it's close.
          const xs = footXs(r)
          let best = xs[0]
          for (const x of xs) if (Math.abs(x - ball.x) < Math.abs(best - ball.x)) best = x
          const want = Math.max(-lim, Math.min(lim, r.off + (ball.x - best)))
          const step = Math.sign(want - r.off) * Math.min(Math.abs(want - r.off), cpuSpeed() * dt)
          r.off += step
          const ahead = ball.y > r.y - 26 && ball.y < r.y + 40
          if (ahead && Math.abs(best - ball.x) < FOOT.w && r.kick <= 0 && Math.random() < dt * 8) r.kick = KICK_TIME
        }
      }
      if (pause > 0) {
        pause -= dt
        return
      }
      const steps = 6
      for (let s = 0; s < steps; s += 1) {
        const h = dt / steps
        ball.x += ball.vx * h
        ball.y += ball.vy * h
        const drag = Math.exp(-0.35 * h)
        ball.vx *= drag
        ball.vy *= drag
        if (ball.x < F.x + BALL_R) {
          ball.x = F.x + BALL_R
          ball.vx = Math.abs(ball.vx) * 0.85
        }
        if (ball.x > F.x + F.w - BALL_R) {
          ball.x = F.x + F.w - BALL_R
          ball.vx = -Math.abs(ball.vx) * 0.85
        }
        const inMouth = Math.abs(ball.x - W / 2) < GOAL_W / 2 - BALL_R
        if (ball.y < F.y + BALL_R) {
          if (inMouth) return goal(true)
          ball.y = F.y + BALL_R
          ball.vy = Math.abs(ball.vy) * 0.85
        }
        if (ball.y > F.y + F.h - BALL_R) {
          if (inMouth) return goal(false)
          ball.y = F.y + F.h - BALL_R
          ball.vy = -Math.abs(ball.vy) * 0.85
        }
        for (const r of rods) for (const x of footXs(r)) hitFoot(r, x)
      }
      // A dead ball gets a nudge, like tilting the table.
      still = Math.hypot(ball.vx, ball.vy) < 25 ? still + dt : 0
      if (still > 1.5) {
        ball.vx += (env.rand() - 0.5) * 300
        ball.vy += (env.rand() - 0.5) * 300
        still = 0
      }
      ball.spin *= Math.exp(-dt)
    },
    down(x) {
      started = true
      target = x - W / 2
      kickAll()
    },
    move(x) {
      target = x - W / 2
    },
    key(k, pressed) {
      if (!pressed) return
      started = true
      if (k === 'left') target -= 40
      if (k === 'right') target += 40
      if (k === 'up') kickAll()
    },
    draw(g) {
      // Table and pitch.
      g.fillStyle = '#3a2416'
      rrect(g, F.x - 22, F.y - 26, F.w + 44, F.h + 52, 20)
      g.fill()
      for (let i = 0; i < 10; i += 1) {
        g.fillStyle = i % 2 ? '#2f9a4c' : '#34a653'
        g.fillRect(F.x, F.y + (i * F.h) / 10, F.w, F.h / 10 + 1)
      }
      g.strokeStyle = 'rgba(255,255,255,0.75)'
      g.lineWidth = 3
      g.strokeRect(F.x + 3, F.y + 3, F.w - 6, F.h - 6)
      g.beginPath()
      g.moveTo(F.x, F.y + F.h / 2)
      g.lineTo(F.x + F.w, F.y + F.h / 2)
      g.stroke()
      g.beginPath()
      g.arc(W / 2, F.y + F.h / 2, 46, 0, Math.PI * 2)
      g.stroke()
      g.strokeRect(W / 2 - 80, F.y + 3, 160, 60)
      g.strokeRect(W / 2 - 80, F.y + F.h - 63, 160, 60)
      g.fillStyle = '#1b1838'
      g.fillRect(W / 2 - GOAL_W / 2, F.y - 14, GOAL_W, 14)
      g.fillRect(W / 2 - GOAL_W / 2, F.y + F.h, GOAL_W, 14)
      // Ball shadow + ball (under the rods).
      g.fillStyle = 'rgba(0,0,0,0.3)'
      g.beginPath()
      g.ellipse(ball.x + 3, ball.y + 4, BALL_R, BALL_R * 0.8, 0, 0, Math.PI * 2)
      g.fill()
      g.save()
      g.translate(ball.x, ball.y)
      g.rotate(ball.spin * t)
      g.fillStyle = '#fff'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 2
      g.beginPath()
      g.arc(0, 0, BALL_R, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#1b1838'
      g.beginPath()
      g.arc(0, 0, 3.5, 0, Math.PI * 2)
      g.fill()
      g.restore()
      // Rods with their players.
      for (const r of rods) {
        g.fillStyle = '#c9ced8'
        g.fillRect(F.x - 22, r.y - 3, F.w + 44, 6)
        g.fillStyle = 'rgba(255,255,255,0.6)'
        g.fillRect(F.x - 22, r.y - 3, F.w + 44, 2)
        const color = r.mine ? '#ffd35c' : '#ff5f7e'
        const swing = r.kick > 0 ? Math.sin((1 - r.kick / KICK_TIME) * Math.PI) : 0
        for (const x of footXs(r)) {
          // Body (seen from above) and the foot, which swings out when kicking.
          const dir = r.mine ? -1 : 1
          g.fillStyle = 'rgba(0,0,0,0.25)'
          g.beginPath()
          g.ellipse(x + 3, r.y + 4, 16, 11, 0, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = color
          g.strokeStyle = '#1b1838'
          g.lineWidth = 2.5
          rrect(g, x - FOOT.w / 2, r.y - FOOT.h / 2 + dir * swing * 12, FOOT.w, FOOT.h, 5)
          g.fill()
          g.stroke()
          g.beginPath()
          g.ellipse(x, r.y, 15, 10, 0, 0, Math.PI * 2)
          g.fill()
          g.stroke()
          g.fillStyle = '#f2c79b'
          g.beginPath()
          g.arc(x, r.y, 6, 0, Math.PI * 2)
          g.fill()
          g.stroke()
        }
        // Handle on the owner's side.
        g.fillStyle = r.mine ? '#ffd35c' : '#ff5f7e'
        rrect(g, r.mine ? F.x + F.w + 14 : F.x - 34, r.y - 7, 20, 14, 5)
        g.fill()
      }
      text(g, `${mine}`, 50, 24, 26, '#ffd35c')
      text(g, `${theirs}`, W - 50, 24, 26, '#ff5f7e')
      text(g, `${Math.max(0, Math.ceil(t))} s`, W / 2, 24, 18)
      if (msgT > 0) text(g, msg, W / 2, F.y + F.h / 2, msg.startsWith('¡G') ? 50 : 28, msg.startsWith('¡G') ? '#ffd35c' : '#ff5f7e')
      else if (!started) {
        text(g, 'Desliza para mover tus barras', W / 2, F.y + F.h / 2 - 16, 18)
        text(g, 'y toca para chutar', W / 2, F.y + F.h / 2 + 12, 18)
      }
    },
  }
}
