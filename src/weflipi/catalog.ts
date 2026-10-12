// Player-facing info for every minigame: name, look, how to play and how its score reads.
import type { GameId } from '../../server/weflipi-games.mjs'
import type { Factory } from './engine'
import { apilar } from './games/apilar'
import { bolos } from './games/bolos'
import { coches } from './games/coches'
import { dardos } from './games/dardos'
import { flappy } from './games/flappy'
import { golf } from './games/golf'
import { reflejos } from './games/reflejos'

export type GameInfo = {
  id: GameId
  name: string
  emoji: string
  color: string
  how: string
  /** Formats a score for rankings ("243 ms", "12 pisos"). */
  unit: (n: number) => string
  /** 2D games run in the hub; Helix Drift is its own 3D page. */
  factory: Factory | null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const CATALOG: Record<GameId, GameInfo> = {
  helix: { id: 'helix', name: 'Helix Drift', emoji: '🌀', color: '#a77bff', how: 'Gira la torre y deja caer la bola por los huecos hasta abajo.', unit: n => `${n} pts`, factory: null },
  reflejos: { id: 'reflejos', name: 'Reflejos', emoji: '⚡', color: '#2bd47d', how: 'Toca en cuanto la pantalla se ponga verde. 5 rondas; gana la media más baja.', unit: n => `${n} ms`, factory: reflejos },
  apilar: { id: 'apilar', name: 'Apilar', emoji: '🧱', color: '#ff9f43', how: 'Suelta cada bloque justo encima del anterior. Lo que sobresale se corta.', unit: n => plural(n, 'piso', 'pisos'), factory: apilar },
  coches: { id: 'coches', name: 'Coches', emoji: '🏎️', color: '#ff5f7e', how: 'Cambia de carril para esquivar el tráfico. Cada vez más rápido.', unit: n => `${n} m`, factory: coches },
  dardos: { id: 'dardos', name: 'Dardos', emoji: '🎯', color: '#e0244e', how: '9 dardos. Mantén para apuntar y suelta para lanzar. ¡A por el triple 20!', unit: n => `${n} pts`, factory: dardos },
  flappy: { id: 'flappy', name: 'Flappy', emoji: '🐤', color: '#ffd35c', how: 'Toca para aletear y pasa entre las tuberías sin chocarte.', unit: n => plural(n, 'tubería', 'tuberías'), factory: flappy },
  bolos: { id: 'bolos', name: 'Bolos', emoji: '🎳', color: '#7ef9ff', how: '5 tiradas de 2 bolas. Coloca la bola y desliza hacia arriba para lanzar.', unit: n => `${n} pts`, factory: bolos },
  golf: { id: 'golf', name: 'Minigolf', emoji: '⛳', color: '#46ad61', how: '3 hoyos. Arrastra hacia atrás y suelta. Gana quien use menos golpes.', unit: n => plural(n, 'golpe', 'golpes'), factory: golf },
}
