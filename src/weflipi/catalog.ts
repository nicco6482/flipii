// Player-facing info for every minigame: name, look, how to play and how its score reads.
import type { GameId } from '../../server/weflipi-games.mjs'
import type { Factory } from './engine'
import { apilar } from './games/apilar'
import { calculo } from './games/calculo'
import { colores } from './games/colores'
import { cortar } from './games/cortar'
import { cronometro } from './games/cronometro'
import { dados } from './games/dados'
import { deslizar } from './games/deslizar'
import { ladrillos } from './games/ladrillos'
import { toques } from './games/toques'
import { vasos } from './games/vasos'
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
  calculo: { id: 'calculo', name: 'Cálculo', emoji: '🧮', color: '#5b8cff', how: '60 segundos de cuentas rápidas. Toca la respuesta buena; fallar resta.', unit: n => plural(n, 'acierto', 'aciertos'), factory: calculo },
  dados: { id: 'dados', name: 'Dados', emoji: '🎲', color: '#2bb35a', how: '5 dados que giran cada vez más rápido. Tócalos justo en el 6.', unit: n => `${n} pts`, factory: dados },
  toques: { id: 'toques', name: 'Toques', emoji: '⚽', color: '#3fbf4f', how: 'Toca el balón para que no caiga al suelo. ¿Cuántos toques aguantas?', unit: n => plural(n, 'toque', 'toques'), factory: toques },
  colores: { id: 'colores', name: 'Colores', emoji: '🎨', color: '#ff5fb0', how: 'Pulsa el color de la TINTA, no el de la palabra. 45 segundos.', unit: n => plural(n, 'acierto', 'aciertos'), factory: colores },
  cortar: { id: 'cortar', name: 'Cortar', emoji: '🍉', color: '#ff7a45', how: 'Desliza para cortar la fruta. Si tocas una bomba o se caen 3, se acabó.', unit: n => `${n} pts`, factory: cortar },
  cronometro: { id: 'cronometro', name: 'Cronómetro', emoji: '⏱️', color: '#7ef9ff', how: 'Para el reloj en 10,00 s… pero a los 3 segundos se esconde. 3 rondas.', unit: n => `${(n / 1000).toFixed(2).replace('.', ',')} s de error`, factory: cronometro },
  deslizar: { id: 'deslizar', name: 'Deslizar', emoji: '👆', color: '#a77bff', how: 'Flecha verde: desliza hacia ella. Flecha roja: al revés. 30 segundos.', unit: n => plural(n, 'acierto', 'aciertos'), factory: deslizar },
  vasos: { id: 'vasos', name: 'Vasos', emoji: '🥤', color: '#e0503a', how: 'Sigue la bola mientras se mezclan los vasos. Cada ronda, más rápido.', unit: n => plural(n, 'ronda', 'rondas'), factory: vasos },
  ladrillos: { id: 'ladrillos', name: 'Ladrillos', emoji: '🕹️', color: '#ff9f43', how: 'Rompe todos los ladrillos con la pala. Si se te escapa la bola, fin.', unit: n => `${n} pts`, factory: ladrillos },
}
