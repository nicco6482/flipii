// Tiny 2D runtime shared by the weflipi minigames. Every game draws into a fixed 400×700 portrait
// world; the runner letterboxes it to the screen, maps pointer/keyboard input into world units and
// steps the game with a clamped frame delta.

export const W = 400
export const H = 700

export type Env = {
  /** Seeded random: the same sequence for everyone on the same day. */
  rand: () => number
  /** Live score shown in the top bar. */
  score: (n: number) => void
  /** Finish the run with the final score (call once). */
  end: (score: number) => void
  sfx: Sfx
  /** Game feel: particles, screen shake, floating text and phone vibration. */
  fx: Fx
}

export type Fx = {
  /** Particle burst at world (x, y). */
  burst: (x: number, y: number, color?: string, count?: number, speed?: number) => void
  /** Shake the screen; power ~0.2 (tap) to 1 (explosion). */
  shake: (power: number) => void
  /** Floating text that rises and fades ("+3", "¡GOL!"). */
  pop: (x: number, y: number, label: string, color?: string) => void
  /** Phone vibration in ms (ignored where unsupported or muted). */
  vibrate: (ms: number) => void
}

/** No-op effects, for headless tests. */
export const noFx: Fx = { burst: () => undefined, shake: () => undefined, pop: () => undefined, vibrate: () => undefined }

export interface MiniGame {
  /** Colour painted outside the 400×700 world on wide or tall screens. */
  bg: string
  update(dt: number): void
  draw(g: CanvasRenderingContext2D): void
  down?(x: number, y: number): void
  move?(x: number, y: number): void
  up?(x: number, y: number): void
  /** Arrow keys; Space/Enter arrive as a down+up in the middle of the screen. */
  key?(code: 'left' | 'right' | 'up' | 'down', pressed: boolean): void
}

export type Factory = (env: Env) => MiniGame

export function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Sound ──────────────────────────────────────────────────────────────

export type Sfx = { tone: (freq: number, ms?: number, type?: OscillatorType, vol?: number, slide?: number) => void; noise: (ms?: number, vol?: number) => void }

let audio: AudioContext | null = null
function ctx(): AudioContext | null {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    return audio
  } catch {
    return null
  }
}

export const sfx: Sfx = {
  tone(freq, ms = 90, type = 'square', vol = 0.06, slide = 0) {
    const a = ctx()
    if (!a || muted()) return
    const o = a.createOscillator()
    const v = a.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, a.currentTime)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + ms / 1000)
    v.gain.setValueAtTime(vol, a.currentTime)
    v.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000)
    o.connect(v).connect(a.destination)
    o.start()
    o.stop(a.currentTime + ms / 1000 + 0.02)
  },
  noise(ms = 180, vol = 0.08) {
    const a = ctx()
    if (!a || muted()) return
    const len = Math.floor((a.sampleRate * ms) / 1000)
    const buf = a.createBuffer(1, len, a.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const s = a.createBufferSource()
    const v = a.createGain()
    v.gain.value = vol
    s.buffer = buf
    s.connect(v).connect(a.destination)
    s.start()
  },
}

export function muted(): boolean {
  try {
    return localStorage.getItem('weflipi.muted') === '1'
  } catch {
    return false
  }
}

