// In-browser playtest: a bot plays the real game through the touch-turn input path, then walks the
// results, share and leaderboard screens. Fails on console errors. Usage:
//   node scripts/playtest.mjs [url] [outDir]
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:3101/'
const out = process.argv[3] ?? '/tmp/shots'
mkdirSync(out, { recursive: true })
const args = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, channel: 'chrome' }))
const errors = []

async function open(opts, locale = 'es-ES', query = '') {
  const context = await browser.newContext({ locale, ...opts })
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  const page = await context.newPage()
  page.on('console', m => m.type() === 'error' && errors.push(`[${locale}] ${m.text()}`))
  page.on('pageerror', e => errors.push(`[${locale}] ${e}`))
  await page.goto(url + 'helix.html' + query)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30000 })
  await page.waitForTimeout(1200)
  return { context, page }
}

// Bot installed in the page: steers toward the current floor's gap and dodges hazards at landing.
const BOT = `(() => {
  const h = window.__helix
  const SA = Math.PI * 2 / 16
  const wrap = a => { a %= Math.PI * 2; return a < 0 ? a + Math.PI * 2 : a }
  const diff = (a, b) => { let d = wrap(a - b); if (d > Math.PI) d -= Math.PI * 2; return d }
  const tick = () => {
    const g = h.game, s = g.sim
    if (g.mode === 'playing' && s.floor < s.tower.floors.length) {
      const f = s.tower.floors[s.floor]
      const gaps = f.slots.filter(k => k === 'gap').length
      const d = diff(f.offset + gaps / 2 * SA, s.ballAngle)
      h.input.setTouchTurn(Math.abs(d) < 0.05 ? 0 : -Math.max(-1, Math.min(1, d / 0.3)))
    } else h.input.setTouchTurn(0)
    window.__bot = requestAnimationFrame(tick)
  }
  tick()
})()`

const state = page => page.evaluate(() => {
  const { game, ui } = window.__helix
  return { mode: game.mode, screen: ui.screen, modal: ui.modal, score: game.sim.score, floors: game.sim.floors, time: game.sim.time }
})

