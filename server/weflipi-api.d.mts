export type Store = { exec(commands: (string | number)[][]): Promise<unknown[]> }
export type ApiRequest = { method: string; query?: Record<string, string>; body?: unknown; auth?: string; ip?: string }
export declare const MAX_GROUPS_PER_PLAYER: number
export declare const MAX_MEMBERS: number
export declare function upstashStore(url: string, token: string): Store
export declare function memoryStore(): Store
export declare function storeFromEnv(env?: Record<string, string | undefined>): Store | null
export declare function cleanName(raw: unknown, max?: number): string
export declare function handle(store: Store | null, req: ApiRequest, now?: number): Promise<{ status: number; body: any }>
export declare function nodeHandler(store: Store | null, req: unknown, res: unknown): Promise<void>
export declare function upstashCredentials(env?: Record<string, string | undefined>): { url: string; token: string } | null
export declare function databaseEnvNames(env?: Record<string, string | undefined>): string[]
