// Penaltis 1 vs 1, by turns: one shoots (swipe from the ball: direction aims, speed is power, a
// curved swipe bends it), the other is the keeper (slide your finger to move; the keeper follows
// at a limited speed, so read the shot). Five each, then sudden death.
//
// Everything is worked out in the shooter's frame (shooter at the bottom, goal at the top) and
// turned 180° when player 1 shoots, so the goal is always on the keeper's side of the world.
import { H, rrect, W } from '../../engine'
import { label, PLAYER_COLORS, shared, type DuelFactory, type Player, type PlayerInput, type View } from '../core'

const ROUND = 5
const GOAL = { x: 70, y: 110, w: 260, h: 110 }
const POST = 7
const BALL = { x: W / 2, y: 560 }
const R = 24
const KEEPER = { w: 70, h: 96, speed: 620 }

type Shot = { x: number; y: number; z: number; tx: number; ty: number; curve: number; dur: number; t: number }
type State = {
  turn: Player
  kicks: [number, number]
  goals: [number, number]
  log: [string[], string[]]
  shot: Shot | null
  keeperX: number
  msg: string
  msgT: number
  over: number
}

export const penaltisDuel: DuelFactory = env => {
  let s: State = { turn: 0, kicks: [0, 0], goals: [0, 0], log: [[], []], shot: null, keeperX: W / 2, msg: '', msgT: 0, over: -1 }
  const lastUps = [0, 0]

  /** World point → the shooter's frame (and back: the transform is its own inverse). */
  const frame = (p: Player, x: number, y: number): [number, number] => (p === 1 ? [W - x, H - y] : [x, y])

  const decide = () => {
    const [a, b] = s.kicks
    const [ga, gb] = s.goals
    if (a <= ROUND && b <= ROUND) {
      // Can someone no longer be caught within the five?
      if (ga > gb + (ROUND - b)) return 0
      if (gb > ga + (ROUND - a)) return 1
      if (a === ROUND && b === ROUND && ga !== gb) return ga > gb ? 0 : 1
      return -1
    }
    // Sudden death: after each pair.
    if (a === b && ga !== gb) return ga > gb ? 0 : 1
    return -1
  }

  const resolve = (kind: 'gol' | 'fallo', msg: string) => {
    const p = s.turn
    s.kicks[p] += 1
    s.log[p].push(kind)
    if (kind === 'gol') {
      s.goals[p] += 1
      env.sfx.tone(784, 160, 'triangle', 0.08)
      const [x, y] = frame(p, s.shot!.x, s.shot!.y)
      env.fx.burst(x, y, PLAYER_COLORS[p], 40, 400)
      env.fx.shake(0.45)
      env.fx.vibrate(70)
    } else {
      env.sfx.tone(200, 260, 'sawtooth', 0.05)
      env.fx.vibrate(40)
    }
    s.msg = msg
    s.msgT = 1.4
    s.over = decide()
  }

  const shoot = (inp: PlayerInput) => {
    const p = s.turn
    const [ax, ay] = frame(p, inp.sx, inp.sy)
    const [bx, by] = frame(p, inp.x, inp.y)
    let dx = bx - ax
    let dy = by - ay
    if (Math.hypot(dx, dy) < 12) {
      dx = -50
      dy = -300
    }
    if (dy > -40) return
    const secs = Math.max(0.05, (inp.et - inp.st) / 1000)
    const power = Math.min(1.6, Math.max(0.5, Math.hypot(dx, dy) / secs / 1400))
    const scale = (BALL.y - (GOAL.y + GOAL.h / 2)) / -dy
    const tx = BALL.x + dx * scale * 0.9
    // Harder shots fly higher: a normal flick goes in, only a really violent one hits the bar or flies over.
    const ty = GOAL.y + GOAL.h - 18 - (power - 0.5) * 95
    // Curve from the sideways part of the swipe compared with its straight line is not available
    // from start/end alone, so the end tilt bends it a little instead.
    const curve = Math.max(-90, Math.min(90, dx * 0.25))
    s.shot = { x: BALL.x, y: BALL.y, z: 0, tx, ty, curve, dur: 0.5 / Math.min(1.4, Math.max(0.7, power)), t: 0 }
    env.sfx.noise(90, 0.06)
    env.sfx.tone(160, 80, 'square', 0.05)
  }

  return {
    bg: '#1f6b34',
    update(dt, inputs) {
      s.msgT = Math.max(0, s.msgT - dt)
      if (s.over >= 0) return
      const shooter = s.turn
      const keeper: Player = shooter === 0 ? 1 : 0
      // Keeper follows its player's finger, at a limited speed.
      const kin = inputs[keeper]
      if (kin.active) {
        const [kx] = frame(shooter, kin.x, kin.y)
        const want = Math.max(GOAL.x + 20, Math.min(GOAL.x + GOAL.w - 20, kx))
        const step = Math.sign(want - s.keeperX) * Math.min(Math.abs(want - s.keeperX), KEEPER.speed * dt)
        s.keeperX += step
      }
      if (s.msgT > 0 && !s.shot) return
      if (!s.shot) {
        const inp = inputs[shooter]
        if (inp.ups !== lastUps[shooter]) {
          lastUps[shooter] = inp.ups
          shoot(inp)
        }
        return
      }
      const c = s.shot
      c.t += dt
      const k = Math.min(1, c.t / c.dur)
      const bend = Math.sin(k * Math.PI) * c.curve * 0.5 + c.curve * k * 0.5
      c.x = BALL.x + (c.tx - BALL.x) * k + bend * k
      c.y = BALL.y + (c.ty - BALL.y) * k - Math.sin(k * Math.PI) * 30
      c.z = k
      if (k < 1) return
      const r = R * 0.45
      const inX = c.x > GOAL.x + POST && c.x < GOAL.x + GOAL.w - POST
      const inY = c.y > GOAL.y + POST && c.y < GOAL.y + GOAL.h
      const nearPost = Math.abs(c.x - GOAL.x) < POST + r || Math.abs(c.x - (GOAL.x + GOAL.w)) < POST + r
      const nearBar = Math.abs(c.y - GOAL.y) < POST + r && c.x > GOAL.x - r && c.x < GOAL.x + GOAL.w + r
      const saved = Math.abs(c.x - s.keeperX) < KEEPER.w * 0.75 && c.y > GOAL.y + GOAL.h - KEEPER.h - 10
      if (nearPost || nearBar) resolve('fallo', nearBar ? '¡Larguero!' : '¡Al palo!')
      else if (!inX || !inY) resolve('fallo', 'Fuera')
      else if (saved) resolve('fallo', '¡Parada!')
      else resolve('gol', '¡GOOOL!')
      s.shot = null
      s.keeperX = W / 2
      if (s.over < 0) s.turn = shooter === 0 ? 1 : 0
      // Ignore a release that happened during the shot as the next player's swipe.
      lastUps[0] = inputs[0].ups
      lastUps[1] = inputs[1].ups
    },
    snapshot: () => s,
    load(state) {
      s = state as State
    },
    result: () => (s.over >= 0 ? { winner: s.over as Player, scores: [s.goals[0], s.goals[1]] } : null),
    draw(g, view) {
      const shooter = s.turn
      g.save()
      // Draw in the shooter's frame.
      if (shooter === 1) {
        g.translate(W, H)
        g.rotate(Math.PI)
      }
      drawPitch(g)
      // Keeper.
      g.save()
      g.translate(s.keeperX, GOAL.y + GOAL.h)
      g.fillStyle = PLAYER_COLORS[shooter === 0 ? 1 : 0]
      g.strokeStyle = '#1b1838'
      g.lineWidth = 3
      rrect(g, -KEEPER.w / 2 + 14, -KEEPER.h + 34, KEEPER.w - 28, KEEPER.h - 34, 10)
      g.fill()
      g.stroke()
      g.fillStyle = '#f2c79b'
      g.beginPath()
      g.arc(0, -KEEPER.h + 22, 15, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#7ef9ff'
      for (const side of [-1, 1]) {
        g.beginPath()
        g.arc(side * (KEEPER.w / 2 - 2), -KEEPER.h + 40, 10, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      }
      g.restore()
      g.fillStyle = '#fff'
      g.fillRect(GOAL.x - POST, GOAL.y - POST, POST, GOAL.h + POST)
      g.fillRect(GOAL.x + GOAL.w, GOAL.y - POST, POST, GOAL.h + POST)
      g.fillRect(GOAL.x - POST, GOAL.y - POST, GOAL.w + POST * 2, POST)
      // Ball.
      const c = s.shot
      const bx = c ? c.x : BALL.x
      const by = c ? c.y : BALL.y
      const r = R * (c ? 1 - c.z * 0.55 : 1)
      g.fillStyle = '#fff'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 3
      g.beginPath()
      g.arc(bx, by, r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#1b1838'
      g.beginPath()
      g.arc(bx, by, r * 0.32, 0, Math.PI * 2)
      g.fill()
      g.restore()
      // Scoreboard (world space), one row of dots per player.
      drawBoard(g, view, s)
      const keeper: Player = shooter === 0 ? 1 : 0
      if (s.msgT > 0) {
        label(g, view, shared(view, 0), s.msg, W / 2, H / 2 + 40, 34, '#ffd35c')
        if (view === 'local') label(g, view, 1, s.msg, W / 2, H / 2 - 40, 34, '#ffd35c')
      } else if (s.over < 0 && !s.shot) {
        label(g, view, shooter, '¡Chutas tú! Desliza desde el balón', W / 2, shooter === 0 ? H - 70 : 70, 17, PLAYER_COLORS[shooter])
        label(g, view, keeper, 'Eres el portero: mueve el dedo', W / 2, keeper === 0 ? H - 70 : 70, 17, PLAYER_COLORS[keeper])
      }
    },
  }
}

function drawPitch(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#2f8f44'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 8; i += 1) {
    g.fillStyle = i % 2 ? '#2f8f44' : '#36a04d'
    g.fillRect(0, GOAL.y + GOAL.h + i * 60, W, 60)
  }
  g.fillStyle = '#1d5f30'
  g.fillRect(0, 0, W, GOAL.y + GOAL.h)
  g.strokeStyle = 'rgba(255,255,255,0.75)'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(10, GOAL.y + GOAL.h)
  g.lineTo(W - 10, GOAL.y + GOAL.h)
  g.moveTo(GOAL.x - 40, GOAL.y + GOAL.h)
  g.lineTo(GOAL.x - 70, GOAL.y + GOAL.h + 120)
  g.lineTo(GOAL.x + GOAL.w + 70, GOAL.y + GOAL.h + 120)
  g.lineTo(GOAL.x + GOAL.w + 40, GOAL.y + GOAL.h)
  g.stroke()
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h)
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.lineWidth = 1
  for (let x = GOAL.x; x <= GOAL.x + GOAL.w; x += 14) {
    g.beginPath()
    g.moveTo(x, GOAL.y)
    g.lineTo(x, GOAL.y + GOAL.h)
    g.stroke()
  }
  for (let y = GOAL.y; y <= GOAL.y + GOAL.h; y += 14) {
    g.beginPath()
    g.moveTo(GOAL.x, y)
    g.lineTo(GOAL.x + GOAL.w, y)
    g.stroke()
  }
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(BALL.x, BALL.y + 10, 4, 0, Math.PI * 2)
  g.fill()
}

function drawBoard(g: CanvasRenderingContext2D, view: View, s: State): void {
  for (const p of [0, 1] as Player[]) {
    const y = p === 0 ? H - 26 : 26
    const n = Math.max(ROUND, s.log[p].length)
    for (let i = 0; i < n; i += 1) {
      const k = s.log[p][i]
      g.fillStyle = k === 'gol' ? '#2bd47d' : k === 'fallo' ? '#ff2d55' : 'rgba(255,255,255,0.3)'
      g.strokeStyle = PLAYER_COLORS[p]
      g.lineWidth = 2
      g.beginPath()
      g.arc(W / 2 + (i - (n - 1) / 2) * 24, y, 8, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
    label(g, view, shared(view, p), String(s.goals[p]), p === 0 ? 34 : W - 34, y, 26, PLAYER_COLORS[p])
  }
}
