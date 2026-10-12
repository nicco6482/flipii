// Animated weflipi cover behind the hub: a big card that keeps flipping through the minigames and
// lands on today's one, the game icons orbiting around it, twinkling stars and icons floating up.
// Pure 2D canvas so the hub stays light; scrolling spins the orbit and reduced motion freezes it.

const ICONS = ['🎯', '🎳', '⛳', '🏎️', '🐤', '🧱', '⚡', '🌀']
const HOLD = 1.1
const FLIP = 0.45

export type CoverGame = { emoji: string; name: string; color: string }

type Floater = { x: number; y: number; vy: number; rot: number; vr: number; size: number; icon: string; sway: number }
type Star = { x: number; y: number; r: number; phase: number }

export type Cover = { pause: (on: boolean) => void }

/** `anchor` returns the on-screen box the card should sit in (the page's hero gap), if any. */
export function startCover(canvas: HTMLCanvasElement, games: CoverGame[], today: number, anchor: () => DOMRect | null): Cover {
  const g = canvas.getContext('2d')!
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  let w = 0
  let h = 0
  let dpr = 1
  let t = 0
  let spin = 0
  let lastScroll = scrollY
  let paused = false
  let raf = 0
  let last = performance.now()
  let stars: Star[] = []
  let floaters: Floater[] = []

  const spawn = (y?: number): Floater => ({
    x: Math.random() * w,
    y: y ?? h + 40,
    vy: 14 + Math.random() * 22,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.6,
    size: 16 + Math.random() * 18,
    icon: ICONS[Math.floor(Math.random() * ICONS.length)],
    sway: Math.random() * Math.PI * 2,
  })

  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1)
    w = innerWidth
    h = innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    stars = Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.4, phase: Math.random() * 6 }))
    floaters = Array.from({ length: Math.max(5, Math.round(w / 110)) }, () => spawn(Math.random() * h))
  }

  const emojiFont = (size: number) => `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`

  /** Which game the card shows and how far through the flip it is (0 = flat, 1 = edge-on). */
  const cardState = () => {
    // Flip through every game once, then rest on today's game for a while, and repeat.
    const n = games.length
    const cycle = n * (HOLD + FLIP) + 3.5
    const c = t % cycle
    const slot = Math.min(n, Math.floor(c / (HOLD + FLIP)))
    if (slot >= n) return { index: today, turn: 0 }
    const within = c - slot * (HOLD + FLIP)
    const index = (today + 1 + slot) % n
    if (within < HOLD) return { index, turn: 0 }
    const f = (within - HOLD) / FLIP
    // First half shrinks the current face, second half grows the next one.
    return f < 0.5 ? { index, turn: f * 2 } : { index: (index + 1) % n, turn: (1 - f) * 2 }
  }

  const card = (cx: number, cy: number, cw: number, ch: number) => {
    const { index, turn } = cardState()
    const game = games[index]
    const sx = Math.max(0.02, Math.cos((turn * Math.PI) / 2))
    const lift = Math.sin(t * 1.6) * 8
    g.save()
    g.translate(cx, cy + lift)
    g.rotate(Math.sin(t * 0.9) * 0.05)
    g.scale(sx, 1)
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.beginPath()
    g.roundRect(-cw / 2 + 10, -ch / 2 + 14, cw, ch, 26)
    g.fill()
    const face = g.createLinearGradient(0, -ch / 2, 0, ch / 2)
    face.addColorStop(0, shade(game.color, 0.25))
    face.addColorStop(1, shade(game.color, -0.15))
    g.fillStyle = face
    g.strokeStyle = '#1b1838'
    g.lineWidth = 6
    g.beginPath()
    g.roundRect(-cw / 2, -ch / 2, cw, ch, 26)
    g.fill()
    g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.18)'
    g.beginPath()
    g.roundRect(-cw / 2 + 10, -ch / 2 + 10, cw - 20, ch * 0.32, 18)
    g.fill()
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    // Chrome applies the fill colour's alpha to colour emoji: draw them with an opaque fill.
    g.fillStyle = '#000'
    g.font = emojiFont(cw * 0.5)
    g.fillText(game.emoji, 0, -ch * 0.08)
    let size = Math.round(cw * 0.13)
    g.font = `800 ${size}px Sora, system-ui, sans-serif`
    while (size > 10 && g.measureText(game.name).width > cw * 0.82) g.font = `800 ${(size -= 1)}px Sora, system-ui, sans-serif`
    g.lineJoin = 'round'
    g.lineWidth = cw * 0.035
    g.strokeStyle = '#1b1838'
    g.strokeText(game.name, 0, ch * 0.31)
    g.fillStyle = '#fff7e8'
    g.fillText(game.name, 0, ch * 0.31)
    if (index === today && turn === 0) {
      const tag = 'HOY'
      g.font = `900 ${Math.round(cw * 0.1)}px Sora, system-ui, sans-serif`
      const tw = g.measureText(tag).width + cw * 0.12
      g.fillStyle = '#ffd35c'
      g.strokeStyle = '#1b1838'
      g.lineWidth = 4
      g.beginPath()
      g.roundRect(-tw / 2, -ch / 2 - cw * 0.08, tw, cw * 0.16, 10)
      g.fill()
      g.stroke()
      g.fillStyle = '#1b1838'
      g.fillText(tag, 0, -ch / 2)
    }
    g.restore()
  }

  /** Game icons on a tilted ring around the card; the back half is drawn behind it. */
  const orbit = (cx: number, cy: number, rx: number, ry: number, half: 'back' | 'front') => {
    games.forEach((game, i) => {
      const a = spin + (i / games.length) * Math.PI * 2
      const depth = Math.sin(a)
      if ((half === 'front') !== depth > 0) return
      const scale = 0.7 + 0.3 * (depth + 1) / 2
      const x = cx + Math.cos(a) * rx
      const y = cy + depth * ry
      const r = 24 * scale
      g.globalAlpha = half === 'back' ? 0.55 : 1
      g.fillStyle = game.color
      g.strokeStyle = '#1b1838'
      g.lineWidth = 3
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#000'
      g.font = emojiFont(r * 1.1)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(game.emoji, x, y + 1)
    })
    g.globalAlpha = 1
  }

  const draw = (dt: number) => {
    t += dt
    const scroll = scrollY
    spin += dt * 0.5 + (scroll - lastScroll) * 0.006
    lastScroll = scroll
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const sky = g.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#3a2f86')
    sky.addColorStop(0.55, '#1f1a4d')
    sky.addColorStop(1, '#14112e')
    g.fillStyle = sky
    g.fillRect(0, 0, w, h)
    const glow = g.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, Math.max(w, h) * 0.6)
    glow.addColorStop(0, 'rgba(255, 190, 80, 0.22)')
    glow.addColorStop(1, 'rgba(255, 190, 80, 0)')
    g.fillStyle = glow
    g.fillRect(0, 0, w, h)
    for (const s of stars) {
      g.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + s.phase)
      g.fillStyle = '#fff7e8'
      g.beginPath()
      g.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (const f of floaters) {
      f.y -= f.vy * dt
      f.rot += f.vr * dt
      if (f.y < -60) Object.assign(f, spawn())
      g.save()
      g.globalAlpha = 0.3
      g.fillStyle = '#000'
      g.translate(f.x + Math.sin(t * 0.8 + f.sway) * 12, f.y)
      g.rotate(f.rot)
      g.font = `${f.size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
      g.fillText(f.icon, 0, 0)
      g.restore()
    }
    const box = anchor()
    const cx = w / 2
    // The card lives in the page's hero gap (and scrolls away with it); screens without one
    // keep just the starry background.
    const space = box?.height ?? 0
    const cw = Math.min(190, w * 0.44, (space * 0.68) / 1.28)
    const ch = cw * 1.28
    const cy = box ? box.top + box.height * 0.44 : 0
    if (box && space > 0 && cy + ch > -60) {
      // The orbit circles the card's feet so the front icons never hide its name.
      const rx = Math.min(w / 2 - 34, cw * 1.25)
      const ry = cw * 0.2
      orbit(cx, cy + ch * 0.5, rx, ry, 'back')
      card(cx, cy, cw, ch)
      orbit(cx, cy + ch * 0.5, rx, ry, 'front')
    }
    // Fade the bottom so cards on top stay readable.
    const fade = g.createLinearGradient(0, h * 0.6, 0, h)
    fade.addColorStop(0, 'rgba(20,17,46,0)')
    fade.addColorStop(1, 'rgba(20,17,46,0.85)')
    g.fillStyle = fade
    g.fillRect(0, h * 0.6, w, h * 0.4)
  }

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (!paused && !document.hidden) draw(dt)
    raf = requestAnimationFrame(frame)
  }

  resize()
  addEventListener('resize', resize)
  if (still) {
    draw(0)
    addEventListener('resize', () => draw(0))
  } else raf = requestAnimationFrame(frame)
  void raf
  return {
    pause(on) {
      paused = on
      last = performance.now()
    },
  }
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(Math.max(0, Math.min(255, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)))
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
}
