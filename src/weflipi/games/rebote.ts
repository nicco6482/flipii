// Rebote: arcade de físicas original. Mantén la pelota viva con una paleta móvil y rompe objetivos.
// Un solo gesto horizontal funciona en móvil; flechas/A-D funcionan en teclado.
import { H, W, rrect, sphere, text, type Factory } from '../engine'

const R = 14
const PADDLE_W = 108
const PADDLE_H = 18

type Target = { x: number; y: number; w: number; h: number; alive: boolean; hue: number }

export const rebote: Factory = env => {
  let started = false
  let done = false
  let score = 0
  let time = 45
  let paddle = W / 2
  let targetPaddle = paddle
  let ball = { x: W / 2, y: H - 120, vx: 150, vy: -290 }
  let pulse = 0
  let combo = 0
  const targets: Target[] = []

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      targets.push({ x: 28 + col * 58, y: 118 + row * 34, w: 50, h: 22, alive: true, hue: 178 + row * 45 + col * 4 })
    }
  }

  const finish = () => {
    if (!done) {
      done = true
      env.end(score)
    }
  }

  const movePaddle = (x: number) => {
    targetPaddle = Math.max(PADDLE_W / 2 + 12, Math.min(W - PADDLE_W / 2 - 12, x))
  }

  const hitTarget = (t: Target) => {
    t.alive = false
    score += 1 + Math.min(3, combo)
    combo += 1
    pulse = 1
    env.score(score)
    env.fx.burst(t.x + t.w / 2, t.y + t.h / 2, `hsl(${t.hue}, 90%, 65%)`, 12, 220)
    env.fx.pop(t.x + t.w / 2, t.y, `+${1 + Math.min(3, combo - 1)}`, '#ffd35c')
    env.fx.vibrate(combo >= 4 ? 28 : 10)
    env.sfx.tone(420 + Math.min(5, combo) * 55, 70, 'triangle', 0.06)
    if (targets.every(x => !x.alive)) finish()
  }

  return {
    bg: '#10152d',
    update(dt) {
      pulse = Math.max(0, pulse - dt * 4)
      paddle += (targetPaddle - paddle) * Math.min(1, dt * 16)
      if (!started || done) return
      time -= dt
      if (time <= 0) return finish()

      ball.x += ball.vx * dt
      ball.y += ball.vy * dt
      if (ball.x < R + 10) {
        ball.x = R + 10
        ball.vx = Math.abs(ball.vx)
        env.sfx.tone(180, 30, 'square', 0.025)
      } else if (ball.x > W - R - 10) {
        ball.x = W - R - 10
        ball.vx = -Math.abs(ball.vx)
        env.sfx.tone(180, 30, 'square', 0.025)
      }
      if (ball.y < R + 70) {
        ball.y = R + 70
        ball.vy = Math.abs(ball.vy)
        env.fx.vibrate(6)
      }

      const py = H - 86
      if (ball.vy > 0 && ball.y + R >= py && ball.y - R <= py + PADDLE_H && Math.abs(ball.x - paddle) <= PADDLE_W / 2 + R) {
        ball.y = py - R
        const offset = (ball.x - paddle) / (PADDLE_W / 2)
        ball.vx = Math.max(-360, Math.min(360, ball.vx + offset * 120))
        ball.vy = -Math.max(260, Math.abs(ball.vy) * 1.025)
        combo = Math.max(0, combo - 1)
        env.fx.vibrate(8)
        env.sfx.tone(360, 45, 'square', 0.04)
      }

      for (const t of targets) {
        if (!t.alive || ball.x + R < t.x || ball.x - R > t.x + t.w || ball.y + R < t.y || ball.y - R > t.y + t.h) continue
        hitTarget(t)
        ball.vy *= -1
        ball.y += ball.vy > 0 ? 5 : -5
        break
      }
      if (ball.y > H + R) {
        env.fx.shake(0.55)
        env.fx.vibrate(80)
        finish()
      }
    },
    down(x) {
      if (!started) {
        started = true
        movePaddle(x)
        env.fx.vibrate(10)
        return
      }
      movePaddle(x)
    },
    move(x) {
      movePaddle(x)
    },
    key(code, pressed) {
      if (!pressed) return
      if (!started) started = true
      if (code === 'left') movePaddle(targetPaddle - 58)
      if (code === 'right') movePaddle(targetPaddle + 58)
    },
    draw(g) {
      const bg = g.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#27336d')
      bg.addColorStop(0.55, '#141b3d')
      bg.addColorStop(1, '#090c1b')
      g.fillStyle = bg
      g.fillRect(0, 0, W, H)

      g.fillStyle = 'rgba(126,249,255,0.08)'
      for (let y = 74; y < H; y += 34) g.fillRect(18, y, W - 36, 1)
      text(g, String(score), 28, 36, 30, '#ffd35c', 'left')
      text(g, `${Math.ceil(Math.max(0, time))} s`, W - 28, 36, 22, time < 8 ? '#ff5f7e' : '#7ef9ff', 'right')

      for (const t of targets) {
        if (!t.alive) continue
        const mat = g.createLinearGradient(t.x, t.y, t.x, t.y + t.h)
        mat.addColorStop(0, '#ffffff')
        mat.addColorStop(0.16, `hsl(${t.hue}, 90%, 65%)`)
        mat.addColorStop(1, `hsl(${t.hue}, 75%, 28%)`)
        g.fillStyle = 'rgba(0,0,0,0.35)'
        rrect(g, t.x + 3, t.y + 5, t.w, t.h, 7)
        g.fill()
        g.fillStyle = mat
        g.strokeStyle = '#0b1028'
        g.lineWidth = 3
        rrect(g, t.x, t.y, t.w, t.h, 7)
        g.fill()
        g.stroke()
      }

      const py = H - 86
      g.fillStyle = 'rgba(0,0,0,0.4)'
      rrect(g, paddle - PADDLE_W / 2 + 4, py + 7, PADDLE_W, PADDLE_H, 9)
      g.fill()
      const paddleMat = g.createLinearGradient(paddle - PADDLE_W / 2, py, paddle + PADDLE_W / 2, py + PADDLE_H)
      paddleMat.addColorStop(0, '#ffffff')
      paddleMat.addColorStop(0.2, '#7ef9ff')
      paddleMat.addColorStop(1, '#3561ba')
      g.fillStyle = paddleMat
      rrect(g, paddle - PADDLE_W / 2, py, PADDLE_W, PADDLE_H, 9)
      g.fill()

      sphere(g, ball.x, ball.y, R, pulse > 0 ? '#ffd35c' : '#ff6584')
      if (!started) {
        text(g, 'REBOTE', W / 2, 430, 42, '#fff7e8')
        text(g, 'Mueve la paleta y rompe los bloques', W / 2, 478, 18, '#7ef9ff')
        text(g, 'Toca para lanzar', W / 2, 520, 20, '#ffd35c')
      }
    },
  }
}
