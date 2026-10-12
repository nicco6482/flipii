// weflipi app shell: five tabs (Hoy, Grupos, Juegos, Ranking, Perfil), the game intro → countdown →
// play → results flow, and the animated cover behind everything.
import './hub.css'
import { AVATARS, COLORS, daySeed, defaultLook, gameById, gameOfDay, isBetter, msUntilNextDay, PLACE_POINTS, today, type GameId } from '../../server/weflipi-games.mjs'
import * as api from './api'
import { CATALOG } from './catalog'
import { startCover } from './cover'
import { mulberry, muted, run, setMuted, sfx } from './engine'
import { canPrompt, isInstalled, onInstallChange, platform, promptInstall, registerServiceWorker, stepsHtml } from './install'

const AUTHOR = 'nicco6482'
const TABS = [
  { id: 'hoy', icon: '🏠', label: 'Hoy' },
  { id: 'grupos', icon: '👥', label: 'Grupos' },
  { id: 'juegos', icon: '🎮', label: 'Juegos' },
  { id: 'ranking', icon: '🌍', label: 'Ranking' },
  { id: 'perfil', icon: '👤', label: 'Perfil' },
] as const
type Tab = (typeof TABS)[number]['id']

const app = document.getElementById('app')!
const coverCanvas = document.createElement('canvas')
coverCanvas.className = 'cover'
coverCanvas.setAttribute('aria-hidden', 'true')
document.body.prepend(coverCanvas)
const coverGames = Object.values(CATALOG)
const cover = startCover(coverCanvas, coverGames, Math.max(0, coverGames.findIndex(x => x.id === gameOfDay(today()).id)), () => app.querySelector('.hero-space')?.getBoundingClientRect() ?? null)
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

function hideSplash(): void {
  const el = document.getElementById('splash')
  if (!el) return
  el.style.opacity = '0'
  setTimeout(() => el.remove(), 400)
}

type View = {
  tab: Tab
  state: api.State | null
  error: string
  errorDetail: string
  group: api.Group | null
  groupError: string
  groupTab: 'hoy' | 'temporada'
  selected: string
  global: api.Global | null
  globalError: string
}
const view: View = { tab: tabFromHash(), state: null, error: '', errorDetail: '', group: null, groupError: '', groupTab: 'hoy', selected: '', global: null, globalError: '' }
let deadline = Date.now() + msUntilNextDay()
let stopGame: (() => void) | null = null
let welcome = false

function tabFromHash(): Tab {
  const h = location.hash.slice(1)
  return (TABS.find(t => t.id === h)?.id ?? 'hoy') as Tab
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? ''
    } catch {
      return ''
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private mode */
    }
  },
}
view.selected = store.get('weflipi.group')
function remember(code: string): void {
  view.selected = code
  store.set('weflipi.group', code)
}

const day = () => view.state?.day ?? today()
const todayGame = (): GameId => view.state?.game ?? gameOfDay(day()).id
function me(): api.Me | null {
  if (view.state?.me) return view.state.me
  const p = api.savedPlayer()
  if (p) return { id: p.id, name: p.name, avatar: p.avatar ?? defaultLook(p.id).avatar, color: p.color ?? defaultLook(p.id).color }
  const name = api.pendingName()
  return name ? { id: '', name, avatar: store.get('weflipi.avatar') || '😎', color: store.get('weflipi.color') || COLORS[0] } : null
}

// ─── Little building blocks ─────────────────────────────────────────────

const ava = (p: { avatar: string; color: string }, size: 'sm' | 'md' | 'lg' | 'xl' = 'md', extra = '') => `<span class="ava ava-${size} ${extra}" style="--c:${p.color}">${p.avatar}</span>`
const medal = (place: number) => (place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}º`)
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })

function clockParts(ms: number): [string, string, string] {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return [p(Math.floor(s / 3600)), p(Math.floor((s % 3600) / 60)), p(s % 60)]
}
const clockHtml = (ms: number) => clockParts(ms).map(x => `<b>${x}</b>`).join('<i>:</i>')

function toast(msg: string): void {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => el.classList.add('is-out'), 2200)
  setTimeout(() => el.remove(), 2600)
}

function buzz(ms = 12): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}

function modal(title: string, body: string, onSubmit: (form: FormData) => Promise<string | null> | string | null, submitLabel = 'Aceptar'): void {
  const wrap = document.createElement('div')
  wrap.className = 'sheet-wrap'
  wrap.innerHTML = `<form class="sheet"><span class="grab"></span><h2>${esc(title)}</h2>${body}<p class="form-error" hidden></p><div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">${esc(submitLabel)}</button></div></form>`
  document.body.appendChild(wrap)
  const form = wrap.querySelector('form')!
  const err = wrap.querySelector<HTMLElement>('.form-error')!
  const close = () => {
    wrap.classList.add('is-out')
    setTimeout(() => wrap.remove(), 200)
  }
  wrap.addEventListener('pointerdown', e => e.target === wrap && close())
  wrap.querySelector('[data-close]')!.addEventListener('click', close)
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const btn = form.querySelector<HTMLButtonElement>('button.primary')!
    btn.disabled = true
    const problem = await onSubmit(new FormData(form))
    btn.disabled = false
    if (problem) {
      err.hidden = false
      err.textContent = problem
    } else close()
  })
  form.querySelector<HTMLInputElement>('input:not([readonly])')?.focus()
}

// ─── Welcome ────────────────────────────────────────────────────────────