try {
  // ── Desktop, Chinese, with a challenge link ──────────────────────────
  const { page } = await open({ viewport: { width: 1440, height: 900 } }, 'es-ES', '?c=420&n=Mar%C3%ADa&d=2026-09-27')
  await page.screenshot({ path: `${out}/01-title-es.png` })
  // Press Space → start the daily tower.
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  let s = await state(page)
  if (s.mode !== 'playing' || s.screen !== 'hud') throw new Error(`space did not start: ${JSON.stringify(s)}`)
  // Keyboard rotation actually turns the tower.
  const phi0 = await page.evaluate(() => window.__helix.game.sim.phi)
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(250)
  await page.keyboard.up('KeyD')
  const phi1 = await page.evaluate(() => window.__helix.game.sim.phi)
  if (!(phi1 > phi0 + 0.3)) throw new Error(`D did not rotate: ${phi0} → ${phi1}`)
  // Mouse drag rotates too.
  await page.mouse.move(700, 500)
  await page.mouse.down()
  await page.mouse.move(560, 500, { steps: 6 })
  await page.mouse.up()
  const phi2 = await page.evaluate(() => window.__helix.game.sim.phi)
  if (!(phi2 < phi1 - 0.2)) throw new Error(`drag did not rotate: ${phi1} → ${phi2}`)
  await page.evaluate(BOT)
  const t0 = Date.now()
  let firstScoreMs = -1
  let shotMid = false
  while (Date.now() - t0 < 90000) {
    s = await state(page)
    if (firstScoreMs < 0 && s.score > 0) firstScoreMs = Date.now() - t0
    if (!shotMid && s.floors >= 6) {
      await page.screenshot({ path: `${out}/02-play.png` })
      shotMid = true
    }
    const smash = await page.evaluate(() => window.__helix.game.sim.smash)
    if (smash && !(await page.evaluate(() => window.__shotSmash))) {
      await page.evaluate(() => (window.__shotSmash = true))
      await page.screenshot({ path: `${out}/03-smash.png` })
    }
    if (s.mode === 'ended') break
    await page.waitForTimeout(120)
  }
  console.log('run 1', JSON.stringify(s), 'first score after', firstScoreMs, 'ms')
  await page.waitForSelector('[data-screen="results"].is-active', { timeout: 5000 })
  await page.waitForFunction(() => !document.querySelector('.results-online')?.textContent?.includes('Enviando…'), null, { timeout: 15000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/04-results.png` })
  console.log('online:', await page.textContent('.results-online'))
  // Share card.
  await page.click('[data-action="share"]')
  await page.waitForSelector('[data-screen="share"].is-active')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/05-share.png` })
  const link = await page.inputValue('.share-link')
  console.log('challenge link:', link)
  const dataUrl = await page.evaluate(async () => {
    const img = document.querySelector('.share-preview img')
    const blob = await (await fetch(img.src)).blob()
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob) })
  })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(`${out}/06-card.png`, Buffer.from(dataUrl.split(',')[1], 'base64'))
  await page.click('.modal-share [data-action="copy"]')
  await page.waitForTimeout(300)
  console.log('clipboard:', await page.evaluate(() => navigator.clipboard.readText().catch(e => String(e))))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  // Leaderboard.
  await page.click('.screen-results [data-action="board"]')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/07-board-today.png` })
  await page.click('[data-action="boardAll"]')
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/08-board-all.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  // Rename.
  await page.fill('.results-name input', 'Campeón')
  await page.press('.results-name input', 'Enter')
  await page.waitForTimeout(700)
  // Space restarts instantly.
  await page.keyboard.press('Space')
  await page.waitForTimeout(250)
  s = await state(page)
  if (s.mode !== 'playing') throw new Error(`space restart failed: ${JSON.stringify(s)}`)
  // Pause / resume.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/09-pause.png` })
  s = await state(page)
  if (s.mode !== 'paused') throw new Error('pause failed')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  // Open the challenge link in a fresh page to confirm the target is shown.
  const { page: p2 } = await open({ viewport: { width: 1280, height: 720 } }, 'en-US', new URL(link).search)
  await p2.screenshot({ path: `${out}/10-title-en-challenge.png` })
  console.log('challenge card (en):', await p2.textContent('.challenge-card'))
  await p2.keyboard.press('Space')
  await p2.waitForTimeout(1500)
  await p2.screenshot({ path: `${out}/11-hud-en-target.png` })
  // Settings modal.
  await p2.keyboard.press('Escape')
  await p2.waitForTimeout(200)
  await p2.click('.screen-modal[data-screen="pause"] [data-action="settings"]')
  await p2.waitForTimeout(400)
  await p2.screenshot({ path: `${out}/12-settings.png` })

  // ── Mobile landscape with touch ───────────────────────────────────────
  const { page: m } = await open({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'es-ES')
  await m.screenshot({ path: `${out}/13-mobile-title.png` })
  await m.tap('[data-action="daily"]')
  await m.waitForTimeout(600)
  const box = await m.locator('[data-touch="1"]').boundingBox()
  await m.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await m.evaluate(BOT)
  await m.waitForTimeout(2500)
  await m.screenshot({ path: `${out}/14-mobile-play.png` })
  await m.waitForFunction(() => window.__helix.game.mode === 'ended', null, { timeout: 90000 })
  await m.waitForSelector('[data-screen="results"].is-active', { timeout: 5000 })
  await m.waitForTimeout(1500)
  await m.screenshot({ path: `${out}/15-mobile-results.png` })
  await m.tap('.screen-results [data-action="share"]')
  await m.waitForTimeout(800)
  await m.screenshot({ path: `${out}/16-mobile-share.png` })
} catch (e) {
  errors.push(`FAILED: ${e.stack ?? e}`)
}
await browser.close()
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('playtest OK')
