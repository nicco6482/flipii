// The real-time 1 vs 1 games. Loaded on demand so the daily hub stays light.
import type { DuelInfo } from './core'

export const DUELS: DuelInfo[] = [
  { id: 'hockey', name: 'Hockey de aire', emoji: '🏒', color: '#5b8cff', how: 'Cada uno arrastra su mazo en su campo. Gana el primero en llegar a 7 goles.', factory: () => import('./games/hockey').then(m => m.hockeyDuel) },
  { id: 'futbolin', name: 'Futbolín', emoji: '🏟️', color: '#34a653', how: 'Desliza para mover tus barras y toca para chutar con todas. Gana el primero en meter 5.', factory: () => import('./games/futbolin').then(m => m.futbolinDuel) },
  { id: 'pong', name: 'Pong', emoji: '🏓', color: '#7ef9ff', how: 'Mueve tu pala. Cada golpe acelera la bola y los bordes la mandan de lado. A 7 puntos.', factory: () => import('./games/pong').then(m => m.pongDuel) },
  { id: 'penaltis', name: 'Penaltis', emoji: '🥅', color: '#2bd47d', how: 'Por turnos: uno chuta deslizando y el otro para moviendo el dedo. 5 cada uno y muerte súbita.', factory: () => import('./games/penaltis').then(m => m.penaltisDuel) },
]

export const duelById = (id: string) => DUELS.find(d => d.id === id) ?? null