function renderWelcome(): void {
  welcome = true
  hideSplash()
  let avatar = AVATARS[Math.floor(Math.random() * 8)]
  app.innerHTML = `
  <main class="page welcome">
    <div class="hero">
      <h1 class="logo">we<span>flipi</span></h1>
      <p class="tagline">Un minijuego nuevo cada día.<br />Tú, tus amigos y una temporada que ganar.</p>
    </div>
    <div class="hero-space" aria-hidden="true"></div>
    <form class="card" data-el="welcome">
      <label for="name">¿Cómo te llamas?</label>
      <input id="name" name="name" maxlength="16" autocomplete="nickname" placeholder="Tu apodo" required />
      <div class="ava-row">${AVATARS.slice(0, 8).map(a => `<button type="button" class="ava-pick ${a === avatar ? 'is-on' : ''}" data-ava="${a}">${a}</button>`).join('')}</div>
      <button class="btn primary big">¡A jugar!</button>
      <p class="form-error" hidden></p>
    </form>
    <footer>Creado por ${esc(AUTHOR)}</footer>
  </main>`
  const form = app.querySelector<HTMLFormElement>('[data-el="welcome"]')!
  form.querySelectorAll<HTMLButtonElement>('[data-ava]').forEach(b =>
    b.addEventListener('click', () => {
      avatar = b.dataset.ava!
      form.querySelectorAll('[data-ava]').forEach(x => x.classList.toggle('is-on', x === b))
      buzz()
    }),
  )
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) return
    form.querySelector<HTMLButtonElement>('button.primary')!.disabled = true
    store.set('weflipi.avatar', avatar)
    const r = await api.register(name)
    if (r.ok) await api.updateProfile({ avatar })
    else if (r.error !== 'offline' && r.error !== 'no_database' && r.error !== 'database_error') {
      form.querySelector<HTMLButtonElement>('button.primary')!.disabled = false
      const err = form.querySelector<HTMLElement>('.form-error')!
      err.hidden = false
      err.textContent = api.errorText(r.error)
      return
    }
    welcome = false
    await refresh()
  })
}

// ─── Shell ──────────────────────────────────────────────────────────────

function notice(): string {
  if (!view.error) return ''
  const text =
    view.error === 'no_database'
      ? '<b>Los grupos aún no están activos.</b> Falta conectar la base de datos. Puedes jugar igual.'
      : view.error === 'offline'
        ? '<b>Sin conexión.</b> Puedes jugar igual; tus récords se guardan en este móvil.'
        : `<b>${esc(api.errorText(view.error))}</b> Puedes jugar igual.${view.errorDetail ? `<br /><small>${esc(view.errorDetail)}</small>` : ''}`
  return `<div class="card notice">${text}</div>`
}

function render(): void {
  if (welcome || stopGame) return
  hideSplash()
  const m = me()
  const streak = view.state?.stats?.streak ?? 0
  const screens: Record<Tab, () => string> = { hoy: screenHoy, grupos: screenGrupos, juegos: screenJuegos, ranking: screenRanking, perfil: screenPerfil }
  app.innerHTML = `
  <header class="appbar">
    <button class="me-chip" data-action="tab" data-tab="perfil">${m ? ava(m, 'sm') : ''}<span>${esc(m?.name ?? 'Jugador')}</span></button>
    <div class="appbar-right">
      <span class="pill streak ${view.state?.stats?.playedToday ? 'is-hot' : ''}" title="Días seguidos jugando">🔥 ${streak}</span>
      <button class="icon-btn" data-action="sound" aria-label="Sonido">${muted() ? '🔇' : '🔊'}</button>
    </div>
  </header>
  <main class="page screen-${view.tab}">${screens[view.tab]()}</main>
  <nav class="tabbar">${TABS.map(t => `<button class="${t.id === view.tab ? 'is-on' : ''}" data-action="tab" data-tab="${t.id}"><span>${t.icon}</span><small>${t.label}</small></button>`).join('')}</nav>`
}

