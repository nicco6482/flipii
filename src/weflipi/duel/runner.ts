// Runs a 1 vs 1 game on a canvas, either on one shared phone or online through a Link (net.ts).
// Online the host is the referee: it simulates with both inputs and streams snapshots plus the
// sound/effect calls of each frame; the guest only sends its touch and draws what it receives,
// with the world turned 180° so the guest also plays from the bottom.
import { createFx, H, sfx, W, type Fx, type Sfx } from '../engine'
import { bothLabels, idleInput, type DuelFactory, type DuelGame, type DuelResult, type Player, type PlayerInput, type View } from './core'

export type Link = {
  /** `lossy`: a game frame that may be dropped when the connection is backed up. */
  send: (msg: unknown, lossy?: boolean) => void
  onMessage: (fn: (msg: any) => void) => void
  onClose: (fn: () => void) => void
  close: () => void
}

export type DuelMode = { mode: 'local' } | { mode: 'host'; link: Link } | { mode: 'guest'; link: Link }

export type DuelHooks = {
  /** The match finished. Call `rematch` to play again (online: either side can ask). */
  onEnd: (result: DuelResult, rematch: () => void) => void
  /** Online only: the other phone went away. */
  onDisconnect: () => void
  /** A rematch started (online it can be the other player who asked). */
  onRestart?: () => void
}

type Call = [string, unknown[]]

/** Wrap an object so every method call is also recorded (to replay it on the guest). */
function recording<T extends object>(target: T, tag: string, log: Call[]): T {
  return new Proxy(target, {
    get(obj, key) {
      const value = (obj as Record<string | symbol, unknown>)[key]
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        log.push([`${tag}.${String(key)}`, args])
        return (value as (...a: unknown[]) => unknown).apply(obj, args)
      }
    },
  })
}

