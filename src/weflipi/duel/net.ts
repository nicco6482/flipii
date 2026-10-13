// Online 1 vs 1: the two phones talk directly over WebRTC. The API only passes the host's offer
// and the guest's answer along (Vercel has no sockets); after that nothing goes through the server.
import * as api from '../api'
import type { Link } from './runner'

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
const CONNECT_MS = 25_000

/** Wait until every ICE candidate is in the description, so one offer/answer swap is enough. */
function gathered(pc: RTCPeerConnection): Promise<string> {
  return new Promise(resolve => {
    const done = () => resolve(JSON.stringify(pc.localDescription))
    if (pc.iceGatheringState === 'complete') return done()
    const timer = setTimeout(done, 3000)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer)
        done()
      }
    })
  })
}

function opened(ch: RTCDataChannel, pc: RTCPeerConnection, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ch.readyState === 'open') return resolve()
    const timer = setTimeout(() => reject(new Error('no_connect')), CONNECT_MS)
    ch.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    })
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') {
        clearTimeout(timer)
        reject(new Error('no_connect'))
      }
    })
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    })
  })
}

function link(ch: RTCDataChannel, pc: RTCPeerConnection): Link {
  const closers: (() => void)[] = []
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    closers.forEach(fn => fn())
    try {
      ch.close()
      pc.close()
    } catch {
      /* already gone */
    }
  }
  ch.addEventListener('close', close)
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') close()
  })
  return {
    send(msg, lossy = false) {
      if (ch.readyState !== 'open') return
      // On a slow connection drop game frames rather than queueing them (the next one replaces it).
      if (lossy && ch.bufferedAmount > 64_000) return
      ch.send(JSON.stringify(msg))
    },
    onMessage(fn) {
      ch.addEventListener('message', e => {
        try {
          fn(JSON.parse(String(e.data)))
        } catch {
          /* ignore garbage */
        }
      })
    },
    onClose(fn) {
      closers.push(fn)
    },
    close,
  }
}

const fail = (code: string): never => {
  throw new Error(code)
}

/** Create a room: `onCode` gets the code to share; resolves once the friend is connected. */
export async function hostDuel(game: string, onCode: (code: string) => void, signal: AbortSignal): Promise<Link> {
  const pc = new RTCPeerConnection({ iceServers: ICE })
  signal.addEventListener('abort', () => pc.close())
  // Ordered (so a late frame never overwrites a newer one) and reliable (so rematch and results arrive).
  const ch = pc.createDataChannel('duel', { ordered: true })
  await pc.setLocalDescription(await pc.createOffer())
  const offer = await gathered(pc)
  const made = await api.createDuel(game, offer)
  if (!made.ok) return fail(made.error)
  onCode(made.data.code)
  // Wait for the friend's answer.
  for (;;) {
    if (signal.aborted) return fail('aborted')
    await new Promise(r => setTimeout(r, 1500))
    if (signal.aborted) return fail('aborted')
    const r = await api.getDuel(made.data.code)
    if (!r.ok) {
      if (r.error === 'offline') continue
      return fail(r.error)
    }
    if (r.data.answer) {
      await pc.setRemoteDescription(JSON.parse(r.data.answer))
      break
    }
  }
  await opened(ch, pc, signal)
  return link(ch, pc)
}

/** Look up a room before joining (which game, who made it). */
export async function peekDuel(code: string): Promise<api.DuelRoom> {
  const r = await api.getDuel(code)
  if (!r.ok) return fail(r.error)
  if (r.data.taken) return fail('duel_taken')
  if (!r.data.offer) return fail('own_duel')
  return r.data
}

export async function joinDuel(room: api.DuelRoom, signal: AbortSignal): Promise<Link> {
  const pc = new RTCPeerConnection({ iceServers: ICE })
  signal.addEventListener('abort', () => pc.close())
  const channel = new Promise<RTCDataChannel>(resolve => pc.addEventListener('datachannel', e => resolve(e.channel)))
  await pc.setRemoteDescription(JSON.parse(room.offer!))
  await pc.setLocalDescription(await pc.createAnswer())
  const answer = await gathered(pc)
  const r = await api.answerDuel(room.code, answer)
  if (!r.ok) return fail(r.error)
  const ch = await Promise.race([channel, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no_connect')), CONNECT_MS))])
  await opened(ch, pc, signal)
  return link(ch, pc)
}

export const webrtcOk = () => typeof RTCPeerConnection === 'function'
