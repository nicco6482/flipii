// weflipi hub: today's minigame, friend groups (daily ranking + weekly season) and practice.
import './hub.css'
import { daySeed, gameById, gameOfDay, isBetter, msUntilNextDay, today, type GameId } from '../../server/weflipi-games.mjs'
import * as api from './api'
import { CATALOG } from './catalog'
import { startCover } from './cover'
import { mulberry, muted, run, setMuted } from './engine'

const AUTHOR = 'nicco6482'
const app = document.getElementById('app')!
const coverCanvas = document.createElement('canvas')
coverCanvas.className = 'cover'
coverCanvas.setAttribute('aria-hidden', 'true')
document.body.prepend(coverCanvas)
const coverGames = Object.values(CATALOG)
const cover = startCover(coverCanvas, coverGames, Math.max(0, coverGames.findIndex(x => x.id === gameOfDay(today()).id)), () => app.querySelector('.hero-space')?.getBoundingClientRect() ?? null)
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

type View = { state: api.State | null; error: string; errorDetail: string; group: api.Group | null; groupError: string; selected: string }
const view: View = { state: null, error: '', errorDetail: '', group: null, groupError: '', selected: '' }
let deadline = Date.now() + msUntilNextDay()
let stopGame: (() => void) | null = null

const selectedKey = 'weflipi.group'
function remember(code: string): void {
  view.selected = code
  try {
    localStorage.setItem(selectedKey, code)
  } catch {
    /* ignore */
  }
}
try {
  view.selected = localStorage.getItem(selectedKey) ?? ''
} catch {
  /* ignore */
}

const day = () => view.state?.day ?? today()
const todayGame = (): GameId => view.state?.game ?? gameOfDay(day()).id
const me = () => view.state?.me ?? (api.savedPlayer() ? { id: api.savedPlayer()!.id, name: api.savedPlayer()!.name } : null)
const myName = () => me()?.name ?? api.pendingName()

// ─── Shell ──────────────────────────────────────────────────────────────

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

function toast(msg: string): void {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => el.classList.add('is-out'), 2200)
  setTimeout(() => el.remove(), 2600)
}

function modal(title: string, body: string, onSubmit: (form: FormData) => Promise<string | null> | string | null, submitLabel = 'Aceptar'): void {
  const wrap = document.createElement('div')
  wrap.className = 'modal-wrap'
  wrap.innerHTML = `<form class="modal card"><h2>${esc(title)}</h2>${body}<p class="form-error" hidden></p><div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">${esc(submitLabel)}</button></div></form>`
  document.body.appendChild(wrap)
  const form = wrap.querySelector('form')!
  const err = wrap.querySelector<HTMLElement>('.form-error')!
  const close = () => wrap.remove()
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
  form.querySelector<HTMLInputElement>('input')?.focus()
}

// ─── Onboarding ─────────────────────────────────────────────────────────

function renderWelcome(): void {
  app.innerHTML = `
  <main class="hub welcome">
    <div class="hero">
      <h1 class="logo">we<span>flipi</span></h1>
      <p class="tagline">Un minijuego nuevo cada día.<br />Tú, tus amigos y una temporada que ganar.</p>
    </div>
    <div class="hero-space" aria-hidden="true"></div>
    <form class="card" data-el="welcome">
      <label for="name">¿Cómo te llamas?</label>
      <input id="name" name="name" maxlength="16" autocomplete="nickname" placeholder="Tu apodo" required />
      <button class="btn primary big">¡Vamos!</button>
      <p class="form-error" hidden></p>
    </form>
    <footer>Creado por ${esc(AUTHOR)}</footer>
  </main>`
  const form = app.querySelector<HTMLFormElement>('[data-el="welcome"]')!
  form.querySelector('input')!.focus()
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) return
    form.querySelector('button')!.disabled = true
    const r = await api.register(name)
    if (!r.ok && r.error !== 'offline' && r.error !== 'no_database') {
      form.querySelector('button')!.disabled = false
      const err = form.querySelector<HTMLElement>('.form-error')!
      err.hidden = false
      err.textContent = api.errorText(r.error)
      return
    }
    await refresh()
  })
}

// ─── Home ───────────────────────────────────────────────────────────────