function go(tab: Tab): void {
  if (view.tab === tab) {
    scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  view.tab = tab
  history.replaceState(null, '', `#${tab}`)
  scrollTo({ top: 0 })
  render()
  void loadForTab()
}

async function loadForTab(): Promise<void> {
  if ((view.tab === 'hoy' || view.tab === 'grupos') && view.selected) await loadGroup(view.selected)
  if (view.tab === 'ranking') await loadGlobal()
}

// ─── Hoy ────────────────────────────────────────────────────────────────

function screenHoy(): string {
  const g = CATALOG[todayGame()]
  const best = view.state?.best ?? api.localBest(day(), g.id, null, (a, b) => isBetter(g.id, a, b))
  const plays = view.state?.plays ?? 0
  const groups = view.state?.groups ?? []
  return `
    <div class="hero">
      <h1 class="logo">we<span>flipi</span></h1>
      <p class="tagline">Un minijuego nuevo cada día.<br />Tú, tus amigos y una temporada que ganar.</p>
    </div>
    <div class="hero-space" aria-hidden="true"></div>
    ${notice()}
    ${installBanner()}
    <section class="card today" style="--accent:${g.color}">
      <div class="today-top"><span class="eyebrow">⚔️ Reto de hoy</span><span class="countdown" data-el="timer">${clockHtml(deadline - Date.now())}</span></div>
      <div class="today-game"><span class="big-emoji">${g.emoji}</span><div><h2>${esc(g.name)}</h2><p>${esc(g.how)}</p></div></div>
      <div class="stat-row">
        <div><small>Tu mejor</small><b>${best === null ? '—' : esc(g.unit(best))}</b></div>
        <div><small>Partidas</small><b>${plays}</b></div>
        <div><small>Gana</small><b>${gameById(g.id)!.dir === 'asc' ? '⬇ menos' : '⬆ más'}</b></div>
      </div>
      <button class="btn primary big pulse" data-action="intro" data-game="${g.id}">▶ ${best === null ? 'JUGAR' : 'MEJORAR'}</button>
      <p class="hint">Intentos ilimitados hasta medianoche. Cuenta tu mejor partida.</p>
    </section>
    ${groups.length ? groupSnippet() : `
    <section class="card cta">
      <span class="big-emoji">👥</span>
      <h2>Juega con tus amigos</h2>
      <p class="muted">Crea un grupo, pásales el enlace y competid cada día por la corona de la semana.</p>
      <div class="row"><button class="btn" data-action="join">Tengo un código</button><button class="btn primary" data-action="create">Crear grupo</button></div>
    </section>`}
    <footer>Creado por ${esc(AUTHOR)}</footer>`
}

function groupSnippet(): string {
  const gr = view.group?.code === view.selected ? view.group : null
  const name = view.state?.groups.find(x => x.code === view.selected)?.name ?? ''
  if (!gr) return `<section class="card"><div class="section-head"><h2>${esc(name)}</h2></div><p class="muted">Cargando…</p></section>`
  const game = CATALOG[gr.game]
  const leader = gr.season.table[0]
  return `
    <section class="card snippet">
      <div class="section-head"><h2>${esc(gr.name)}</h2><button class="link" data-action="tab" data-tab="grupos">Ver grupo →</button></div>
      ${gr.today.length ? podium(gr.today.slice(0, 3), r => game.unit(r.score), leader?.id) : `<p class="muted">Nadie ha jugado hoy todavía. ¡Sé el primero!</p>`}
      ${leader ? `<div class="crown-line">👑 <b>${esc(leader.name)}</b> lidera la semana con ${leader.points} pts</div>` : ''}
    </section>`
}

/** Top three on pedestals: 2nd · 1st · 3rd. */
function podium<T extends api.Look & { id: string; place: number }>(rows: T[], label: (r: T) => string, crownId?: string): string {
  const order = [rows[1], rows[0], rows[2]]
  const myId = me()?.id
  return `<div class="podium">${order
    .map((r, i) => {
      if (!r) return '<div class="step empty"></div>'
      const rank = [2, 1, 3][i]
      return `<div class="step step-${rank} ${r.id === myId ? 'is-me' : ''}">
        <div class="step-ava">${r.id === crownId ? '<span class="crown">👑</span>' : ''}${ava(r, rank === 1 ? 'lg' : 'md')}</div>
        <b class="step-name">${esc(r.name)}</b><small>${esc(label(r))}</small>
        <div class="block"><span>${r.place}</span></div>
      </div>`
    })
    .join('')}</div>`
}

// ─── Install ────────────────────────────────────────────────────────────

const DOWNLOAD_URL = () => `${location.origin}/descargar`

function installBanner(): string {
  if (isInstalled() || store.get('weflipi.installHidden') === '1') return ''
  return `
    <section class="card install-banner">
      <img src="/icons/icon-192.png" alt="" width="52" height="52" />
      <div><b>Instala weflipi</b><small>Tenla en tu pantalla de inicio como una app. Gratis.</small></div>
      <button class="btn primary small" data-action="install">${canPrompt() ? 'Instalar' : 'Cómo'}</button>
      <button class="x" data-action="install-hide" aria-label="Ocultar">✕</button>
    </section>`
}

async function install(): Promise<void> {
  if (canPrompt()) {
    if (await promptInstall()) toast('¡weflipi instalada! Búscala en tu pantalla de inicio')
    return
  }
  const wrap = document.createElement('div')
  wrap.className = 'sheet-wrap'
  const p = platform()
  wrap.innerHTML = `<div class="sheet"><span class="grab"></span>
    <div class="install-head"><img src="/icons/icon-192.png" alt="" width="64" height="64" /><div><h2>Instala weflipi</h2><p class="muted">${p === 'ios' ? 'En iPhone se instala desde Safari en 3 pasos:' : p === 'android' ? 'En Android se instala desde Chrome:' : 'Así se instala:'}</p></div></div>
    ${stepsHtml()}
    <button class="btn primary" data-close>Entendido</button></div>`
  document.body.appendChild(wrap)
  const close = () => wrap.remove()
  wrap.addEventListener('pointerdown', e => e.target === wrap && close())
  wrap.querySelector('[data-close]')!.addEventListener('click', close)
}

async function shareApp(): Promise<void> {
  const url = DOWNLOAD_URL()
  const msg = '¡Descárgate weflipi! Un minijuego nuevo cada día para picarnos entre amigos 🎮'
  if (navigator.share) {
    try {
      await navigator.share({ title: 'weflipi', text: msg, url })
      return
    } catch {
      /* cancelled: copy instead */
    }
  }
  try {
    await navigator.clipboard.writeText(`${msg} ${url}`)
    toast('Enlace de descarga copiado')
  } catch {
    toast(url)
  }
}

// ─── Grupos ─────────────────────────────────────────────────────────────

function screenGrupos(): string {
  const groups = view.state?.groups ?? []
  return `
    <div class="screen-head"><h1>Grupos</h1><div class="row"><button class="btn small" data-action="join">Unirme</button><button class="btn small primary" data-action="create">+ Crear</button></div></div>
    ${notice()}
    ${
      groups.length
        ? `<div class="chips">${groups.map(x => `<button class="chip ${x.code === view.selected ? 'is-on' : ''}" data-action="group" data-code="${x.code}">${esc(x.name)} <small>${x.members}</small></button>`).join('')}</div>${groupDetail()}`
        : `<section class="card cta"><span class="big-emoji">🏆</span><h2>Aún no tienes grupo</h2><p class="muted">Crea uno con tus amigos o únete con el código de 6 letras que te hayan pasado.</p><div class="row"><button class="btn" data-action="join">Unirme</button><button class="btn primary" data-action="create">Crear grupo</button></div></section>`
    }`
}

function groupDetail(): string {
  if (view.groupError) return `<section class="card"><p class="form-error">${esc(api.errorText(view.groupError))}</p></section>`
  const gr = view.group
  if (!gr || gr.code !== view.selected) return `<section class="card"><p class="muted">Cargando grupo…</p></section>`
  const leader = gr.season.table[0]
  return `
    <section class="card group-card">
      <div class="group-top">
        <div><h2>${esc(gr.name)}</h2><button class="code-chip" data-action="copy-code">Código <b>${esc(gr.code)}</b> ⧉</button></div>
        <button class="icon-btn" data-action="leave" aria-label="Salir del grupo">⋯</button>
      </div>
      <div class="ava-stack">${gr.members.slice(0, 8).map(m => ava(m, 'sm')).join('')}${gr.members.length > 8 ? `<span class="more">+${gr.members.length - 8}</span>` : ''}<span class="muted small">${gr.members.length} ${gr.members.length === 1 ? 'jugador' : 'jugadores'}</span></div>
      <button class="btn primary" data-action="invite">📨 Invitar amigos</button>
    </section>
    <div class="segmented"><button class="${view.groupTab === 'hoy' ? 'is-on' : ''}" data-action="gtab" data-v="hoy">Hoy</button><button class="${view.groupTab === 'temporada' ? 'is-on' : ''}" data-action="gtab" data-v="temporada">Temporada</button></div>
    ${view.groupTab === 'hoy' ? groupToday(gr, leader?.id) : groupSeason(gr)}`
}

function rankRow(r: api.Look & { id: string; place: number }, right: string, sub = '', crownId?: string): string {
  return `<li class="${r.id === me()?.id ? 'is-me' : ''}"><span class="place">${medal(r.place)}</span>${ava(r, 'sm')}<span class="name">${esc(r.name)}${r.id === crownId ? ' 👑' : ''}${sub ? `<small>${sub}</small>` : ''}</span><b>${right}</b></li>`
}

function groupToday(gr: api.Group, crownId?: string): string {
  const game = CATALOG[gr.game]
  const played = new Set(gr.today.map(r => r.id))
  const pending = gr.members.filter(m => !played.has(m.id))
  const plays = Object.fromEntries(gr.members.map(m => [m.id, m.playsToday]))
  const yGame = CATALOG[gr.yesterday.game]
  const yWin = gr.yesterday.ranking[0]
  return `
    <section class="card">
      <div class="section-head"><h2>${game.emoji} ${esc(game.name)}</h2><span class="countdown small" data-el="timer">${clockHtml(deadline - Date.now())}</span></div>
      ${gr.today.length ? podium(gr.today.slice(0, 3), r => game.unit(r.score), crownId) : '<p class="muted">Nadie ha jugado hoy. ¡Estrénalo tú!</p>'}
      ${gr.today.length > 3 ? `<ol class="ranking">${gr.today.slice(3).map(r => rankRow(r, esc(game.unit(r.score)), `${plays[r.id] ?? 0} partidas`, crownId)).join('')}</ol>` : ''}
      ${pending.length ? `<h4>Sin jugar todavía</h4><div class="pending">${pending.map(m => `<span>${ava(m, 'sm')}${esc(m.name)}</span>`).join('')}</div>` : ''}
      <button class="btn primary" data-action="intro" data-game="${gr.game}">▶ Jugar ahora</button>
    </section>
    ${yWin ? `<section class="card fact">🏅 Ayer (${yGame.emoji} ${esc(yGame.name)}) ganó <b>${esc(yWin.name)}</b> con ${esc(yGame.unit(yWin.score))}</section>` : ''}`
}

function groupSeason(gr: api.Group): string {
  const table = gr.season.table
  const leader = table[0]
  const lastChamp = gr.lastSeason.table[0]
  const byDay = gr.season.days
  // Place grid: one row per player, one cell per day of the week.
  const cells = (id: string) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = byDay[i]
      if (!d) return '<i class="future"></i>'
      const r = d.ranking.find(x => x.id === id)
      return r ? `<i class="p${Math.min(r.place, 4)}" title="${shortDay(d.day)}: ${r.place}º">${r.place}</i>` : '<i class="miss">·</i>'
    }).join('')
  const letters = Array.from({ length: 7 }, (_, i) => `<i>${'LMXJVSD'[i]}</i>`).join('')
  return `
    <section class="card">
      <div class="section-head"><h2>Temporada</h2><span class="muted small">${shortDay(gr.season.from)} – ${shortDay(gr.season.to)}</span></div>
      ${
        leader
          ? `<div class="leader" style="--c:${leader.color}"><span class="crown big">👑</span>${ava(leader, 'lg')}<div><small>Líder de la semana</small><b>${esc(leader.name)}</b><span>${leader.points} pts · ${leader.wins} ${leader.wins === 1 ? 'victoria' : 'victorias'}</span></div></div>`
          : '<p class="muted">Nadie ha jugado esta semana todavía.</p>'
      }
      ${
        table.length
          ? `<div class="season-grid"><div class="sg-head"><span></span><span class="days">${letters}</span><b>Pts</b></div>${table
              .map((r, i) => `<div class="sg-row ${r.id === me()?.id ? 'is-me' : ''}"><span class="who"><em>${i + 1}</em>${ava(r, 'sm')}<span>${esc(r.name)}</span></span><span class="days">${cells(r.id)}</span><b>${r.points}</b></div>`)
              .join('')}</div>`
          : ''
      }
      <p class="muted small">Cada día: ${PLACE_POINTS.slice(0, 4).map((p, i) => `${i + 1}º ${p}`).join(' · ')}… y 1 punto por jugar. El lunes empieza otra temporada y el líder se lleva la corona.</p>
    </section>
    ${lastChamp ? `<section class="card fact">👑 Campeón de la semana pasada: <b>${esc(lastChamp.name)}</b> con ${lastChamp.points} pts</section>` : ''}`
}

