export type GameId = 'helix' | 'reflejos' | 'apilar' | 'coches' | 'dardos' | 'flappy' | 'bolos' | 'golf'
export type GameRule = { id: GameId; dir: 'asc' | 'desc'; min: number; max: number }
export type DayScore = { id: string; score: number }
export type Ranked = DayScore & { place: number; points: number }
export type SeasonRow = { id: string; points: number; wins: number; played: number }

export declare const GAMES: GameRule[]
export declare const GAME_IDS: GameId[]
export declare function gameById(id: string): GameRule | null
export declare const TIME_ZONE: string
export declare function today(nowMs?: number): string
export declare function msUntilNextDay(nowMs?: number): number
export declare function shiftDay(day: string, delta: number): string
export declare function gameOfDay(day: string): GameRule
export declare function weekStart(day: string): string
export declare function seasonDays(day: string): string[]
export declare function daySeed(day: string): number
export declare function isBetter(gameId: string, a: number, b: number): boolean
export declare function validScore(gameId: string, score: number): boolean
export declare const PLACE_POINTS: number[]
export declare function rankDay(gameId: string, scores: DayScore[]): Ranked[]
export declare function seasonTable(days: { day: string; scores: DayScore[] }[]): SeasonRow[]
