// End-to-end smoke test for Helix Drift. Builds must already exist in dist/.
// It checks boot, daily play, rotation input, pause/settings, bilingual title boot and mobile HUD.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const errors = []

function cleanup() {
  try { server.kill('SIGTERM') } catch {}
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}

async function openGame(context) {
  const page = await context.newPage()
  page.on('console', message => {
    const text = message.text()
    if (message.type() === 'error' && !text.includes('Failed to load resource: the server responded with a status of 404 (Not Found)')) errors.push(text)
  })
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => {
    const offlineLeaderboard = response.url().includes('/api/leaderboards/')
    if (response.status() >= 400 && !offlineLeaderboard) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30_000 })
  await page.waitForFunction(() => window.__helix?.game)
  return page
}

try {
  await waitForServer()
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=swiftshader'] })

  const en = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' })
  const page = await openGame(en)
  await page.screenshot({ path: `${out}/01-title-en.png` })
  const englishTitle = await page.textContent('[data-i18n="title.name"]')
  if (!englishTitle?.includes('HELIX DRIFT')) throw new Error(`unexpected English title: ${englishTitle}`)

  await page.click('[data-action="daily"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  await page.waitForFunction(() => window.__helix.game.mode === 'playing')
  const phi0 = await page.evaluate(() => window.__helix.game.sim.phi)
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(260)
  await page.keyboard.up('KeyD')
  const phi1 = await page.evaluate(() => window.__helix.game.sim.phi)
  if (!(phi1 > phi0 + 0.1)) throw new Error(`rotation input did not move tower: ${phi0} -> ${phi1}`)
  await page.screenshot({ path: `${out}/02-daily-hud.png` })

  await page.keyboard.press('Escape')
  await page.waitForSelector('.screen-modal[data-screen="pause"].is-active')
  await page.click('.screen-modal[data-screen="pause"] [data-action="settings"]')
  await page.waitForSelector('.screen-modal[data-screen="settings"].is-active')
  await page.screenshot({ path: `${out}/03-settings.png` })
  await page.click('.screen-modal[data-screen="settings"] [data-action="closeModal"]')
  if ((await page.evaluate(() => window.__helix.game.mode)) !== 'paused') throw new Error('settings close resumed the run')
  await en.close()

  const es = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'es-ES' })
  const esPage = await openGame(es)
  const spanishDaily = await esPage.textContent('[data-i18n="title.daily"]')
  if (!spanishDaily?.includes('Torre del día')) throw new Error(`unexpected Spanish title: ${spanishDaily}`)
  await esPage.screenshot({ path: `${out}/04-title-es.png` })
  await es.close()

  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES' })
  const phonePage = await openGame(phone)
  await phonePage.tap('[data-action="daily"]')
  await phonePage.waitForSelector('[data-screen="hud"].is-active')
  await phonePage.screenshot({ path: `${out}/05-mobile-hud.png` })
  await phone.close()

  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  console.log(`smoke: OK — screenshots in ${out}/`)
} catch (error) {
  console.error(`smoke: FAIL — ${error?.stack ?? error}`)
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  cleanup()
}
