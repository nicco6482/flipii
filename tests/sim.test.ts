import { describe, expect, it } from 'vitest'
import { TOTAL_FLOORS, checkRun } from '../server/helix-rules.mjs'
import { SLOT_ANGLE, angleDiff, dailySeed, generateTower, probe, type Tower } from '../src/game/level'
import { BALL_RADIUS, GRAVITY, ROT_SPEED, Sim, floorY } from '../src/game/sim'

type Skill = { name: string; delay: number; care: number; speed: number; aimError: number }
const NOVICE: Skill = { name: 'novice', delay: 0.22, care: 0.55, speed: 0.75, aimError: 0.25 }
const REGULAR: Skill = { name: 'regular', delay: 0.14, care: 0.85, speed: 0.9, aimError: 0.12 }
const EXPERT: Skill = { name: 'expert', delay: 0.06, care: 0.99, speed: 1, aimError: 0.04 }

function rngFor(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return a / 4294967296
  }
}

/** Heuristic player: aims for the gap, avoids landing on hazards it notices in time. */
function play(tower: Tower, skill: Skill, seed: number) {
  const sim = new Sim(tower)
  const r = rngFor(seed)
  const dt = 1 / 60
  const history: number[] = []
  let firstScoreAt = -1
  let aimOffset = 0
  let aimFloor = -1
  let cause = ''
  while (!sim.over && sim.time < 300) {
    const view = Math.max(0, history.length - Math.round(skill.delay / dt))
    void view
    if (sim.floor !== aimFloor) {
      aimFloor = sim.floor
      aimOffset = (r() - 0.5) * skill.aimError * 2
    }
    let turn = 0
    if (sim.floor < TOTAL_FLOORS) {
      const spec = tower.floors[sim.floor]
      const gapSlots = spec.slots.filter(s => s === 'gap').length
      const gapCenter = spec.offset + (gapSlots / 2) * SLOT_ANGLE + aimOffset
      const diff = angleDiff(gapCenter, sim.ballAngle)
      // Ball angle = −phi, so turning positive moves the ball angle negative.
      turn = Math.abs(diff) < 0.05 ? 0 : -Math.max(-1, Math.min(1, diff / (0.25 + skill.delay * 2))) * skill.speed
      // Hazard check on the predicted landing spot.
      const top = floorY(sim.floor)
      const h = sim.y - BALL_RADIUS - top
      const disc = sim.vy * sim.vy + 2 * GRAVITY * h
      const tc = (sim.vy + Math.sqrt(Math.max(0, disc))) / GRAVITY
      if (tc < 0.35 && r() < skill.care) {
        const options = [turn, 0, -turn].filter((v, i, a) => a.indexOf(v) === i)
        for (const o of options) {
          const predicted = sim.ballAngle - o * ROT_SPEED * Math.min(tc, 0.3)
          const p = probe(spec, predicted, sim.time + tc)
          if (p.kind === 'safe' || p.kind === 'gap') {
            turn = o
            break
          }
        }
      }
    }
    history.push(turn)
    const delayed = history[Math.max(0, history.length - 1 - Math.round(skill.delay / dt))]
    for (const e of sim.step(dt, delayed, 0)) if (e.type === 'death') cause = `${e.cause}@s${tower.floors[e.floor].stage}`
    if (firstScoreAt < 0 && sim.score > 0) firstScoreAt = sim.time
  }
  return { cause, score: sim.score, floors: sim.floors, time: sim.time, over: sim.over, firstScoreAt, bestChain: sim.bestChain, smashes: sim.smashes }
}

describe('tower generation', () => {
  it('is deterministic per seed and differs across days', () => {
    const a = generateTower(dailySeed('2026-09-27'))
    const b = generateTower(dailySeed('2026-09-27'))
    const c = generateTower(dailySeed('2026-09-28'))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
    expect(a.floors.length).toBe(TOTAL_FLOORS)
  })
  it('always leaves a gap and keeps the first floors hazard-free', () => {
    for (let s = 0; s < 50; s += 1) {
      const t = generateTower(s * 7919)
      for (const f of t.floors) expect(f.slots.includes('gap')).toBe(true)
      for (const f of t.floors.slice(0, 3)) expect(f.slots.some(k => k === 'danger' || k === 'blink') || !!f.sweeper).toBe(false)
    }
  })
  it('ramps difficulty: fewer gap slots and more hazards later', () => {
    const t = generateTower(12345)
    const hazards = (i: number) => t.floors[i].slots.filter(k => k === 'danger' || k === 'blink').length
    const gaps = (i: number) => t.floors[i].slots.filter(k => k === 'gap').length
    const early = t.floors.slice(0, 10).reduce((n, f) => n + hazards(f.index), 0)
    const late = t.floors.slice(-10).reduce((n, f) => n + hazards(f.index), 0)
    expect(late).toBeGreaterThan(early * 2)
    expect(gaps(0)).toBeGreaterThan(gaps(TOTAL_FLOORS - 1))
    expect(t.floors.some(f => f.sweeper)).toBe(true)
    expect(t.floors.some(f => f.blink)).toBe(true)
  })
})

describe('simulated players', () => {
  const report: string[] = []
  for (const skill of [NOVICE, REGULAR, EXPERT]) {
    it(`${skill.name}: every run passes server plausibility checks`, () => {
      const runs = []
      for (let s = 0; s < 60; s += 1) {
        const tower = generateTower(dailySeed(`2026-10-${String((s % 28) + 1).padStart(2, '0')}`) ^ (s * 2654435761))
        const res = play(tower, skill, s + 1)
        runs.push(res)
        const verdict = checkRun({ score: res.score, durationMs: Math.floor(res.time * 1000), floors: res.floors })
        // Runs shorter than a second are never submitted by the client.
        if (res.time >= 1) expect(verdict, JSON.stringify(res)).toBeNull()
      }
      const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
      const scores = runs.map(r => r.score)
      const first = runs.map(r => r.firstScoreAt).filter(t => t >= 0)
      report.push(
        `${skill.name.padEnd(8)} median score ${med(scores)} · max ${Math.max(...scores)} · median floors ${med(runs.map(r => r.floors))} · median time ${med(runs.map(r => r.time)).toFixed(1)}s · wins ${runs.filter(r => r.over === 'won').length}/60 · first score median ${med(first).toFixed(1)}s · max chain ${Math.max(...runs.map(r => r.bestChain))} · smashes/run ${(runs.reduce((n, r) => n + r.smashes, 0) / 60).toFixed(1)}\n    deaths ${Object.entries(runs.reduce((m, r) => ((m[r.cause] = (m[r.cause] ?? 0) + 1), m), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`,
      )
      if (skill === NOVICE) expect(med(first)).toBeLessThan(10)
    })
  }
  it('prints the difficulty report', () => {
    console.log(`\n${report.join('\n')}`)
  })
})
