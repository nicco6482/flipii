import './styles/main.css'
import { STAGE_FLOORS, TOTAL_FLOORS, boardDay } from '../server/helix-rules.mjs'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { initPhysics } from './engine/physics'
import { Renderer, suggestQuality } from './engine/renderer'
import { SaveStore, type Locale, type Quality } from './engine/save'
import { Game, type RunKind, type RunResult } from './game/game'
import { dailySeed } from './game/level'
import { THEMES } from './game/theme'
import { Leaderboard, cleanName, type BoardData, type Receipt } from './online/leaderboard'
import { challengeUrl, copyText, drawCard, readChallenge } from './online/share'
import { UI } from './ui/ui'

async function boot(): Promise<void> {
  const save = new SaveStore()
  if (!localStorage.getItem('game3d.save')) save.update({ quality: suggestQuality() })
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const input = new Input(canvas)
  input.sensitivity = save.data.sensitivity
  const audio = new Audio()
  const applyVolumes = () => audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
  applyVolumes()
  const lb = new Leaderboard()
  const challenge = readChallenge()

  const handlers: Record<string, (el: HTMLElement) => void> = {}
  const ui = new UI(i18n, save, input, handlers)
  ui.bootProgress(0.2)
  await initPhysics()
  ui.bootProgress(0.7)

  // Stable nickname: the saved one, or an auto name the player can change on the results screen.
  if (!save.data.playerName) save.update({ playerName: `${i18n.locale === 'zh-CN' ? '玩家' : 'Player'}${Math.floor(1000 + Math.random() * 9000)}` })

  const renderer = new Renderer(canvas, save.data.quality)
  let day = boardDay()
  let lastKind: RunKind = 'daily'
  let runId: Promise<string | null> = Promise.resolve(null)
  let lastRun: RunResult | null = null
  let lastReceipt: Receipt | null = null
  let lastWasBest = false
  let resultsTimer = 0
  let boardPeriod: 'today' | 'all' = 'today'
  let shareUrl = ''
  let shareBlob: Blob | null = null

  const target = () => (challenge ? { name: challenge.name, score: challenge.score } : null)

  const game = new Game(renderer, input, audio, {
    popup: (text, kind) => ui.popup(text, kind, game.ballScreen()),
    flash: (color, strength) => strength > 0.02 && ui.flash(color, strength),
    smashMode: on => ui.smashMode(on),
    chain: n => ui.chain(n),
    stage: (stage, theme) => ui.stageBanner(stage, theme.accent),
    scored: () => undefined,
    end: run => onEnd(run),
    startRequest: () => {
      if (ui.screen === 'title' && !ui.modal) startRun('daily')
    },
  })
  game.setQuality(save.data.quality)
  game.reducedMotion = save.data.reducedMotion
  game.targetScore = challenge?.score ?? 0

  const dailyBestToday = () => (save.data.dailyDay === day ? save.data.dailyBest : 0)

  function refreshTitle(): void {
    ui.setTitle({ day, best: save.data.best, todayBest: dailyBestToday(), challenge: target() })
  }

  async function refreshTitleTop(retry = true): Promise<void> {
    try {
      const data = await lb.board('today', 5)
      if (lb.serverDay && lb.serverDay !== day) {
        day = lb.serverDay
        refreshTitle()
      }
      ui.setTitleTop(data, false, lb.playerId)
    } catch {
      ui.setTitleTop(null, true, null)
      if (retry) window.setTimeout(() => ui.screen === 'title' && void refreshTitleTop(false), 4000)
    }
  }

  function startRun(kind: RunKind): void {
    audio.unlock()
    audio.startMusic()
    window.clearTimeout(resultsTimer)
    lastKind = kind
    lastReceipt = null
    lastRun = null
    ui.clearPopups()
    if (ui.modal) ui.closeModal()
    game.personalBest = save.data.best
    if (kind === 'daily') {
      day = lb.serverDay ?? boardDay()
      game.start('daily', dailySeed(day), day)
      runId = lb.startRun(save.data.playerName, day)
    } else {
      game.start('practice', (Math.random() * 2 ** 32) >>> 0, '')
      runId = Promise.resolve(null)
    }
    ui.show('hud')
    ui.touchHint(save.data.plays < 2 && document.body.classList.contains('is-touch'))
    loop.resetAccumulator()
  }

  function toTitle(): void {
    window.clearTimeout(resultsTimer)
    if (ui.modal) ui.closeModal()
    ui.clearPopups()
    day = lb.serverDay ?? boardDay()
    game.toTitle('daily', dailySeed(day), day)
    refreshTitle()
    ui.show('title')
    void refreshTitleTop()
  }

  function onEnd(run: RunResult): void {
    lastRun = run
    const prevBest = save.data.best
    lastWasBest = run.score > prevBest && run.score > 0
    const patch: Partial<typeof save.data> = { plays: save.data.plays + 1, best: Math.max(prevBest, run.score) }
    if (run.kind === 'daily') {
      if (save.data.dailyDay !== run.seedDay) Object.assign(patch, { dailyDay: run.seedDay, dailyBest: run.score })
      else patch.dailyBest = Math.max(save.data.dailyBest, run.score)
    }
    save.update(patch)
    const t = i18n.t.bind(i18n)
    let note = ''
    const tg = target()
    if (tg) note = run.score > tg.score ? t('results.targetBeat', { name: tg.name || t('challenge.anon'), score: tg.score }) : t('results.targetMiss', { name: tg.name || t('challenge.anon'), score: tg.score, diff: tg.score - run.score })
    else if (!lastWasBest && prevBest > 0 && prevBest - run.score <= Math.max(40, prevBest * 0.15)) note = t('results.nearBest', { diff: prevBest - run.score })
    const show = () => {
      ui.showResults({
        won: run.outcome === 'won',
        score: run.score,
        newBest: lastWasBest,
        floors: run.floors,
        chain: run.bestChain,
        smashes: run.smashes,
        seconds: run.durationMs / 1000,
        note,
        name: save.data.playerName,
        showName: run.kind === 'daily',
      })
    }
    // A short beat to watch the crash; Space restarts instantly even before the panel appears.
    resultsTimer = window.setTimeout(show, run.outcome === 'won' ? 1400 : 750)
    if (run.kind === 'practice') {
      ui.setOnline(`<p class="muted">${t('results.practice')}</p>`)
      return
    }
    ui.setOnline(`<p class="muted">${t('results.submitting')}</p>`)
    void submit(run)
  }

  async function submit(run: RunResult): Promise<void> {
    const t = i18n.t.bind(i18n)
    const id = await runId
    if (lastRun !== run) return
    if (!id) {
      ui.setOnline(`<p class="muted">${t(lb.serverDay && lb.serverDay !== run.seedDay ? 'results.staleDay' : 'results.offline')}</p>`)
      return
    }
    const res = await lb.submit(id, { score: run.score, durationMs: run.durationMs, floors: run.floors })
    if (lastRun !== run) return
    if (!res.ok) {
      ui.setOnline(`<p class="muted">${t(res.reason === 'rejected' ? 'results.rejected' : res.reason === 'stale' ? 'results.staleDay' : 'results.offline')}</p>`)
      return
    }
    lastReceipt = res.receipt
    const today = res.receipt.today
    const all = res.receipt.all
    const parts: string[] = []
    if (today) {
      parts.push(`<div class="rank-main"><span>${t('results.rankToday', { rank: `<b>${today.rank}</b>` })}</span><small>${t('results.rankTotal', { total: today.total })}</small></div>`)
      parts.push(`<div class="rank-pct">${t('results.beat', { pct: `<b>${today.percentile}</b>` })}</div>`)
    }
    parts.push(`<div class="rank-all">${t('results.rankAll', { rank: all.rank })} · ${t('results.rankTotal', { total: all.total })}</div>`)
    ui.setOnline(parts.join(''))
  }

  async function openShare(): Promise<void> {
    if (!lastRun) return
    const t = i18n.t.bind(i18n)
    const run = lastRun
    const theme = THEMES[Math.min(run.stage, THEMES.length - 1)]
    shareUrl = challengeUrl(run.score, save.data.playerName, run.kind === 'daily' ? run.seedDay : null)
    const today = lastReceipt?.today
    const display = getComputedStyle(document.documentElement).getPropertyValue('--display') || 'sans-serif'
    const { blob, url } = await drawCard({
      title: t('title.name'),
      sub: t('title.sub'),
      score: run.score,
      modeLine: run.kind === 'daily' ? t('share.cardDaily', { day: run.seedDay }) : t('share.cardPractice'),
      rankLine: today ? t('share.cardRank', { rank: today.rank, pct: today.percentile }) : null,
      statsLine: t('share.cardStats', { floors: run.floors, chain: run.bestChain, sec: Math.round(run.durationMs / 1000) }),
      call: t('share.cardCall'),
      scan: t('share.cardScan'),
      url: shareUrl,
      name: save.data.playerName,
      colors: { sky: theme.sky, low: theme.skyLow, safe: theme.safe, safeAlt: theme.safeAlt, accent: theme.accent },
      display,
    })
    shareBlob = blob
    const file = new File([blob], 'helix-drop.png', { type: 'image/png' })
    const canShare = !!navigator.canShare?.({ files: [file] })
    ui.setShare(url, shareUrl, canShare)
    ui.openModal('share')
  }

  async function copyChallenge(): Promise<void> {
    if (!lastRun) return
    const t = i18n.t.bind(i18n)
    shareUrl = challengeUrl(lastRun.score, save.data.playerName, lastRun.kind === 'daily' ? lastRun.seedDay : null)
    const ok = await copyText(`${t('share.text', { score: lastRun.score })} ${shareUrl}`)
    ui.toast(t(ok ? 'share.copied' : 'share.copyFail'), ui.modal === 'share' ? 'share' : 'results')
  }

  async function openBoard(period: 'today' | 'all'): Promise<void> {
    boardPeriod = period
    if (ui.modal !== 'board') ui.openModal('board')
    ui.setBoard(period, 'loading', lb.playerId)
    try {
      const data: BoardData = await lb.board(period, 50)
      if (boardPeriod === period) ui.setBoard(period, data, lb.playerId)
    } catch {
      if (boardPeriod === period) ui.setBoard(period, 'error', lb.playerId)
    }
  }

  function pause(): void {
    if (game.mode !== 'playing') return
    game.pause()
    ui.openModal('pause')
  }

  function resume(): void {
    if (ui.modal) ui.closeModal()
    game.resume()
    loop.resetAccumulator()
  }

  Object.assign(handlers, {
    daily: () => startRun('daily'),
    practice: () => startRun('practice'),
    restart: () => startRun(lastKind),
    title: () => toTitle(),
    pause: () => pause(),
    resume: () => resume(),
    board: () => void openBoard('today'),
    boardToday: () => void openBoard('today'),
    boardAll: () => void openBoard('all'),
    settings: () => ui.openModal('settings'),
    share: () => void openShare(),
    copy: () => void copyChallenge(),
    systemShare: () => {
      if (!shareBlob || !lastRun) return
      const file = new File([shareBlob], 'helix-drop.png', { type: 'image/png' })
      void navigator.share?.({ files: [file], text: `${i18n.t('share.text', { score: lastRun.score })} ${shareUrl}` }).catch(() => undefined)
    },
    closeModal: () => {
      if (ui.modal === 'settings' && game.mode === 'paused') {
        ui.openModal('pause')
        return
      }
      if (ui.modal === 'pause') resume()
      else ui.closeModal()
    },
    lang: (el: HTMLElement) => {
      const locale = el.dataset.value as Locale
      save.update({ locale })
      i18n.set(locale)
      refreshTitle()
      void refreshTitleTop()
    },
    quality: (el: HTMLElement) => {
      save.update({ quality: el.dataset.value as Quality })
      game.setQuality(save.data.quality)
      ui.syncSettings(save.data)
    },
    toggle: (el: HTMLElement) => {
      const key = el.dataset.value as 'muted' | 'reducedMotion'
      save.update({ [key]: !save.data[key] })
      game.reducedMotion = save.data.reducedMotion
      applyVolumes()
      ui.syncSettings(save.data)
    },
  })
  ui.onSetting((key, value) => {
    save.update({ [key]: value })
    input.sensitivity = save.data.sensitivity
    applyVolumes()
  })
  ui.nameForm(async raw => {
    const name = cleanName(raw)
    if (!name) return
    save.update({ playerName: name })
    const ok = await lb.rename(name)
    if (ok) ui.nameSaved()
    else ui.toast(i18n.t('results.offline'))
  })

  const loop = new GameLoop({
    step: dt => game.step(dt),
    render: (alpha, frame) => {
      routeActions()
      game.attractStarts = ui.screen === 'title' && !ui.modal
      game.render(alpha, frame)
      if (ui.screen === 'hud') {
        const s = game.sim
        ui.setHud({ score: s.score, best: save.data.best, stage: s.stage, stages: STAGE_FLOORS.length, depth: s.floors / TOTAL_FLOORS, practice: game.kind === 'practice', target: target() })
      }
      input.endFrame()
      input.update()
    },
  })

  function routeActions(): void {
    const typing = (document.activeElement as HTMLElement | null)?.matches?.('input:not([readonly])')
    if (input.consume('pause')) {
      if (ui.modal === 'pause') resume()
      else if (ui.modal) handlers.closeModal(document.body)
      else if (ui.screen === 'hud') pause()
    }
    if (input.consume('back')) {
      if (ui.modal) handlers.closeModal(document.body)
      else if (ui.screen === 'results') toTitle()
    }
    if (ui.screen !== 'hud' || ui.modal) {
      if (input.consume('navUp') || input.consume('navLeft')) ui.nav(-1)
      if (input.consume('navDown') || input.consume('navRight')) ui.nav(1)
      if (input.consume('select') && !typing) ui.select()
    }
    if (input.consume('share') && ui.screen === 'results' && !ui.modal) void openShare()
    if (input.consume('confirm') && !typing) {
      if (ui.modal === 'pause') resume()
      else if (ui.modal) return
      else if (ui.screen === 'title') startRun('daily')
      else if (ui.screen === 'results' || (ui.screen === 'hud' && game.mode === 'ended')) startRun(lastKind)
    }
    // During play the pad's A button restarts after a crash as well.
    if (ui.screen === 'hud' && game.mode === 'ended' && input.consume('select')) startRun(lastKind)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  const firstGesture = () => {
    audio.unlock()
    audio.startMusic()
  }
  window.addEventListener('pointerdown', firstGesture, { once: true })
  window.addEventListener('keydown', firstGesture, { once: true })

  ui.bootProgress(1)
  toTitle()
  input.update()
  loop.start()
  // Probe the leaderboard in the background; the game never waits for it.
  void lb.probe().then(() => {
    if (lb.serverDay && lb.serverDay !== day && ui.screen === 'title') toTitle()
  })
  ;(window as unknown as { __helix: unknown }).__helix = { game, ui, lb, save, input }
}

void boot()
