// "Install weflipi" support shared by the hub and the /descargar page: registers the service
// worker, catches Chrome's install prompt, detects the platform and explains the iPhone steps.

/** Built by .github/workflows/android.yml; the URL never changes between builds. */
export const APK_URL = 'https://github.com/nicco6482/flipii/releases/download/android/weflipi.apk'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()

addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferred = e as InstallPrompt
  listeners.forEach(fn => fn())
})
addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach(fn => fn())
})

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined))
}

/** Re-render when the install state changes (prompt became available, app installed). */
export function onInstallChange(fn: () => void): void {
  listeners.add(fn)
}

export type Platform = 'ios' | 'android' | 'desktop'
export function platform(): Platform {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac with touch.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** iOS only lets Safari add web apps to the home screen. */
export const isIosNotSafari = () => platform() === 'ios' && /CriOS|FxiOS|EdgiOS|GSA|Instagram|FBAN|FBAV|WhatsApp/.test(navigator.userAgent)

/** Running inside the weflipi Android app (its WebView adds this to the user agent). */
export const isAndroidApp = () => /weflipi-android/.test(navigator.userAgent)

export function isInstalled(): boolean {
  return isAndroidApp() || matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** Opens Android's share sheet inside the app; returns false elsewhere. */
export function nativeShare(text: string): boolean {
  const bridge = (window as unknown as { WeflipiAndroid?: { share: (t: string) => void } }).WeflipiAndroid
  if (!bridge) return false
  bridge.share(text)
  return true
}

/** Starts the APK download (Android). */
export function downloadApk(): void {
  const a = document.createElement('a')
  a.href = APK_URL
  a.download = 'weflipi.apk'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** What to do once weflipi.apk is downloading. */
export const apkStepsHtml = () => `<ol class="steps">
      <li><b>1</b><span>Espera a que se descargue <b>weflipi.apk</b> y ábrelo (desde la notificación o desde <b>Descargas</b>).</span></li>
      <li><b>2</b><span>Si Android te avisa, pulsa <b>Ajustes</b> y activa <b>Permitir de esta fuente</b>. Vuelve atrás.</span></li>
      <li><b>3</b><span>Pulsa <b>Instalar</b> (si sale Play Protect: <b>Más detalles → Instalar de todas formas</b>) y luego <b>Abrir</b>. ¡Listo!</span></li>
    </ol>`

export const canPrompt = () => deferred !== null

/** Shows Chrome's native install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const d = deferred
  deferred = null
  await d.prompt()
  const choice = await d.userChoice
  listeners.forEach(fn => fn())
  return choice.outcome === 'accepted'
}

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
const PLUS_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'

/** Step-by-step instructions for the current platform, as HTML. */
export function stepsHtml(): string {
  const p = platform()
  if (p === 'ios') {
    if (isIosNotSafari())
      return `<ol class="steps"><li><b>1</b><span>Abre este enlace en <b>Safari</b> (en iPhone solo Safari puede instalar apps web). Copia el enlace y pégalo allí.</span></li></ol>`
    return `<ol class="steps">
      <li><b>1</b><span>Pulsa el botón <b>Compartir</b> <i class="ico">${SHARE_ICON}</i> de la barra de Safari.</span></li>
      <li><b>2</b><span>Baja y elige <b>Añadir a pantalla de inicio</b> <i class="ico">${PLUS_ICON}</i>.</span></li>
      <li><b>3</b><span>Pulsa <b>Añadir</b>. ¡Ya tienes weflipi con su icono!</span></li>
    </ol>`
  }
  if (p === 'android')
    return `<ol class="steps">
      <li><b>1</b><span>Abre este enlace en <b>Chrome</b>.</span></li>
      <li><b>2</b><span>Pulsa el menú <b>⋮</b> de arriba a la derecha.</span></li>
      <li><b>3</b><span>Elige <b>Instalar app</b> (o <b>Añadir a pantalla de inicio</b>) y confirma.</span></li>
    </ol>`
  return `<ol class="steps">
      <li><b>1</b><span>En el ordenador, ábrelo en <b>Chrome</b> o <b>Edge</b> y pulsa el icono de instalar ⊕ en la barra de direcciones.</span></li>
      <li><b>2</b><span>Para el móvil, escanea el código QR o mándate el enlace.</span></li>
    </ol>`
}

/**
 * Big illustrated iPhone guide for Safari on iOS 26 (Liquid Glass): drawn mock-ups of exactly
 * what to tap. Apple doesn't let a web page add itself to the home screen, so this is the most
 * direct path there is. Older iOS versions get a one-line hint.
 */
export function iosGuideHtml(): string {
  const back = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  return `
  <div class="ios-guide">
    <div class="ig-step">
      <div class="ig-head"><span class="ig-n">1</span><h3>Toca el botón <b>⋯</b></h3></div>
      <div class="ig-mock ig-glass">
        <span class="ig-round">${back}</span>
        <span class="ig-url">🔒 flipii.vercel.app</span>
        <span class="ig-round is-on"><b>⋯</b></span>
      </div>
      <p>Está abajo a la derecha, junto a la barra de la dirección.</p>
    </div>
    <div class="ig-step">
      <div class="ig-head"><span class="ig-n">2</span><h3>Toca <b>Compartir</b></h3></div>
      <div class="ig-mock ig-sheet">
        <div class="is-on"><span>Compartir</span><i>${SHARE_ICON}</i></div>
        <div><span>Añadir a favoritos</span><i>☆</i></div>
        <div><span>Buscar en la página</span><i>⌕</i></div>
      </div>
    </div>
    <div class="ig-step">
      <div class="ig-head"><span class="ig-n">3</span><h3>Toca <b>Añadir a pantalla de inicio</b></h3></div>
      <div class="ig-mock ig-sheet">
        <div><span>Copiar</span><i>⧉</i></div>
        <div><span>Añadir a la lista de lectura</span><i>👓</i></div>
        <div class="is-on"><span>Añadir a pantalla de inicio</span><i>${PLUS_ICON}</i></div>
      </div>
      <p>Desliza hacia abajo en el menú de Compartir hasta encontrarlo.</p>
    </div>
    <div class="ig-step">
      <div class="ig-head"><span class="ig-n">4</span><h3>Deja <b>Abrir como app web</b> y toca <b>Añadir</b></h3></div>
      <div class="ig-mock ig-dialog">
        <div class="ig-dialog-top"><span>Cancelar</span><b>Añadir a inicio</b><span class="ig-add is-on">Añadir</span></div>
        <div class="ig-dialog-app"><img src="/icons/icon-192.png" alt="" /><div><b>weflipi</b><small>flipii.vercel.app</small></div></div>
        <div class="ig-dialog-toggle"><span>Abrir como app web</span><i class="ig-switch"></i></div>
      </div>
      <p>¡Listo! weflipi aparece en tu pantalla de inicio y se abre a pantalla completa, como una app.</p>
    </div>
    <p class="ig-whatsapp">💬 <b>¿Lo has abierto desde WhatsApp o Instagram?</b> Primero ábrelo en Safari: <b>⋯ → Abrir en Safari</b> (o la brújula 🧭). Desde ahí ya se puede añadir.</p>
    <p class="ig-old">📱 ¿iPhone con iOS 18 o anterior? Pulsa el botón <b>Compartir</b> <i class="ico">${SHARE_ICON}</i> de la barra de abajo y sigue desde el paso 3.</p>
  </div>`
}

/** Full-screen version of the guide, for the hub's install buttons on iPhone. */
export function showIosGuide(): void {
  const wrap = document.createElement('div')
  wrap.className = 'ios-overlay'
  wrap.innerHTML = `<div class="ios-overlay-inner">
    <button class="icon-btn" data-close aria-label="Cerrar">✕</button>
    <div class="ig-title"><img src="/icons/icon-192.png" alt="" width="72" height="72" /><h2>Pon weflipi en tu iPhone</h2><p class="muted">4 toques y la tendrás con su icono, como una app.</p></div>
    ${iosGuideHtml()}
    <button class="btn primary big" data-close>¡Entendido!</button>
  </div>
  <div class="safari-pointer" aria-hidden="true"><span>Toca ⋯</span><b>⬇</b></div>`
  document.body.appendChild(wrap)
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => wrap.remove()))
}