export function setMuted(on: boolean): void {
  try {
    localStorage.setItem('weflipi.muted', on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

// ─── Drawing helpers ────────────────────────────────────────────────────

export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#fff7e8', align: CanvasTextAlign = 'center', weight = 800): void {
  g.font = `${weight} ${size}px Sora, Figtree, system-ui, sans-serif`
  g.textAlign = align
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.lineWidth = size * 0.22
  g.strokeStyle = '#1b1838'
  g.strokeText(s, x, y)
  g.fillStyle = color
  g.fillText(s, x, y)
}

// ─── Runner ─────────────────────────────────────────────────────────────

/** Mount `factory` on `canvas`. Returns a stop function that removes every listener. */
export function run(canvas: HTMLCanvasElement, factory: Factory, env: Omit<Env, 'sfx' | 'fx'>): () => void {
  const g = canvas.getContext('2d')!
  let ended = false
  type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
  type Pop = { x: number; y: number; label: string; color: string; life: number }
  type Ripple = { x: number; y: number; life: number; color: string }
  const particles: Particle[] = []
  const pops: Pop[] = []
  const ripples: Ripple[] = []
  let shakeAmt = 0
  const PALETTE = ['#ffd35c', '#ff5f7e', '#7ef9ff', '#2bd47d', '#a77bff', '#ff9f43']
  const fx: Fx = {
    burst(x, y, color, count = 18, speed = 320) {
      for (let i = 0; i < count && particles.length < 400; i += 1) {
        const a = Math.random() * Math.PI * 2
        const v = speed * (0.35 + Math.random() * 0.65)
        const life = 0.45 + Math.random() * 0.45
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life, max: life, color: color ?? PALETTE[i % PALETTE.length], size: 3 + Math.random() * 4 })
      }
    },
    shake(power) {
      shakeAmt = Math.min(1.2, Math.max(shakeAmt, power))
    },
    pop(x, y, label, color = '#ffd35c') {
      pops.push({ x, y, label, color, life: 1 })
    },
    vibrate(ms) {
      if (muted()) return
      try {
        navigator.vibrate?.(ms)
      } catch {
        /* unsupported */
      }
    },
  }
  const game = factory({
    ...env,
    sfx,
    fx,
    end: score => {
      if (ended) return
      ended = true
      env.end(score)
    },
  })
  let scale = 1
  let ox = 0
  let oy = 0
  let raf = 0
  let last = performance.now()

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    scale = Math.min(canvas.width / W, canvas.height / H)
    ox = (canvas.width - W * scale) / 2
    oy = (canvas.height - H * scale) / 2
  }
  const toWorld = (e: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    const dpr = canvas.width / rect.width
    return [((e.clientX - rect.left) * dpr - ox) / scale, ((e.clientY - rect.top) * dpr - oy) / scale]
  }
  const frame = (now: number) => {
    const dt = Math.min(1 / 30, (now - last) / 1000)
    last = now
    if (!ended) game.update(dt)
    for (const p of particles) {
      p.vy += 900 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) if (particles[i].life <= 0) particles.splice(i, 1)
    for (const p of pops) p.life -= dt * 0.9
    while (pops.length && pops[0].life <= 0) pops.shift()
    for (const r of ripples) r.life -= dt * 2.6
    while (ripples.length && ripples[0].life <= 0) ripples.shift()
    shakeAmt = Math.max(0, shakeAmt - dt * 2.5)
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = game.bg
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.setTransform(scale, 0, 0, scale, ox, oy)
    g.save()
    g.beginPath()
    g.rect(0, 0, W, H)
    g.clip()
    if (shakeAmt > 0) g.translate((Math.random() - 0.5) * shakeAmt * 16, (Math.random() - 0.5) * shakeAmt * 16)
    game.draw(g)
    for (const r of ripples) {
      const progress = 1 - Math.max(0, r.life)
      g.globalAlpha = Math.max(0, r.life) * 0.8
      g.strokeStyle = r.color
      g.lineWidth = 5 - progress * 3
      g.beginPath()
      g.arc(r.x, r.y, 10 + progress * 42, 0, Math.PI * 2)
      g.stroke()
    }
    for (const p of particles) {
      g.globalAlpha = Math.max(0, p.life / p.max)
      g.fillStyle = p.color
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    g.globalAlpha = 1
    for (const p of pops) {
      g.globalAlpha = Math.min(1, p.life * 2)
      text(g, p.label, p.x, p.y - (1 - p.life) * 60, 28 + (1 - p.life) * 6, p.color)
    }
    g.globalAlpha = 1
    g.restore()
    raf = requestAnimationFrame(frame)
  }
  const onDown = (e: PointerEvent) => {
    e.preventDefault()
    canvas.setPointerCapture?.(e.pointerId)
    if (!ended) {
      const [x, y] = toWorld(e)
      ripples.push({ x, y, life: 1, color: e.pointerType === 'touch' ? '#7ef9ff' : '#ffd35c' })
      if (ripples.length > 12) ripples.shift()
      game.down?.(x, y)
    }
  }
  const onMove = (e: PointerEvent) => !ended && game.move?.(...toWorld(e))
  const onUp = (e: PointerEvent) => {
    if (!ended) game.up?.(...toWorld(e))
    try {
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* Synthetic pointers may not support capture release. */
    }
  }
  const keys: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' }
  const onKey = (e: KeyboardEvent) => {
    if (ended || e.repeat) return
    const pressed = e.type === 'keydown'
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault()
      if (pressed) game.down?.(W / 2, H / 2)
      else game.up?.(W / 2, H / 2)
      return
    }
    const k = keys[e.code]
    if (k) {
      e.preventDefault()
      game.key?.(k, pressed)
    }
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  raf = requestAnimationFrame(frame)
  return () => {
    ended = true
    cancelAnimationFrame(raf)
    ro.disconnect()
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('keyup', onKey)
  }
}