export function runDuel(canvas: HTMLCanvasElement, factory: DuelFactory, how: DuelMode, hooks: DuelHooks): () => void {
  const g = canvas.getContext('2d')!
  const effects = createFx()
  const view: View = how.mode === 'local' ? 'local' : how.mode === 'host' ? 0 : 1
  const calls: Call[] = []
  const env = how.mode === 'host' ? { sfx: recording(sfx, 's', calls), fx: recording(effects.fx, 'f', calls) } : { sfx, fx: effects.fx }
  let game: DuelGame = factory(env)
  const inputs: [PlayerInput, PlayerInput] = [idleInput(0), idleInput(1)]
  let countdown = 3.2
  let ended = false
  let stopped = false
  let raf = 0
  let last = performance.now()
  let scale = 1
  let ox = 0
  let oy = 0
  const owner = new Map<number, Player>()
  let heard = performance.now()
  let gone = false
  const lost = () => {
    if (gone || stopped) return
    gone = true
    hooks.onDisconnect()
  }

  const restart = () => {
    game = factory(env)
    inputs[0] = idleInput(0)
    inputs[1] = idleInput(1)
    countdown = 3.2
    ended = false
    hooks.onRestart?.()
  }

  const finish = (r: DuelResult) => {
    if (ended) return
    ended = true
    hooks.onEnd(r, () => {
      if (how.mode === 'local') restart()
      else if (how.mode === 'host') {
        restart()
        how.link.send({ t: 'rematch' })
      } else how.link.send({ t: 'rematch?' })
    })
  }

  if (how.mode !== 'local') {
    how.link.onMessage(msg => {
      heard = performance.now()
      if (how.mode === 'host') {
        if (msg.i) inputs[1] = msg.i
        if (msg.t === 'rematch?' && ended) {
          restart()
          how.link.send({ t: 'rematch' })
        }
        return
      }
      // Guest.
      if (msg.t === 'rematch') {
        restart()
        return
      }
      if (msg.s !== undefined) game.load(msg.s)
      if (typeof msg.c === 'number') countdown = msg.c
      for (const [name, args] of (msg.e ?? []) as Call[]) {
        const [tag, fn] = name.split('.')
        const target = (tag === 's' ? sfx : effects.fx) as unknown as Record<string, (...a: unknown[]) => void>
        target[fn]?.(...args)
      }
      if (msg.r) finish(msg.r)
    })
    how.link.onClose(lost)
  }

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    scale = Math.min(canvas.width / W, canvas.height / H)
    ox = (canvas.width - W * scale) / 2
    oy = (canvas.height - H * scale) / 2
  }

  /** Screen → world, turned around for the guest. */
  const toWorld = (e: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    const dpr = canvas.width / rect.width
    const x = ((e.clientX - rect.left) * dpr - ox) / scale
    const y = ((e.clientY - rect.top) * dpr - oy) / scale
    return view === 1 ? [W - x, H - y] : [x, y]
  }

  const playerFor = (y: number): Player => (how.mode === 'local' ? (y > H / 2 ? 0 : 1) : how.mode === 'host' ? 0 : 1)

  const onDown = (e: PointerEvent) => {
    e.preventDefault()
    const [x, y] = toWorld(e)
    const p = playerFor(y)
    // One finger per player on a shared phone.
    if ([...owner.values()].includes(p)) return
    owner.set(e.pointerId, p)
    canvas.setPointerCapture?.(e.pointerId)
    const inp = inputs[p]
    inputs[p] = { ...inp, active: true, x, y, sx: x, sy: y, st: performance.now(), downs: inp.downs + 1 }
  }
  const onMove = (e: PointerEvent) => {
    const p = owner.get(e.pointerId)
    if (p === undefined) return
    const [x, y] = toWorld(e)
    inputs[p] = { ...inputs[p], x, y }
  }
  const onUp = (e: PointerEvent) => {
    const p = owner.get(e.pointerId)
    if (p === undefined) return
    owner.delete(e.pointerId)
    const [x, y] = toWorld(e)
    const inp = inputs[p]
    inputs[p] = { ...inp, active: false, x, y, et: performance.now(), ups: inp.ups + 1 }
  }

  const frame = (now: number) => {
    const dt = Math.min(1 / 30, (now - last) / 1000)
    last = now
    if (how.mode !== 'guest') {
      if (countdown > 0) {
        const before = Math.ceil(countdown)
        countdown -= dt
        const after = Math.ceil(countdown)
        if (after !== before) env.sfx.tone(after <= 0 ? 880 : 440, after <= 0 ? 220 : 110, 'triangle', 0.08)
      } else if (!ended) {
        game.update(dt, inputs)
        const r = game.result()
        if (r) finish(r)
      }
      if (how.mode === 'host') {
        // Effects ride a reliable message of their own so a dropped frame never loses a goal sound.
        const e = calls.splice(0)
        if (e.length) how.link.send({ e })
        how.link.send({ s: game.snapshot(), c: countdown, r: game.result() }, true)
      }
    } else {
      how.link.send({ i: inputs[1] }, true)
    }
    if (how.mode !== 'local' && now - heard > 8000) lost()
    effects.step(dt)

    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = game.bg
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.setTransform(scale, 0, 0, scale, ox, oy)
    if (view === 1) {
      g.translate(W, H)
      g.rotate(Math.PI)
    }
    g.save()
    g.beginPath()
    g.rect(0, 0, W, H)
    g.clip()
    effects.shake(g)
    game.draw(g, view)
    effects.draw(g)
    if (countdown > 0) {
      g.fillStyle = 'rgba(13,11,34,0.45)'
      g.fillRect(0, 0, W, H)
      const n = Math.ceil(countdown)
      bothLabels(g, view, n > 3 ? '3' : n > 0 ? String(n) : '¡YA!', 70, 90, '#ffd35c')
    }
    g.restore()
    if (!stopped) raf = requestAnimationFrame(frame)
  }

  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  raf = requestAnimationFrame(frame)
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    ro.disconnect()
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    if (how.mode !== 'local') how.link.close()
  }
}

export type { Fx, Sfx }