// ─── Juegos ─────────────────────────────────────────────────────────────

function screenJuegos(): string {
  const t = todayGame()
  const list = Object.values(CATALOG).sort((a, b) => (a.id === t ? -1 : b.id === t ? 1 : 0))
  return `
    <div class="screen-head"><h1>Juegos</h1></div>
    <p class="muted lead-in">Cada día toca uno. El resto puedes jugarlos cuando quieras para entrenar.</p>
    <div class="games">${list
      .map(
        x => `<button class="game-card ${x.id === t ? 'is-today' : ''}" style="--accent:${x.color}" data-action="intro" data-game="${x.id}">
          ${x.id === t ? '<i class="ribbon">HOY</i>' : ''}<span class="big-emoji">${x.emoji}</span><b>${esc(x.name)}</b><small>${esc(x.how)}</small></button>`,
      )
      .join('')}</div>`
}

// ─── Ranking mundial ────────────────────────────────────────────────────

function screenRanking(): string {
  const g = CATALOG[todayGame()]
  const gl = view.global
  let body = '<p class="muted">Cargando…</p>'
  if (view.globalError) body = `<p class="form-error">${esc(api.errorText(view.globalError))}</p>`
  else if (gl && !gl.ranking.length) body = '<p class="muted">Nadie ha jugado hoy todavía. ¡El primer puesto es tuyo!</p>'
  else if (gl) {
    body = `${podium(gl.ranking.slice(0, 3), r => g.unit(r.score))}
      ${gl.ranking.length > 3 ? `<ol class="ranking">${gl.ranking.slice(3).map(r => rankRow(r, esc(g.unit(r.score)))).join('')}</ol>` : ''}`
  }
  const mine = gl?.me
  return `
    <div class="screen-head"><h1>Ranking mundial</h1></div>
    <section class="card mine" style="--accent:${g.color}">
      <span class="big-emoji">${g.emoji}</span>
      <div><small>Hoy · ${esc(g.name)}</small><b>${mine ? `Vas ${mine.place}º de ${gl!.total}` : 'Aún no has jugado hoy'}</b>${mine ? `<span>${esc(g.unit(mine.score!))}</span>` : ''}</div>
      <button class="btn primary small" data-action="intro" data-game="${g.id}">Jugar</button>
    </section>
    <section class="card">${body}</section>`
}

