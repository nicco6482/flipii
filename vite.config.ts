import { manusGameTuning } from './scripts/manus-tuning/vite.mjs'
import { loadEnv, type Plugin } from 'vite'
import { memoryStore, nodeHandler, storeFromEnv } from './server/weflipi-api.mjs'
import { defineConfig } from 'vitest/config'

/**
 * Serves /api/weflipi during `vite dev` and `vite preview` with the same handler as the Vercel
 * function. Uses Upstash when its env vars are set, otherwise an in-memory store (reset on restart).
 */
function weflipiApi(env: Record<string, string>): Plugin {
  const store = storeFromEnv(env) ?? memoryStore()
  // Connect strips the mount path but keeps the query string, which is all the handler reads.
  // Block body on purpose: a function returned from configureServer would be run as a post hook.
  const mount = (server: { middlewares: { use: (path: string, fn: (req: unknown, res: unknown) => void) => unknown } }) => {
    server.middlewares.use('/api/weflipi', (req, res) => void nodeHandler(store, req, res))
  }
  return { name: 'weflipi-api', configureServer: mount, configurePreviewServer: mount }
}

// Relative base keeps production output portable; the Session owns preview HOST/PORT.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['HOST', 'PORT', 'HELIX_API_PROXY', 'KV_REST_API_', 'UPSTASH_REDIS_REST_'])
  // Opt-in only: forward /api to a local test backend during development.
  const apiProxy = env.HELIX_API_PROXY ? { '/api': { target: env.HELIX_API_PROXY, changeOrigin: true } } : undefined
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return {
    base: './',
    plugins: [manusGameTuning(), weflipiApi(env)],
    server: {
      host: env.HOST ?? '127.0.0.1', port, strictPort: true, proxy: apiProxy,
      allowedHosts: ['.manuspre.computer', '.manus.computer', '.manus-asia.computer', '.manuscomputer.ai', '.manusvm.computer', 'localhost', '127.0.0.1'],
    },
    build: {
      target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false,
      rollupOptions: { input: { main: 'index.html', helix: 'helix.html' } },
    },
    test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
  }
})
