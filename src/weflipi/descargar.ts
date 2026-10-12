// /descargar: the link to send to friends. Shows the app, a one-tap install where the browser
// allows it (Android Chrome), the exact steps otherwise (iPhone Safari), and a QR on computers.
import './hub.css'
import qrcode from 'qrcode-generator'
import { gameOfDay, today } from '../../server/weflipi-games.mjs'
import { CATALOG } from './catalog'
import { startCover } from './cover'
import { APK_URL, apkStepsHtml, canPrompt, iosGuideHtml, isInstalled, onInstallChange, platform, promptInstall, registerServiceWorker, stepsHtml } from './install'

const app = document.getElementById('app')!
const canvas = document.createElement('canvas')
canvas.className = 'cover'
canvas.setAttribute('aria-hidden', 'true')
document.body.prepend(canvas)
const games = Object.values(CATALOG)
startCover(canvas, games, Math.max(0, games.findIndex(g => g.id === gameOfDay(today()).id)), () => app.querySelector('.hero-space')?.getBoundingClientRect() ?? null)

let showSteps: '' | 'apk' | 'web' = ''

function qrSvg(text: string): string {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
}

function render(): void {
  const p = platform()
  const installed = isInstalled()
  // Android gets the real app (APK); iPhone and computers get the installable web app.
  const action = installed
    ? `<a class="btn primary big" href="/">▶ Abrir weflipi</a>`
    : p === 'android'
      ? `<a class="btn primary big pulse" href="${APK_URL}" download="weflipi.apk" data-apk>📲 Descargar gratis</a><small class="apk-note">App para Android · archivo APK · gratis</small>`
      : p === 'ios'
        ? `<a class="btn primary big pulse" href="#guia">📲 Añadir a mi iPhone</a><small class="apk-note">Gratis · 4 toques · sin App Store</small>`
        : `<button class="btn primary big pulse" data-install>📲 Descargar gratis</button>`
  const steps = showSteps === 'apk' ? apkStepsHtml() : stepsHtml()
  app.innerHTML = `
  <main class="page welcome download">
    <div class="hero">
      <h1 class="logo">we<span>flipi</span></h1>
      <p class="tagline">Un minijuego nuevo cada día.<br />Tú, tus amigos y una temporada que ganar.</p>
    </div>
    <div class="hero-space" aria-hidden="true"></div>
    <section class="card app-card">
      <div class="app-row">
        <img src="/icons/icon-192.png" alt="" width="76" height="76" />
        <div><h2>weflipi</h2><small>Juegos · Gratis</small><span class="by">Creado por nicco6482</span></div>
      </div>
      ${action}
      ${showSteps && !installed ? `<div class="steps-box">${steps}</div>` : ''}
      ${!installed && p === 'android' ? `<button class="link center" data-install>¿Sin descargar archivos? Instálala desde Chrome</button>` : ''}
      ${!installed && p === 'desktop' ? `<a class="link center" href="${APK_URL}" download="weflipi.apk">Descargar el APK para Android</a>` : ''}
      ${installed ? '' : `<a class="link center" href="/">o juega ahora en el navegador →</a>`}
    </section>
    ${
      p === 'ios' && !installed
        ? `<section class="card ios-card" id="guia"><div class="ig-title"><img src="/icons/apple-touch-icon.png" alt="" width="84" height="84" /><h2>weflipi en tu iPhone</h2><p class="muted">Apple no deja descargar apps fuera de la App Store, pero puedes tener weflipi en tu pantalla de inicio en 4 toques. Se abre a pantalla completa, directo al juego.</p></div>${iosGuideHtml()}</section>`
        : ''
    }
    ${
      p === 'desktop'
        ? `<section class="card qr-card"><div class="qr">${qrSvg(`${location.origin}/descargar`)}</div><div><h2>¿En el móvil?</h2><p class="muted">Escanea el código con la cámara y te llevará a esta misma página para instalarla.</p></div></section>`
        : ''
    }
    <section class="card features">
      <div><span>🎮</span><p><b>17 minijuegos</b> de un minuto: dardos, bolos, cálculo, cortar fruta…</p></div>
      <div><span>📅</span><p><b>Un reto nuevo cada día</b>, el mismo para todos. Intentos ilimitados.</p></div>
      <div><span>👥</span><p><b>Grupos con tus amigos</b>, podio diario y corona 👑 de la semana.</p></div>
    </section>
    <div class="shots">${['hoy', 'grupos', 'juegos'].map(s => `<img src="/screenshots/${s}.webp" alt="" loading="lazy" />`).join('')}</div>
    <footer>Creado por nicco6482</footer>
  </main>
  ${p === 'ios' && !installed ? '<div class="safari-pointer" aria-hidden="true"><span>Toca ⋯</span><b>⬇</b></div>' : ''}`
}

app.addEventListener('click', async e => {
  const target = e.target as HTMLElement
  if (target.closest('[data-apk]')) {
    // Let the download start, then explain how to open it.
    setTimeout(() => {
      showSteps = 'apk'
      render()
      app.querySelector('.steps-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
    return
  }
  if (!target.closest('[data-install]')) return
  if (canPrompt()) {
    if (await promptInstall()) render()
    return
  }
  showSteps = 'web'
  render()
  app.querySelector('.steps-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

registerServiceWorker()
onInstallChange(render)
render()