// ─── Perfil ─────────────────────────────────────────────────────────────

function screenPerfil(): string {
  const m = me()
  const st = view.state?.stats
  if (!m) return '<section class="card"><p class="muted">Cargando…</p></section>'
  return `
    <section class="card profile" style="--c:${m.color}">
      ${ava(m, 'xl')}
      <h1>${esc(m.name)}</h1>
      <button class="btn small" data-action="rename">✏️ Cambiar nombre</button>
      <div class="stat-row">
        <div><small>Racha</small><b>🔥 ${st?.streak ?? 0}</b></div>
        <div><small>Mejor racha</small><b>${st?.bestStreak ?? 0}</b></div>
        <div><small>Partidas</small><b>${st?.total ?? 0}</b></div>
      </div>
    </section>
    <section class="card">
      <h2>Tu avatar</h2>
      <div class="ava-grid">${AVATARS.map(a => `<button class="ava-pick ${a === m.avatar ? 'is-on' : ''}" data-action="avatar" data-v="${a}">${a}</button>`).join('')}</div>
      <h2>Color</h2>
      <div class="color-row">${COLORS.map(c => `<button class="swatch ${c === m.color ? 'is-on' : ''}" style="--c:${c}" data-action="color" data-v="${c}" aria-label="Color ${c}"></button>`).join('')}</div>
    </section>
    <section class="card settings">
      ${isInstalled() ? '' : '<button class="setting" data-action="install"><span>📲 Instalar la app</span><b>Gratis →</b></button>'}
      <button class="setting" data-action="share-app"><span>🔗 Enlace de descarga</span><b>Compartir →</b></button>
      <button class="setting" data-action="sound"><span>Sonido</span><b>${muted() ? 'Desactivado 🔇' : 'Activado 🔊'}</b></button>
    </section>
    <footer>weflipi · Creado por ${esc(AUTHOR)}</footer>`
}