function renderHome(): void {
  const g = CATALOG[todayGame()]
  const rule = gameById(g.id)!
  const best = view.state?.best ?? api.localBest(day(), g.id, null, (a, b) => isBetter(g.id, a, b))
  const plays = view.state?.plays ?? 0
  const groups = view.state?.groups ?? []
  const all = Object.values(CATALOG)
  const offline = view.error
    ? `<div class="card notice">${
        view.error === 'no_database'
          ? '<b>Los grupos aún no están activos.</b> Falta conectar la base de datos (Upstash Redis) en Vercel. Mientras tanto puedes jugar igual.'
          : view.error === 'offline'
            ? `<b>Sin conexión con el servidor.</b> Puedes jugar igual; tus puntuaciones se guardan en este móvil.`
            : `<b>${esc(api.errorText(view.error))}</b> Puedes jugar igual mientras tanto.${view.errorDetail ? `<br /><small>Detalle: ${esc(view.errorDetail)}</small>` : ''}`
      }</div>`
    : ''
  app.innerHTML = `
  <main class="hub">
    <header class="top">
      <button class="chip" data-action="rename">👤 ${esc(myName() || 'Jugador')}</button>
      <button class="chip" data-action="sound" aria-label="Sonido">${muted() ? '🔇' : '🔊'}</button>
    </header>
    <div class="hero">
      <h1 class="logo">we<span>flipi</span></h1>
      <p class="tagline">Un minijuego nuevo cada día.<br />Tú, tus amigos y una temporada que ganar.</p>
    </div>
    <div class="hero-space" aria-hidden="true"></div>
    ${offline}
    <section class="card today" style="--accent:${g.color}">
      <div class="today-head"><span class="eyebrow">Juego de hoy</span><span class="timer" data-el="timer">Cambia en ${clock(deadline - Date.now())}</span></div>
      <div class="today-game"><span class="emoji">${g.emoji}</span><div><h2>${esc(g.name)}</h2><p>${esc(g.how)}</p></div></div>
      <div class="today-stats">
        <div><small>Tu mejor hoy</small><b>${best === null ? '—' : esc(g.unit(best))}</b></div>
        <div><small>Partidas</small><b>${plays}</b></div>
        <div><small>Gana</small><b>${rule.dir === 'asc' ? 'el más bajo' : 'el más alto'}</b></div>
      </div>
      <button class="btn primary big" data-action="play" data-game="${g.id}">▶ JUGAR</button>
      <p class="hint">Intentos ilimitados hasta que cambie el juego. Cuenta tu mejor puntuación.</p>
    </section>
    <section class="card practice">
      <h2>Todos los juegos</h2>
      <p class="muted">Juega a cualquiera cuando quieras. Solo el de hoy cuenta para los grupos; el resto es para entrenar.</p>
      <div class="grid">${all
        .map(x => {
          const isToday = x.id === g.id
          return `<button class="game-tile ${isToday ? 'is-today' : ''}" style="--accent:${x.color}" data-action="${isToday ? 'play' : 'practice'}" data-game="${x.id}">${isToday ? '<i>HOY</i>' : ''}<span>${x.emoji}</span><b>${esc(x.name)}</b></button>`
        })
        .join('')}</div>
    </section>
    <section class="card groups">
      <div class="section-head"><h2>Mis grupos</h2><div class="row"><button class="btn small" data-action="join">Unirme</button><button class="btn small primary" data-action="create">+ Crear</button></div></div>
      ${
        groups.length
          ? `<div class="tabs">${groups.map(x => `<button class="tab ${x.code === view.selected ? 'is-on' : ''}" data-action="group" data-code="${x.code}">${esc(x.name)} <small>${x.members}</small></button>`).join('')}</div><div data-el="group">${renderGroup()}</div>`
          : `<p class="muted">Aún no estás en ningún grupo. Crea uno y pasa el enlace a tus amigos, o únete con el código que te hayan dado.</p>`
      }
    </section>
    <footer>Creado por ${esc(AUTHOR)}</footer>
  </main>`
}

