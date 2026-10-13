// 1 vs 1 in real time: the lobby (same phone / create online room / join with a code) and the
// match screen around runDuel. The match logic lives in duel/.
import * as api from './api'
import { DUELS, duelById } from './duel/catalog'
import { PLAYER_COLORS, type DuelFactory, type DuelInfo, type DuelResult, type Player } from './duel/core'
import { hostDuel, joinDuel, peekDuel, webrtcOk } from './duel/net'
import { runDuel, type DuelMode, type Link } from './duel/runner'

export type VersusCtx = {
  esc: (s: unknown) => string
  toast: (msg: string) => void
  myName: () => string
  /** The player is registered on the server (needed to swap connection details). */
  online: () => string | null
  pauseCover: (on: boolean) => void
  share: (text: string, url: string, copied: string) => Promise<void>
  confetti: (canvas: HTMLCanvasElement) => void
}

export { DUELS }

export function createVersus(ctx: VersusCtx) {
  const { esc } = ctx

  function sheet(html: string, onClose?: () => void): { el: HTMLElement; close: () => void } {
    const wrap = document.createElement('div')
    wrap.className = 'sheet-wrap'
    wrap.innerHTML = `<div class="sheet"><span class="grab"></span>${html}</div>`
    document.body.appendChild(wrap)
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      wrap.classList.add('is-out')
      setTimeout(() => wrap.remove(), 200)
      onClose?.()
    }
    wrap.addEventListener('pointerdown', e => e.target === wrap && close())
    wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close))
    return { el: wrap, close }
  }

  const problem = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'offline'
    return code === 'aborted' ? '' : api.errorText(code)
  }

  /** Choose how to play one of the 1 vs 1 games. */
  function menu(id: string): void {
    const info = duelById(id)
    if (!info) return
    const s = sheet(`
      <div class="duel-head" style="--accent:${info.color}"><span class="big-emoji">${info.emoji}</span><div><h2>${esc(info.name)} · 1 contra 1</h2><p class="muted">${esc(info.how)}</p></div></div>
      <button class="btn primary big" data-local>📱 En este móvil</button>
      <p class="muted small center">Cada uno en un lado de la pantalla, a la vez.</p>
      <div class="row"><button class="btn" data-host>🌐 Crear online</button><button class="btn" data-join>🔑 Tengo código</button></div>
      <p class="muted small center">Online: cada uno con su móvil, conectados con un código.</p>
      <button class="btn ghost" data-close>Cancelar</button>`)
    s.el.querySelector('[data-local]')!.addEventListener('click', async () => {
      s.close()
      const factory = await info.factory()
      openMatch(info, factory, { mode: 'local' }, ['Amarillo', 'Rojo'])
    })
    s.el.querySelector('[data-host]')!.addEventListener('click', () => {
      s.close()
      void host(info)
    })
    s.el.querySelector('[data-join]')!.addEventListener('click', () => {
      s.close()
      askCode()
    })
  }

  function canGoOnline(): boolean {
    if (!webrtcOk()) {
      ctx.toast('Este navegador no permite jugar online. Prueba con Chrome o Safari.')
      return false
    }
    if (!ctx.online()) {
      ctx.toast('Para jugar online necesitas conexión y haber puesto tu nombre.')
      return false
    }
    return true
  }

  async function host(info: DuelInfo): Promise<void> {
    if (!canGoOnline()) return
    const ctrl = new AbortController()
    // Closing the waiting sheet cancels the room, but not once the friend is connected.
    let connected = false
    const s = sheet(
      `<div class="duel-head" style="--accent:${info.color}"><span class="big-emoji">${info.emoji}</span><div><h2>${esc(info.name)} online</h2><p class="muted" data-status>Preparando la partida…</p></div></div>
      <div class="duel-code" data-code>· · · · · ·</div>
      <button class="btn primary" data-share disabled>📨 Enviar a mi amigo</button>
      <p class="muted small center">Tu amigo abre el enlace (o mete el código en <b>Juegos → 1 contra 1 → Tengo código</b>). No cierres esta pantalla.</p>
      <p class="form-error" hidden></p>
      <button class="btn ghost" data-close>Cancelar</button>`,
      () => !connected && ctrl.abort(),
    )
    const status = s.el.querySelector<HTMLElement>('[data-status]')!
    const err = s.el.querySelector<HTMLElement>('.form-error')!
    let code = ''
    s.el.querySelector('[data-share]')!.addEventListener('click', () => {
      const url = `${location.origin}/?duelo=${code}`
      void ctx.share(`¡Te reto a ${info.name} 1 contra 1 en weflipi! ${info.emoji} Entra ya, que te espero. Código: ${code}`, url, 'Enlace copiado. ¡Pásaselo!')
    })
    try {
      const factory = await info.factory()
      const link = await hostDuel(
        info.id,
        c => {
          code = c
          s.el.querySelector('[data-code]')!.textContent = c
          s.el.querySelector<HTMLButtonElement>('[data-share]')!.disabled = false
          status.innerHTML = '<span class="dots">Esperando a tu amigo</span>'
        },
        ctrl.signal,
      )
      connected = true
      s.close()
      openMatch(info, factory, { mode: 'host', link }, [ctx.myName(), 'Tu amigo'])
    } catch (e) {
      const msg = problem(e)
      if (!msg) return
      err.hidden = false
      err.textContent = msg
      status.textContent = 'No ha salido.'
    }
  }

  function askCode(prefill = ''): void {
    const s = sheet(`
      <h2>Unirme a un 1 contra 1</h2>
      <input class="code-input" maxlength="6" placeholder="CÓDIGO" autocapitalize="characters" value="${esc(prefill)}" />
      <p class="form-error" hidden></p>
      <div class="row"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-go>Entrar</button></div>`)
    const input = s.el.querySelector<HTMLInputElement>('input')!
    input.focus()
    const go = () => {
      const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (code.length !== 6) {
        const err = s.el.querySelector<HTMLElement>('.form-error')!
        err.hidden = false
        err.textContent = api.errorText('bad_code')
        return
      }
      s.close()
      void join(code)
    }
    s.el.querySelector('[data-go]')!.addEventListener('click', go)
    input.addEventListener('keydown', e => e.key === 'Enter' && go())
  }

  /** Join a friend's room (from the code sheet or a ?duelo= link). */
  async function join(code: string): Promise<void> {
    if (!canGoOnline()) return
    const ctrl = new AbortController()
    let connected = false
    let room: api.DuelRoom
    try {
      room = await peekDuel(code)
    } catch (e) {
      ctx.toast(problem(e) || api.errorText('offline'))
      return
    }
    const info = duelById(room.game)
    if (!info) return ctx.toast(api.errorText('bad_game'))
    const s = sheet(
      `<div class="duel-head" style="--accent:${info.color}"><span class="big-emoji">${info.emoji}</span><div><h2>${esc(room.host.name)} te reta</h2><p class="muted">${esc(info.name)} · 1 contra 1 en directo</p></div></div>
      <p class="muted">${esc(info.how)}</p>
      <p class="muted" data-status hidden></p>
      <p class="form-error" hidden></p>
      <div class="row"><button class="btn ghost" data-close>Ahora no</button><button class="btn primary" data-go>⚔️ ¡Vamos!</button></div>`,
      () => !connected && ctrl.abort(),
    )
    const btn = s.el.querySelector<HTMLButtonElement>('[data-go]')!
    btn.addEventListener('click', async () => {
      btn.disabled = true
      const status = s.el.querySelector<HTMLElement>('[data-status]')!
      status.hidden = false
      status.innerHTML = '<span class="dots">Conectando los dos móviles</span>'
      try {
        const factory = await info.factory()
        const link = await joinDuel(room, ctrl.signal)
        connected = true
        s.close()
        openMatch(info, factory, { mode: 'guest', link }, [room.host.name, ctx.myName()])
      } catch (e) {
        const msg = problem(e)
        if (!msg) return
        status.hidden = true
        const err = s.el.querySelector<HTMLElement>('.form-error')!
        err.hidden = false
        err.textContent = msg
      }
    })
  }

  /** The match screen: canvas, names, results with rematch, and disconnects. */
  function openMatch(info: DuelInfo, factory: DuelFactory, how: DuelMode, names: [string, string]): void {
    const link: Link | null = how.mode === 'local' ? null : how.link
    const me: Player | null = how.mode === 'host' ? 0 : how.mode === 'guest' ? 1 : null
    const screen = document.createElement('div')
    screen.className = 'play duel'
    screen.style.setProperty('--accent', info.color)
    const namesHtml = () => {
      const tag = (p: Player) => `<i style="color:${PLAYER_COLORS[p]}">${esc(names[p])}${p === me ? ' (tú)' : ''}</i>`
      return `${tag(0)} <small>vs</small> ${tag(1)}`
    }
    screen.innerHTML = `
      <div class="play-bar"><button class="icon-btn" data-quit aria-label="Salir">✕</button><b>${info.emoji} ${esc(info.name)}</b><span class="duel-names" data-names>${namesHtml()}</span></div>
      <canvas></canvas>`
    document.body.appendChild(screen)
    document.body.classList.add('is-playing')
    ctx.pauseCover(true)
    const canvas = screen.querySelector('canvas')!
    let overlay: HTMLElement | null = null
    const dropOverlay = () => {
      overlay?.remove()
      overlay = null
    }
    if (link) {
      link.send({ t: 'hi', name: ctx.myName() })
      link.onMessage(msg => {
        if (msg?.t === 'hi' && typeof msg.name === 'string' && me !== null) {
          names[me === 0 ? 1 : 0] = msg.name.slice(0, 16)
          screen.querySelector('[data-names]')!.innerHTML = namesHtml()
        }
      })
    }
    const show = (html: string) => {
      dropOverlay()
      overlay = document.createElement('div')
      overlay.className = 'results'
      overlay.innerHTML = `<canvas class="confetti"></canvas>${html}`
      screen.appendChild(overlay)
      overlay.querySelector('[data-exit]')?.addEventListener('click', exit)
      return overlay
    }
    const onEnd = (r: DuelResult, rematch: () => void) => {
      const w = r.winner
      const score = `<div class="duel-score"><b style="color:${PLAYER_COLORS[0]}">${r.scores[0]}</b><span>–</span><b style="color:${PLAYER_COLORS[1]}">${r.scores[1]}</b></div>`
      const title =
        me === null ? (w === null ? '¡Empate!' : `🏆 ¡Gana ${esc(names[w])}!`) : w === me ? '🏆 ¡Has ganado!' : w === null ? '¡Empate!' : `Gana ${esc(names[w])}`
      const el = show(`
        ${me === null && w !== null ? `<div class="duel-flip" style="color:${PLAYER_COLORS[w]}">${title}</div>` : ''}
        <div class="results-card">
          <span class="results-emoji">${info.emoji}</span>
          <h2 class="duel-title" ${w !== null ? `style="color:${PLAYER_COLORS[w]}"` : ''}>${title}</h2>
          ${score}
          <div class="row"><button class="btn ghost" data-exit>Salir</button><button class="btn primary" data-again>↻ Revancha</button></div>
        </div>`)
      const again = el.querySelector<HTMLButtonElement>('[data-again]')!
      again.addEventListener('click', () => {
        rematch()
        if (how.mode === 'guest') {
          again.disabled = true
          again.textContent = 'Esperando…'
        }
      })
      if (me === null || w === me) ctx.confetti(el.querySelector('canvas')!)
    }
    const stop = runDuel(canvas, factory, how, {
      onEnd,
      onRestart: dropOverlay,
      onDisconnect: () =>
        show(`<div class="results-card"><span class="results-emoji">📵</span><h2>Se ha cortado la conexión</h2><p class="muted">Tu amigo ha salido o se ha quedado sin cobertura.</p><div class="row"><button class="btn primary" data-exit>Salir</button></div></div>`),
    })
    function exit(): void {
      stop()
      screen.remove()
      document.body.classList.remove('is-playing')
      ctx.pauseCover(false)
    }
    screen.querySelector('[data-quit]')!.addEventListener('click', exit)
  }

  return { menu, askCode, join }
}