// ─── Data ───────────────────────────────────────────────────────────────

async function loadGroup(code: string): Promise<void> {
  if (!code) return
  remember(code)
  view.groupError = ''
  const r = await api.getGroup(code)
  if (view.selected !== code) return
  if (r.ok) view.group = r.data
  else view.groupError = r.error === 'offline' ? '' : r.error
  if (view.tab === 'hoy' || view.tab === 'grupos') render()
}

async function loadGlobal(): Promise<void> {
  if (!api.savedPlayer()) {
    view.globalError = view.error || 'offline'
    render()
    return
  }
  const r = await api.getGlobal()
  view.global = r.ok ? r.data : null
  view.globalError = r.ok ? '' : r.error
  if (view.tab === 'ranking') render()
}

async function refresh(): Promise<void> {
  if (!api.savedPlayer() && api.pendingName()) {
    const r = await api.register(api.pendingName())
    if (r.ok && store.get('weflipi.avatar')) await api.updateProfile({ avatar: store.get('weflipi.avatar') })
  }
  if (!api.savedPlayer() && !api.pendingName()) {
    renderWelcome()
    return
  }
  const r = await api.getState()
  if (r.ok) {
    view.state = r.data
    view.error = ''
    view.errorDetail = ''
    deadline = Date.now() + r.data.msLeft
    if (!r.data.me && !api.pendingName()) {
      // The stored identity was rejected (e.g. database reset): ask for a name again.
      renderWelcome()
      return
    }
  } else {
    view.error = r.error
    view.errorDetail = r.detail ?? ''
    view.state = null
  }
  const invite = new URLSearchParams(location.search).get('unirse')
  if (invite && view.state?.me) {
    history.replaceState(null, '', location.pathname + location.hash)
    const j = await api.joinGroup(invite)
    if (j.ok) {
      toast(`¡Te has unido a «${j.data.name}»!`)
      remember(j.data.code)
      view.tab = 'grupos'
      const again = await api.getState()
      if (again.ok) view.state = again.data
    } else toast(api.errorText(j.error))
  }
  const groups = view.state?.groups ?? []
  if (groups.length && !groups.some(x => x.code === view.selected)) remember(groups[0].code)
  render()
  await loadForTab()
}

// ─── Playing: intro → 3·2·1 → game → results ───────────────────────────

function intro(id: GameId): void {
  const g = CATALOG[id]
  const counts = id === todayGame()
  const best = counts ? (view.state?.best ?? api.localBest(day(), id, null, (a, b) => isBetter(id, a, b))) : null
  const wrap = document.createElement('div')
  wrap.className = 'intro'
  wrap.style.setProperty('--accent', g.color)
  wrap.innerHTML = `
    <button class="icon-btn close" data-close aria-label="Cerrar">✕</button>
    <div class="intro-body">
      <span class="tag">${counts ? '⚔️ Reto de hoy · cuenta para tus grupos' : '🎯 Entrenamiento · no cuenta'}</span>
      <span class="intro-emoji">${g.emoji}</span>
      <h1>${esc(g.name)}</h1>
      <p>${esc(g.how)}</p>
      ${best !== null ? `<div class="pill">Tu mejor hoy: <b>${esc(g.unit(best))}</b></div>` : ''}
    </div>
    <button class="btn primary big pulse" data-go>¡JUGAR!</button>`
  document.body.appendChild(wrap)
  document.body.classList.add('is-playing')
  const close = () => {
    wrap.remove()
    document.body.classList.remove('is-playing')
  }
  wrap.querySelector('[data-close]')!.addEventListener('click', close)
  wrap.querySelector('[data-go]')!.addEventListener('click', () => {
    sfx.tone(440, 1)
    wrap.remove()
    if (id === 'helix') {
      location.href = `./helix.html${counts ? '?weflipi=1' : ''}`
      return
    }
    play(id, counts)
  })
}

function play(id: GameId, counts: boolean): void {
  const info = CATALOG[id]
  const screen = document.createElement('div')
  screen.className = 'play'
  screen.innerHTML = `
    <div class="play-bar"><button class="icon-btn" data-quit aria-label="Salir">✕</button><b>${info.emoji} ${esc(info.name)}${counts ? '' : ' <small>entreno</small>'}</b><span data-score></span></div>
    <canvas></canvas>
    <div class="count" data-count></div>`
  document.body.appendChild(screen)
  document.body.classList.add('is-playing')
  cover.pause(true)
  const canvas = screen.querySelector('canvas')!
  const scoreEl = screen.querySelector<HTMLElement>('[data-score]')!
  const count = screen.querySelector<HTMLElement>('[data-count]')!
  let timers: number[] = []
  const quit = () => {
    timers.forEach(clearTimeout)
    count.classList.remove('is-blocking')
    stopGame?.()
    stopGame = null
    screen.remove()
    document.body.classList.remove('is-playing')
    cover.pause(false)
    void refresh()
  }
  screen.querySelector('[data-quit]')!.addEventListener('click', quit)
  const seed = daySeed(day()) ^ [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261)
  // The game is drawn from the start (all games idle until the first input), but the countdown
  // overlay swallows taps and keys until ¡YA!.
  stopGame = run(canvas, info.factory!, {
    rand: mulberry(seed),
    score: n => (scoreEl.textContent = info.unit(n)),
    end: score => void finish(screen, id, score, counts, () => {
      quit()
      play(id, counts)
    }, quit),
  })
  count.classList.add('is-blocking')
  const swallow = (e: Event) => {
    if (count.classList.contains('is-blocking')) {
      e.stopImmediatePropagation()
      e.preventDefault()
    }
  }
  addEventListener('keydown', swallow, true)
  addEventListener('keyup', swallow, true)
  const start = () => {
    count.classList.remove('is-blocking')
    timers.push(window.setTimeout(() => {
      removeEventListener('keydown', swallow, true)
      removeEventListener('keyup', swallow, true)
    }, 0))
  }
  const steps = ['3', '2', '1', '¡YA!']
  steps.forEach((s, i) => {
    timers.push(
      window.setTimeout(() => {
        count.textContent = s
        count.classList.remove('pop')
        void count.offsetWidth
        count.classList.add('pop')
        sfx.tone(i === 3 ? 880 : 440, i === 3 ? 220 : 120, 'triangle', 0.08)
        buzz(i === 3 ? 30 : 10)
        if (i === 3) {
          start()
          timers.push(window.setTimeout(() => (count.textContent = ''), 500))
        }
      }, i * 650),
    )
  })
}

