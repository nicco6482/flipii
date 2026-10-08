// Capture smash-mode and stage-change frames from practice runs driven by a gap-seeking bot.
// Usage: node scripts/capture-fx.mjs [url] [outDir]
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:3101/'
const out = process.argv[3] ?? '/tmp/fx'
mkdirSync(out, { recursive: true })
const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' })).newPage()
const errs = []
p.on('pageerror', e => errs.push(String(e)))
p.on('console', m => m.type() === 'error' && errs.push(m.text()))
await p.goto(url)
await p.waitForSelector('[data-screen="title"].is-active')
await p.waitForTimeout(800)
await p.evaluate(() => {
  const h = window.__helix
  const SA = (Math.PI * 2) / 16
  const diff = (a, b) => {
    let d = (a - b) % (Math.PI * 2)
    if (d < 0) d += Math.PI * 2
    return d > Math.PI ? d - Math.PI * 2 : d
  }
  const tick = () => {
    const g = h.game
    const s = g.sim
    if (g.mode === 'playing' && s.floor < s.tower.floors.length) {
      const f = s.tower.floors[s.floor]
      const n = f.slots.filter(k => k === 'gap').length
      const d = diff(f.offset + (n / 2) * SA, s.ballAngle)
      h.input.setTouchTurn(Math.abs(d) < 0.04 ? 0 : -Math.max(-1, Math.min(1, d / 0.25)))
    }
    requestAnimationFrame(tick)
  }
  tick()
})
let smashShots = 0
let lastStage = 0
for (let run = 0; run < 6 && (smashShots < 2 || lastStage < 1); run += 1) {
  await p.evaluate(() => {
    const h = window.__helix
    h.game.start('practice', (Math.random() * 2 ** 32) >>> 0, '')
    h.ui.show('hud')
  })
  const t0 = Date.now()
  while (Date.now() - t0 < 45000) {
    const s = await p.evaluate(() => ({ mode: window.__helix.game.mode, smash: window.__helix.game.sim.smash, stage: window.__helix.game.sim.stage }))
    if (s.smash && smashShots < 2) {
      await p.waitForTimeout(smashShots ? 250 : 60)
      await p.screenshot({ path: `${out}/smash-${smashShots++}.png` })
    }
    if (s.stage > lastStage) {
      lastStage = s.stage
      await p.waitForTimeout(350)
      await p.screenshot({ path: `${out}/stage-${s.stage}.png` })
    }
    if (s.mode === 'ended') break
    await p.waitForTimeout(40)
  }
}
console.log(JSON.stringify({ smashShots, lastStage, errs }))
await b.close()
process.exit(errs.length ? 1 : 0)