function medal(place: number): string {
  return place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}º`
}

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })

function renderGroup(): string {
  if (view.groupError) return `<p class="form-error">${esc(api.errorText(view.groupError))}</p>`
  const gr = view.group
  if (!gr || gr.code !== view.selected) return `<p class="muted">Cargando grupo…</p>`
  const myId = me()?.id
  const game = CATALOG[gr.game]
  const played = new Set(gr.today.map(r => r.id))
  const pending = gr.members.filter(m => !played.has(m.id))
  const plays = Object.fromEntries(gr.members.map(m => [m.id, m.playsToday]))
  const yGame = CATALOG[gr.yesterday.game]
  const yWin = gr.yesterday.ranking[0]
  const lastChamp = gr.lastSeason.table[0]
  return `
    <div class="group-head">
      <div><h3>${esc(gr.name)}</h3><span class="code">Código <b>${esc(gr.code)}</b></span></div>
      <div class="row"><button class="btn small primary" data-action="invite">Invitar</button><button class="btn small ghost" data-action="leave">Salir</button></div>
    </div>
    <h4>Hoy · ${game.emoji} ${esc(game.name)}</h4>
    <ol class="ranking">
      ${gr.today.map(r => `<li class="${r.id === myId ? 'is-me' : ''}"><span class="place">${medal(r.place)}</span><span class="name">${esc(r.name)}</span><small>${plays[r.id] ?? 0} partidas</small><b>${esc(game.unit(r.score))}</b></li>`).join('')}
      ${pending.map(m => `<li class="pending ${m.id === myId ? 'is-me' : ''}"><span class="place">·</span><span class="name">${esc(m.name)}</span><small>sin jugar</small><b>—</b></li>`).join('')}
    </ol>
    <h4>Temporada · ${shortDay(gr.season.from)} – ${shortDay(gr.season.to)}</h4>
    ${
      gr.season.table.length
        ? `<ol class="ranking season">${gr.season.table.map((r, i) => `<li class="${r.id === myId ? 'is-me' : ''}"><span class="place">${medal(i + 1)}</span><span class="name">${esc(r.name)}</span><small>${r.wins ? `🏆 ${r.wins}` : ''} · ${r.played} días</small><b>${r.points} pts</b></li>`).join('')}</ol>`
        : `<p class="muted">Nadie ha jugado aún esta semana.</p>`
    }
    <p class="muted small">Cada día: 1º 10 pts, 2º 8, 3º 6, 4º 5… y 1 punto solo por jugar. La temporada se reinicia el lunes.</p>
    <div class="facts">
      ${yWin ? `<div>Ayer (${yGame.emoji} ${esc(yGame.name)}) ganó <b>${esc(yWin.name)}</b> con ${esc(yGame.unit(yWin.score))}</div>` : ''}
      ${lastChamp ? `<div>Campeón de la semana pasada: <b>${esc(lastChamp.name)}</b> (${lastChamp.points} pts)</div>` : ''}
    </div>`
}

async function loadGroup(code: string): Promise<void> {
  if (!code) return
  remember(code)
  view.groupError = ''
  const box = app.querySelector('[data-el="group"]')
  if (box && view.group?.code !== code) box.innerHTML = renderGroup()
  const r = await api.getGroup(code)
  if (view.selected !== code) return
  if (r.ok) view.group = r.data
  else view.groupError = r.error
  if (r.ok || r.error !== 'offline') {
    const target = app.querySelector('[data-el="group"]')
    if (target) target.innerHTML = renderGroup()
  }
}

async function refresh(): Promise<void> {
  const p = api.savedPlayer()
  if (!p && api.pendingName()) await api.register(api.pendingName())
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
    history.replaceState(null, '', location.pathname)
    const j = await api.joinGroup(invite)
    if (j.ok) {
      toast(`Te has unido a «${j.data.name}»`)
      remember(j.data.code)
      const again = await api.getState()
      if (again.ok) view.state = again.data
    } else toast(api.errorText(j.error))
  }
  const groups = view.state?.groups ?? []
  if (groups.length && !groups.some(x => x.code === view.selected)) remember(groups[0].code)
  renderHome()
  if (groups.length) void loadGroup(view.selected)
}

// ─── Playing ────────────────────────────────────────────────────────────

function play(id: GameId, practice: boolean): void {
  if (id === 'helix') {
    location.href = `./helix.html${practice ? '' : '?weflipi=1'}`
    return
  }
  const info = CATALOG[id]
  const counts = !practice && id === todayGame()
  const screen = document.createElement('div')
  screen.className = 'play'
  screen.innerHTML = `
    <div class="play-bar"><button class="chip" data-quit aria-label="Salir">✕</button><b>${info.emoji} ${esc(info.name)}${counts ? '' : ' <small>práctica</small>'}</b><span data-score></span></div>
    <canvas></canvas>`
  document.body.appendChild(screen)
  document.body.classList.add('is-playing')
  cover.pause(true)
  const canvas = screen.querySelector('canvas')!
  const scoreEl = screen.querySelector<HTMLElement>('[data-score]')!
  const quit = () => {
    stopGame?.()
    stopGame = null
    screen.remove()
    document.body.classList.remove('is-playing')
    cover.pause(false)
    void refresh()
  }
  screen.querySelector('[data-quit]')!.addEventListener('click', quit)
  const seed = daySeed(day()) ^ [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261)
  stopGame = run(canvas, info.factory!, {
    rand: mulberry(seed),
    score: n => (scoreEl.textContent = info.unit(n)),
    end: score => void finish(screen, id, score, counts, () => {
      quit()
      play(id, practice)
    }, quit),
  })
}

async function finish(screen: HTMLElement, id: GameId, score: number, counts: boolean, again: () => void, back: () => void): Promise<void> {
  const info = CATALOG[id]
  const better = (a: number, b: number) => isBetter(id, a, b)
  const prevLocal = api.localBest(day(), id, null, better)
  const overlay = document.createElement('div')
  overlay.className = 'results'
  const isRecord = counts && (prevLocal === null || better(score, prevLocal))
  overlay.innerHTML = `
    <div class="card">
      <span class="eyebrow">${counts ? (isRecord ? '¡Nuevo récord del día!' : 'Partida terminada') : 'Práctica'}</span>
      <div class="big-score">${esc(info.unit(score))}</div>
      <p data-status class="muted">${counts ? 'Guardando…' : 'Las prácticas no cuentan para el ranking.'}</p>
      <div class="row"><button class="btn ghost" data-back>Volver</button><button class="btn primary" data-again>Otra vez</button></div>
    </div>`
  screen.appendChild(overlay)
  overlay.querySelector('[data-again]')!.addEventListener('click', again)
  overlay.querySelector('[data-back]')!.addEventListener('click', back)
  ;(overlay.querySelector('[data-again]') as HTMLButtonElement).focus()
  if (!counts) return
  const best = api.localBest(day(), id, score, better)
  const status = overlay.querySelector<HTMLElement>('[data-status]')!
  if (!api.savedPlayer()) {
    status.textContent = `Tu mejor de hoy: ${info.unit(best ?? score)} (guardado solo en este móvil)`
    return
  }
  const r = await api.submitScore(id, score)
  if (r.ok) {
    status.innerHTML = `Tu mejor de hoy: <b>${esc(info.unit(r.data.best))}</b> · ${r.data.plays} partidas`
    if (view.state) {
      view.state.best = r.data.best
      view.state.plays = r.data.plays
    }
  } else status.textContent = r.error === 'not_today' ? 'El juego ha cambiado mientras jugabas; esta partida ya no cuenta.' : `${api.errorText(r.error)} Tu mejor de hoy: ${info.unit(best ?? score)}`
}

// ─── Events ─────────────────────────────────────────────────────────────

app.addEventListener('click', async e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
  if (!el) return
  const action = el.dataset.action
  if (action === 'play') play(el.dataset.game as GameId, false)
  else if (action === 'practice') play(el.dataset.game as GameId, true)
  else if (action === 'group') {
    app.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-on', t === el))
    void loadGroup(el.dataset.code!)
  } else if (action === 'sound') {
    setMuted(!muted())
    el.textContent = muted() ? '🔇' : '🔊'
  } else if (action === 'rename') {
    modal('Cambiar nombre', `<input name="name" maxlength="16" value="${esc(myName())}" required />`, async f => {
      const name = String(f.get('name') ?? '').trim()
      if (!api.savedPlayer()) {
        const r = await api.register(name)
        if (!r.ok && r.error !== 'offline' && r.error !== 'no_database') return api.errorText(r.error)
      } else {
        const r = await api.rename(name)
        if (!r.ok) return api.errorText(r.error)
      }
      await refresh()
      return null
    }, 'Guardar')
  } else if (action === 'create') {
    if (!api.savedPlayer()) return toast(api.errorText(view.error || 'offline'))
    modal('Crear grupo', `<input name="name" maxlength="24" placeholder="Nombre del grupo" required />`, async f => {
      const r = await api.createGroup(String(f.get('name') ?? ''))
      if (!r.ok) return api.errorText(r.error)
      remember(r.data.code)
      await refresh()
      void share(r.data.code, r.data.name)
      return null
    }, 'Crear')
  } else if (action === 'join') {
    if (!api.savedPlayer()) return toast(api.errorText(view.error || 'offline'))
    modal('Unirme a un grupo', `<input name="code" maxlength="6" placeholder="Código (6 letras)" autocapitalize="characters" required class="code-input" />`, async f => {
      const r = await api.joinGroup(String(f.get('code') ?? ''))
      if (!r.ok) return api.errorText(r.error)
      remember(r.data.code)
      toast(`Te has unido a «${r.data.name}»`)
      await refresh()
      return null
    }, 'Unirme')
  } else if (action === 'invite' && view.group) void share(view.group.code, view.group.name)
  else if (action === 'leave' && view.group) {
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

setInterval(() => {
  const left = deadline - Date.now()
  const el = app.querySelector('[data-el="timer"]')
  if (el) el.textContent = `Cambia en ${clock(left)}`
  if (left <= 0 && !stopGame) {
    deadline = Date.now() + msUntilNextDay()
    void refresh()
  }
}, 1000)

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !stopGame) void refresh()
})

void refresh()
;(window as unknown as { __weflipi: unknown }).__weflipi = { view, play }