async function finish(screen: HTMLElement, id: GameId, score: number, counts: boolean, again: () => void, back: () => void): Promise<void> {
  const info = CATALOG[id]
  const better = (a: number, b: number) => isBetter(id, a, b)
  const prevLocal = api.localBest(day(), id, null, better)
  const isRecord = counts && (prevLocal === null || better(score, prevLocal))
  const overlay = document.createElement('div')
  overlay.className = 'results'
  overlay.style.setProperty('--accent', info.color)
  overlay.innerHTML = `
    <canvas class="confetti"></canvas>
    <div class="results-card">
      <span class="eyebrow">${counts ? (isRecord ? '🎉 ¡Nuevo récord del día!' : 'Partida terminada') : 'Entrenamiento'}</span>
      <span class="results-emoji">${info.emoji}</span>
      <div class="big-score">${esc(info.unit(score))}</div>
      <div data-status class="results-status">${counts ? '<p class="muted">Guardando…</p>' : '<p class="muted">Los entrenamientos no cuentan para el ranking.</p>'}</div>
      <div class="row"><button class="btn ghost" data-back>Inicio</button><button class="btn primary" data-again>↻ Otra vez</button></div>
    </div>`
  screen.appendChild(overlay)
  overlay.querySelector('[data-again]')!.addEventListener('click', again)
  overlay.querySelector('[data-back]')!.addEventListener('click', back)
  ;(overlay.querySelector('[data-again]') as HTMLButtonElement).focus()
  if (isRecord) {
    confetti(overlay.querySelector('canvas')!)
    sfx.tone(523, 120, 'triangle', 0.08)
    setTimeout(() => sfx.tone(659, 120, 'triangle', 0.08), 120)
    setTimeout(() => sfx.tone(784, 260, 'triangle', 0.08), 240)
    buzz(40)
  }
  if (!counts) return
  const best = api.localBest(day(), id, score, better)
  const status = overlay.querySelector<HTMLElement>('[data-status]')!
  if (!api.savedPlayer()) {
    status.innerHTML = `<p class="muted">Tu mejor de hoy: ${esc(info.unit(best ?? score))} (guardado en este móvil)</p>`
    return
  }
  const r = await api.submitScore(id, score)
  if (!r.ok) {
    status.innerHTML = `<p class="muted">${r.error === 'not_today' ? 'El reto ha cambiado mientras jugabas; esta partida ya no cuenta.' : `${esc(api.errorText(r.error))} Tu mejor de hoy: ${esc(info.unit(best ?? score))}`}</p>`
    return
  }
  if (view.state) {
    view.state.best = r.data.best
    view.state.plays = r.data.plays
  }
  // Where this leaves you in each of your groups.
  const groups = (view.state?.groups ?? []).slice(0, 3)
  const places = await Promise.all(groups.map(g => api.getGroup(g.code)))
  const myId = me()?.id
  const lines = places
    .map(p => (p.ok ? { name: p.data.name, row: p.data.today.find(x => x.id === myId), total: p.data.members.length } : null))
    .filter((x): x is { name: string; row: api.RankRow | undefined; total: number } => !!x?.row)
    .map(x => `<li>${medal(x.row!.place)} <span>en <b>${esc(x.name)}</b></span><small>de ${x.total}</small></li>`)
  status.innerHTML = `
    <div class="stat-row">
      <div><small>Tu mejor hoy</small><b>${esc(info.unit(r.data.best))}</b></div>
      <div><small>Partidas</small><b>${r.data.plays}</b></div>
      <div><small>Racha</small><b>🔥 ${r.data.streak}</b></div>
    </div>
    ${lines.length ? `<ul class="places">${lines.join('')}</ul>` : ''}`
}

function confetti(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d')!
  const dpr = Math.min(2, devicePixelRatio || 1)
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  const colors = ['#ffd35c', '#ff5f7e', '#7ef9ff', '#a77bff', '#2bd47d', '#ff9f43']
  const bits = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 900,
    vy: -300 - Math.random() * 700,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 12,
    s: 5 + Math.random() * 7,
    c: colors[Math.floor(Math.random() * colors.length)],
  }))
  let last = performance.now()
  const t0 = last
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, innerWidth, innerHeight)
    for (const b of bits) {
      b.vy += 1100 * dt
      b.vx *= 0.99
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.r += b.vr * dt
      g.save()
      g.translate(b.x, b.y)
      g.rotate(b.r)
      g.fillStyle = b.c
      g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2)
      g.restore()
    }
    if (now - t0 < 3500 && canvas.isConnected) requestAnimationFrame(frame)
    else g.clearRect(0, 0, innerWidth, innerHeight)
  }
  requestAnimationFrame(frame)
}

