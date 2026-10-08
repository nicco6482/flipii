export declare const STAGE_FLOORS: number[]
export declare const TOTAL_FLOORS: number
export declare const SCORE: {
  floor: number
  maxMultiplier: number
  smash: number
  nearMiss: number
  stageClear: number
  finish: number
  parSeconds: number
  perSecond: number
}
export declare const MIN_MS_PER_FLOOR: number
export declare const MAX_RUN_MS: number
export declare const MAX_SCORE: number
export declare const RULES_VERSION: string
export declare const BOARD_ID: string
export declare const DAY_OFFSET_HOURS: number
export declare function boardDay(nowMs?: number): string
export declare function floorPoints(chain: number): number
export declare function stagesCleared(floors: number): number
export declare function stageBonusTotal(stages: number): number
export declare function finishBonus(seconds: number): number
export declare function checkRun(run: { score: number; durationMs: number; floors: number }): string | null
