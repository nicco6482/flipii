// Vercel Node function for the weflipi API (/api/weflipi?a=...). Storage: Upstash Redis.
import { nodeHandler, storeFromEnv } from '../server/weflipi-api.mjs'

const store = storeFromEnv()

export default function handler(req, res) {
  return nodeHandler(store, req, res)
}