// ─── Events ─────────────────────────────────────────────────────────────

app.addEventListener('click', async e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
  if (!el) return
  const action = el.dataset.action
  buzz(8)
  if (action === 'tab') go(el.dataset.tab as Tab)
  else if (action === 'install') void install()
  else if (action === 'install-hide') {
    store.set('weflipi.installHidden', '1')
    render()
  } else if (action === 'share-app') void shareApp()
  else if (action === 'intro') intro(el.dataset.game as GameId)
  else if (action === 'group') {
    view.groupTab = 'hoy'
    remember(el.dataset.code!)
    render()
    void loadGroup(el.dataset.code!)
  } else if (action === 'gtab') {
    view.groupTab = el.dataset.v as View['groupTab']
    render()
  } else if (action === 'sound') {
    setMuted(!muted())
    render()
  } else if (action === 'avatar' || action === 'color') {
    const change = action === 'avatar' ? { avatar: el.dataset.v! } : { color: el.dataset.v! }
    if (!api.savedPlayer()) {
      store.set(`weflipi.${action}`, el.dataset.v!)
      render()
      return
    }
    if (view.state?.me) Object.assign(view.state.me, change)
    render()
    const r = await api.updateProfile(change)
    if (!r.ok) toast(api.errorText(r.error))
  } else if (action === 'rename') {
    modal('Cambiar nombre', `<input name="name" maxlength="16" value="${esc(me()?.name ?? '')}" required />`, async f => {
      const name = String(f.get('name') ?? '').trim()
      if (!api.savedPlayer()) {
        const r = await api.register(name)
        if (!r.ok && r.error !== 'offline' && r.error !== 'no_database') return api.errorText(r.error)
      } else {
        const r = await api.updateProfile({ name })
        if (!r.ok) return api.errorText(r.error)
      }
      await refresh()
      return null
    }, 'Guardar')
  } else if (action === 'create') {
    if (!api.savedPlayer()) return toast(api.errorText(view.error || 'offline'))
    modal('Crear grupo', `<input name="name" maxlength="24" placeholder="Nombre del grupo (ej. Los cracks)" required />`, async f => {
      const r = await api.createGroup(String(f.get('name') ?? ''))
      if (!r.ok) return api.errorText(r.error)
      remember(r.data.code)
      view.tab = 'grupos'
      history.replaceState(null, '', '#grupos')
      await refresh()
      void share(r.data.code, r.data.name)
      return null
    }, 'Crear')
  } else if (action === 'join') {
    if (!api.savedPlayer()) return toast(api.errorText(view.error || 'offline'))
    modal('Unirme a un grupo', `<input name="code" maxlength="6" placeholder="CÓDIGO" autocapitalize="characters" required class="code-input" />`, async f => {
      const r = await api.joinGroup(String(f.get('code') ?? ''))
      if (!r.ok) return api.errorText(r.error)
      remember(r.data.code)
      toast(`¡Te has unido a «${r.data.name}»!`)
      view.tab = 'grupos'
      history.replaceState(null, '', '#grupos')
      await refresh()
      return null
    }, 'Unirme')
  } else if (action === 'invite' && view.group) void share(view.group.code, view.group.name)
  else if (action === 'copy-code' && view.group) {
    try {
      await navigator.clipboard.writeText(view.group.code)
      toast('Código copiado')
    } catch {
      toast(`Código: ${view.group.code}`)
    }
  } else if (action === 'leave' && view.group) {
    const gr = view.group
    modal(`¿Salir de «${gr.name}»?`, '<p class="muted">Podrás volver a entrar con el código.</p>', async () => {
      const r = await api.leaveGroup(gr.code)
      if (!r.ok) return api.errorText(r.error)
      view.group = null
      remember('')
      await refresh()
      return null
    }, 'Salir')
  }
})

async function share(code: string, name: string): Promise<void> {
  const url = `${location.origin}${location.pathname}?unirse=${code}`
  const textMsg = `¡Únete a mi grupo «${name}» en weflipi y compite conmigo cada día! Código: ${code}`
  if (navigator.share) {
    try {
      await navigator.share({ title: 'weflipi', text: textMsg, url })
      return
    } catch {
      /* cancelled: fall back to copying */
    }
  }
  try {
    await navigator.clipboard.writeText(`${textMsg} ${url}`)
    toast('Enlace copiado. ¡Pásaselo a tus amigos!')
  } catch {
    modal('Invita a tus amigos', `<input readonly value="${esc(url)}" />`, () => null, 'Hecho')
  }
}

addEventListener('hashchange', () => {
  const t = tabFromHash()
  if (t !== view.tab) go(t)
})

setInterval(() => {
  const left = deadline - Date.now()
  app.querySelectorAll('[data-el="timer"]').forEach(el => (el.innerHTML = clockHtml(left)))
  if (left <= 0 && !stopGame) {
    deadline = Date.now() + msUntilNextDay()
    void refresh()
  }
}, 1000)

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !stopGame && !document.querySelector('.intro, .sheet-wrap')) void refresh()
})

registerServiceWorker()
onInstallChange(() => render())

void refresh()
;(window as unknown as { __weflipi: unknown }).__weflipi = { view, play, intro }
