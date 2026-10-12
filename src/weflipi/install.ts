// "Install weflipi" support shared by the hub and the /descargar page: registers the service
// worker, catches Chrome's install prompt, detects the platform and explains the iPhone steps.

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

export function isInstalled(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

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
