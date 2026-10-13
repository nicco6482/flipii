// Player-facing info for every minigame: name, look, how to play and how its score reads.
import type { GameId } from '../../server/weflipi-games.mjs'
import type { Factory } from './engine'
import { apilar } from './games/apilar'
import { basket } from './games/basket'
import { billar } from './games/billar'
import { futbolin } from './games/futbolin'
import { hockey } from './games/hockey'
import { penaltis } from './games/penaltis'
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
import { orbita } from './games/orbita'
import { ecos } from './games/ecos'
import { rebote } from './games/rebote'

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
  reflejos: { id: 'reflejos', name: 'Reflejos', emoji: '⚡', color: '#2bd47d', how: 'Toca en cuanto la pantalla se ponga VERDE (¡el azul es trampa!). 5 rondas; gana la media más baja.', unit: n => `${n} ms`, factory: reflejos },
  apilar: { id: 'apilar', name: 'Apilar', emoji: '🧱', color: '#ff9f43', how: 'Suelta cada bloque justo encima del anterior. Cada piso va más rápido y lo que sobresale se corta.', unit: n => plural(n, 'piso', 'pisos'), factory: apilar },
  coches: { id: 'coches', name: 'Coches', emoji: '🏎️', color: '#ff5f7e', how: 'Cambia de carril para esquivar el tráfico. No para de acelerar.', unit: n => `${n} m`, factory: coches },
  dardos: { id: 'dardos', name: 'Dardos', emoji: '🎯', color: '#e0244e', how: '9 dardos. Mantén para apuntar y suelta. Cada dardo te tiembla más el pulso.', unit: n => `${n} pts`, factory: dardos },
  flappy: { id: 'flappy', name: 'Flappy', emoji: '🐤', color: '#ffd35c', how: 'Toca para aletear entre las tuberías. Cada vez más rápido y más estrecho.', unit: n => plural(n, 'tubería', 'tuberías'), factory: flappy },
  bolos: { id: 'bolos', name: 'Bolos', emoji: '🎳', color: '#7ef9ff', how: '5 tiradas de 2 bolas. Desliza hacia arriba para lanzar; la pista tiene efecto y cada vez más.', unit: n => `${n} pts`, factory: bolos },
  golf: { id: 'golf', name: 'Minigolf', emoji: '⛳', color: '#46ad61', how: '3 hoyos con barreras móviles. Arrastra hacia atrás y suelta. Gana quien use menos golpes.', unit: n => plural(n, 'golpe', 'golpes'), factory: golf },
  calculo: { id: 'calculo', name: 'Cálculo', emoji: '🧮', color: '#5b8cff', how: '60 segundos de cuentas rápidas. Toca la respuesta buena; fallar resta.', unit: n => plural(n, 'acierto', 'aciertos'), factory: calculo },
  dados: { id: 'dados', name: 'Dados', emoji: '🎲', color: '#2bb35a', how: '5 dados que giran cada vez más rápido. Tócalos justo en el 6.', unit: n => `${n} pts`, factory: dados },
  toques: { id: 'toques', name: 'Toques', emoji: '⚽', color: '#3fbf4f', how: 'Toca el balón para que no caiga al suelo. ¿Cuántos toques aguantas?', unit: n => plural(n, 'toque', 'toques'), factory: toques },
  colores: { id: 'colores', name: 'Colores', emoji: '🎨', color: '#ff5fb0', how: 'Pulsa el color de la TINTA, no el de la palabra. Cada vez tienes menos tiempo.', unit: n => plural(n, 'acierto', 'aciertos'), factory: colores },
  cortar: { id: 'cortar', name: 'Cortar', emoji: '🍉', color: '#ff7a45', how: 'Corta la fruta deslizando; sale cada vez más rápido. Bomba o 3 caídas y se acabó.', unit: n => `${n} pts`, factory: cortar },
  cronometro: { id: 'cronometro', name: 'Cronómetro', emoji: '⏱️', color: '#7ef9ff', how: 'Para el reloj en 10,00 s a ciegas. 3 rondas: cada vez se esconde antes.', unit: n => `${(n / 1000).toFixed(2).replace('.', ',')} s de error`, factory: cronometro },
  deslizar: { id: 'deslizar', name: 'Deslizar', emoji: '👆', color: '#a77bff', how: 'Flecha verde: hacia ella. Roja: al revés. Cada flecha te da menos tiempo.', unit: n => plural(n, 'acierto', 'aciertos'), factory: deslizar },
  vasos: { id: 'vasos', name: 'Vasos', emoji: '🥤', color: '#e0503a', how: 'Sigue la bola mientras se mezclan los vasos. Cada ronda, más rápido.', unit: n => plural(n, 'ronda', 'rondas'), factory: vasos },
  ladrillos: { id: 'ladrillos', name: 'Ladrillos', emoji: '🕹️', color: '#ff9f43', how: 'Rompe los ladrillos con la pala; la bola no para de acelerar. Si se escapa, fin.', unit: n => `${n} pts`, factory: ladrillos },
  basket: { id: 'basket', name: 'Basket', emoji: '🏀', color: '#ff7a2e', how: 'Desliza hacia arriba para tirar. Limpia vale 3, con rebote 2, y 3 seguidas duplican. El aro acaba moviéndose.', unit: n => `${n} pts`, factory: basket },
  penaltis: { id: 'penaltis', name: 'Penaltis', emoji: '🥅', color: '#2bd47d', how: '10 penaltis. Desliza para chutar; en curva hace efecto. Escuadra vale 2. El portero mejora cada tiro.', unit: n => `${n} pts`, factory: penaltis },
  hockey: { id: 'hockey', name: 'Hockey', emoji: '🏒', color: '#5b8cff', how: 'Hockey de aire contra la máquina: arrastra tu mazo y marca. Ella va cada vez más rápido. 60 s.', unit: n => `${n} ${n === 1 ? 'gol' : 'goles'}`, factory: hockey },
  futbolin: { id: 'futbolin', name: 'Futbolín', emoji: '🏟️', color: '#34a653', how: 'Futbolín contra la máquina: desliza para mover tus barras amarillas y toca para chutar. 60 s.', unit: n => `${n} ${n === 1 ? 'gol' : 'goles'}`, factory: futbolin },
  billar: { id: 'billar', name: 'Billar', emoji: '🎱', color: '#1fa463', how: 'Mete todas las bolas que puedas en 90 s. Arrastra atrás para apuntar; varias de un tiro suman más.', unit: n => `${n} pts`, factory: billar },
  orbita: { id: 'orbita', name: 'Órbita', emoji: '☄️', color: '#7ef9ff', how: 'Cambia de carril para esquivar las rocas espaciales. Cada metro cuenta.', unit: n => `${n} m`, factory: orbita },
  ecos: { id: 'ecos', name: 'Ecos', emoji: '🔊', color: '#ff6584', how: 'Mira cómo se iluminan los bloques y repite la secuencia. Cada pulso suma.', unit: n => plural(n, 'secuencia', 'secuencias'), factory: ecos },
  rebote: { id: 'rebote', name: 'Rebote', emoji: '🏓', color: '#7ef9ff', how: 'Mueve la paleta, mantén viva la pelota y rompe todos los bloques.', unit: n => plural(n, 'bloque', 'bloques'), factory: rebote },
}
