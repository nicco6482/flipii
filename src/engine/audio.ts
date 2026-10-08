/**
 * Web Audio mixer with music and SFX buses. Browsers only allow audio after a user gesture, so
 * call `unlock()` from the first click/key press.
 *
 * Everything is synthesized: punchy SFX for bounces, passes and smashes, and an original
 * generative beat (kick, hats, bass, arpeggio) whose key follows the stage and whose intensity
 * follows the combo.
 */
export type Sfx = 'bounce' | 'pass' | 'smash' | 'smashOn' | 'near' | 'death' | 'stage' | 'win' | 'ui' | 'best' | 'start'

// Minor-pentatonic degrees in semitones.
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]
// One root per stage (semitones above A2 = 110 Hz).
const STAGE_ROOTS = [0, 5, 2, 7, 3, 10]
const hz = (semi: number) => 110 * Math.pow(2, semi / 12)

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private music: GainNode
  private sfx: GainNode
  private noise: AudioBuffer
  private musicOn = false
  private schedTimer = 0
  private nextBeat = 0
  private beat = 0
  /** 0 calm (title) · 1 playing · 2 smash mode. */
  intensity = 0
  stage = 0

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.music = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.music.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(comp).connect(this.ctx.destination)
    const len = this.ctx.sampleRate
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Volumes in 0..1. */
  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    this.music.gain.setTargetAtTime(muted ? 0 : music * 0.5, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfx * 0.85, t, 0.05)
  }

  private tone(freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0, bus: GainNode = this.sfx): void {
    const t = this.ctx.currentTime + delay
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(bus)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private hiss(dur: number, vol: number, from: number, to: number, delay = 0, type: BiquadFilterType = 'bandpass', bus: GainNode = this.sfx, at?: number): void {
    const t = at ?? this.ctx.currentTime + delay
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(from, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(to, 30), t + dur)
    f.Q.value = 0.9
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(bus)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.05)
  }

  /** `level` = chain length for passes, floor index for bounces. */
  play(name: Sfx, level = 0): void {
    if (this.ctx.state !== 'running') return
    const root = STAGE_ROOTS[this.stage % STAGE_ROOTS.length]
    switch (name) {
      case 'bounce': {
        const f = 330 + (level % 5) * 14
        this.tone(f, f * 0.55, 0.12, 'sine', 0.42)
        this.hiss(0.05, 0.12, 2400, 900)
        break
      }
      case 'pass': {
        const n = PENTA[Math.min(level, PENTA.length - 1)]
        const f = hz(root + 24 + n)
        this.tone(f, f * 1.02, 0.16, 'triangle', 0.3)
        this.tone(f * 2, f * 2, 0.1, 'sine', 0.12, 0.02)
        this.hiss(0.18, 0.1, 600, 3200, 0, 'bandpass')
        break
      }
      case 'smash':
        this.tone(140, 38, 0.42, 'sine', 0.9)
        this.tone(220, 60, 0.2, 'square', 0.18)
        this.hiss(0.5, 0.55, 5000, 200, 0, 'lowpass')
        this.hiss(0.12, 0.35, 8000, 3000, 0, 'highpass')
        break
      case 'smashOn':
        this.tone(220, 880, 0.35, 'sawtooth', 0.12)
        this.tone(330, 1320, 0.35, 'triangle', 0.14, 0.03)
        this.hiss(0.35, 0.12, 400, 6000, 0, 'bandpass')
        break
      case 'near':
        this.tone(1568, 1568, 0.12, 'triangle', 0.22)
        this.tone(2093, 2093, 0.22, 'sine', 0.18, 0.07)
        break
      case 'death':
        this.hiss(0.7, 0.6, 3000, 120, 0, 'lowpass')
        this.tone(300, 50, 0.6, 'sawtooth', 0.25)
        this.tone(90, 30, 0.5, 'sine', 0.6)
        break
      case 'stage':
        ;[0, 7, 12, 19, 24].forEach((s, i) => this.tone(hz(root + 24 + s), hz(root + 24 + s), 0.28, 'triangle', 0.22, i * 0.07))
        this.hiss(0.6, 0.12, 800, 7000, 0, 'bandpass')
        break
      case 'win':
        ;[0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(hz(24 + s), hz(24 + s), 0.4, 'triangle', 0.24, i * 0.09))
        this.tone(hz(12), hz(12), 1.2, 'sine', 0.3, 0.6)
        break
      case 'best':
        ;[12, 19, 24, 31].forEach((s, i) => this.tone(hz(root + 24 + s), hz(root + 24 + s), 0.16, 'sine', 0.16, i * 0.05))
        break
      case 'start':
        this.tone(hz(root + 24), hz(root + 36), 0.25, 'triangle', 0.2)
        break
      case 'ui':
        this.tone(760, 820, 0.05, 'triangle', 0.16)
        break
    }
  }

  /** Original generative beat, scheduled with a short look-ahead. */
  startMusic(): void {
    if (this.musicOn) return
    this.musicOn = true
    this.nextBeat = this.ctx.currentTime + 0.08
    this.beat = 0
    const bpm = 124
    const step = 60 / bpm / 2 // eighth notes
    const tick = () => {
      if (!this.musicOn) return
      while (this.nextBeat < this.ctx.currentTime + 0.18) {
        this.scheduleStep(this.beat, this.nextBeat, step)
        this.nextBeat += step
        this.beat += 1
      }
    }
    this.schedTimer = window.setInterval(tick, 40)
    tick()
  }

  private scheduleStep(i: number, t: number, step: number): void {
    const root = STAGE_ROOTS[this.stage % STAGE_ROOTS.length]
    const bar = Math.floor(i / 8)
    const pos = i % 8
    const calm = this.intensity === 0
    const d = Math.max(0, t - this.ctx.currentTime)
    // Kick on quarters (half-time when calm).
    if (pos % (calm ? 4 : 2) === 0) this.tone(120, 42, 0.22, 'sine', calm ? 0.35 : 0.6, d, this.music)
    // Off-beat hats.
    if (!calm && pos % 2 === 1) this.hiss(0.04, 0.12, 9000, 7000, 0, 'highpass', this.music, t)
    // Bass: root / fifth pattern that walks every two bars.
    const walk = [0, 0, 5, 3][Math.floor(bar / 2) % 4]
    if (pos === 0 || pos === 3 || pos === 6) {
      const f = hz(root + walk + (pos === 6 ? 7 : 0))
      this.tone(f, f, step * 1.6, 'triangle', calm ? 0.14 : 0.22, d, this.music)
    }
    // Arpeggio, denser in smash mode.
    const arpEvery = this.intensity >= 2 ? 1 : calm ? 4 : 2
    if (pos % arpEvery === 0) {
      const n = PENTA[(i * 3 + bar) % 7]
      const f = hz(root + walk + 24 + n)
      this.tone(f, f, step * 0.9, this.intensity >= 2 ? 'square' : 'sine', this.intensity >= 2 ? 0.05 : 0.07, d, this.music)
    }
  }

  stopMusic(): void {
    this.musicOn = false
    clearInterval(this.schedTimer)
  }
}
