/**
 * Unified input for a one-axis game: every device feeds `turn` (continuous, −1..1) and a direct
 * drag delta, plus a few edge-triggered actions. Gameplay never reads raw keys.
 *
 * - Keyboard: A/D or ←/→ rotate; Space/Enter confirm (start / restart); Esc/P pause.
 * - Mouse / touch: drag anywhere on the canvas to rotate the tower 1:1.
 * - Gamepad: left stick or D-pad rotate; A confirm; Start pause; B back; Y share.
 * - On-screen buttons call `setTouchTurn`.
 */
export type Action = 'confirm' | 'select' | 'pause' | 'back' | 'share' | 'navUp' | 'navDown' | 'navLeft' | 'navRight'
export type InputMethod = 'keyboard' | 'mouse' | 'gamepad' | 'touch'

const KEY_BINDINGS: Record<Action, string[]> = {
  /** Space: the screen's primary action (start / restart), regardless of focus. */
  confirm: ['Space'],
  /** Enter / pad A: activate the focused button (defaults to the primary one). */
  select: ['Enter', 'NumpadEnter'],
  pause: ['Escape', 'KeyP'],
  back: [],
  share: [],
  navUp: ['ArrowUp', 'KeyW'],
  navDown: ['ArrowDown', 'KeyS'],
  navLeft: [],
  navRight: [],
}
const LEFT = ['KeyA', 'ArrowLeft']
const RIGHT = ['KeyD', 'ArrowRight']
// Standard mapping: A=0, B=1, Y=3, Start=9, D-pad 12..15.
const PAD_BINDINGS: Record<Action, number[]> = { confirm: [], select: [0], pause: [9], back: [1], share: [3], navUp: [12], navDown: [13], navLeft: [14], navRight: [15] }

export class Input {
  /** Continuous rotate intent in [−1, 1]; positive turns the tower's front to the right. */
  turn = 0
  method: InputMethod = 'keyboard'
  /** Multiplies drag distance; settings screen writes it. */
  sensitivity = 1
  /** Whether a drag on the canvas is currently held. */
  dragging = false
  /** Any rotate intent this frame (used for "turn to start" on the title screen). */
  anyTurn = false
  private dragPx = 0
  private keys = new Set<string>()
  private pressed_ = new Set<Action>()
  private touchTurn = 0
  private padPrev = new Set<Action>()
  private pointerId: number | null = null
  private lastX = 0
  private listeners: Array<() => void> = []

  constructor(canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(window, 'keydown', e => {
      const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea')
      if (typing) return
      // Space/Enter/arrows are game controls: never scroll or natively click a focused button.
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code.startsWith('Arrow')) e.preventDefault()
      if (e.repeat) return
      this.keys.add(e.code)
      this.method = 'keyboard'
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
        if (codes.includes(e.code)) this.pressed_.add(action)
      }
    })
    on(window, 'keyup', e => this.keys.delete(e.code))
    on(window, 'blur', () => {
      this.keys.clear()
      this.endDrag()
    })
    on(canvas, 'pointerdown', e => {
      if (this.pointerId !== null) return
      this.pointerId = e.pointerId
      this.lastX = e.clientX
      this.dragging = true
      this.method = e.pointerType === 'touch' ? 'touch' : 'mouse'
      try {
        canvas.setPointerCapture?.(e.pointerId)
      } catch {
        // Synthetic pointers cannot be captured; dragging still works without capture.
      }
    })
    on(canvas, 'pointermove', e => {
      if (e.pointerId !== this.pointerId) return
      this.dragPx += e.clientX - this.lastX
      this.lastX = e.clientX
    })
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.pointerId) this.endDrag()
    }
    on(canvas, 'pointerup', up)
    on(canvas, 'pointercancel', up)
    on(canvas, 'lostpointercapture', up)
  }

  private endDrag(): void {
    this.pointerId = null
    this.dragging = false
  }

  setTouchTurn(x: number): void {
    this.method = 'touch'
    this.touchTurn = x
  }

  /** Sample continuous sources. Call once per rendered frame before gameplay reads input. */
  update(): void {
    const k = (codes: string[]) => codes.some(code => this.keys.has(code))
    let x = (k(RIGHT) ? 1 : 0) - (k(LEFT) ? 1 : 0)
    if (this.touchTurn !== 0) x = this.touchTurn
    const pad = navigator.getGamepads?.().find(p => p && p.connected)
    if (pad) {
      const lx = pad.axes[0] ?? 0
      const stick = Math.abs(lx) < 0.2 ? 0 : (lx - Math.sign(lx) * 0.2) / 0.8
      const dpad = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0)
      const padX = dpad !== 0 ? dpad : stick
      const now = new Set<Action>()
      for (const [action, buttons] of Object.entries(PAD_BINDINGS) as [Action, number[]][]) {
        if (buttons.some(i => pad.buttons[i]?.pressed)) now.add(action)
      }
      if (padX !== 0 || now.size) this.method = 'gamepad'
      if (padX !== 0) x = padX
      for (const action of now) if (!this.padPrev.has(action)) this.pressed_.add(action)
      this.padPrev = now
    }
    this.turn = Math.max(-1, Math.min(1, x))
    this.anyTurn = this.turn !== 0 || Math.abs(this.dragPx) > 3
  }

  /** Radians of tower rotation from mouse/touch drag since the last call (screen-width normalised). */
  takeDrag(): number {
    const px = this.dragPx
    this.dragPx = 0
    const width = Math.max(320, Math.min(window.innerWidth, 1600))
    return ((px * Math.PI * 3) / width) * this.sensitivity
  }

  pressed(action: Action): boolean {
    return this.pressed_.has(action)
  }

  /** Read and clear a press, so one press triggers exactly one action. */
  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }

  endFrame(): void {
    this.pressed_.clear()
  }

  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}
