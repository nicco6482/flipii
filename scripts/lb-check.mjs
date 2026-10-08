// Leaderboard protocol check against a running backend (local test DB or a deployed Preview).
// Usage: node scripts/lb-check.mjs http://127.0.0.1:8787
const base = `${(process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '')}/api/leaderboards/v1`
const j = async (method, path, body, token) => {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return [r.status, await r.json().catch(() => ({}))]
}
const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
let failures = 0
const expect = (label, ok, info) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${info ? ` — ${info}` : ''}`)
  if (!ok) failures += 1
}
const [hs, health] = await j('GET', '/health')
expect('health', hs === 200, JSON.stringify(health))
const tag = Math.random().toString(36).slice(2, 6)
const players = []
for (const [name, score, floors] of [[`测试A${tag}`, 300, 10], [`TestB${tag}`, 700, 14], [`测试C${tag}`, 1200, 22]]) {
  const [gs, g] = await j('POST', '/guests', { displayName: name })
  const [rs, run] = await j('POST', '/boards/helix-v1/runs', { protocolVersion: 1, rulesVersion: 'v1', mode: 'daily', seedDay: day }, g.token)
  const [ss, rec] = await j('PUT', `/runs/${run.runId}`, { score, durationMs: 4000, floors }, g.token)
  expect(`submit ${name} ${score}`, gs === 201 && rs === 201 && ss === 200 && rec.accepted, JSON.stringify({ all: rec.all, today: rec.today }))
  const [again, rec2] = await j('PUT', `/runs/${run.runId}`, { score, durationMs: 4000, floors }, g.token)
  expect('idempotent replay', again === 200 && rec2.accepted)
  players.push({ ...g, name, score })
}
const g = players[0]
const [, run] = await j('POST', '/boards/helix-v1/runs', { protocolVersion: 1, rulesVersion: 'v1', mode: 'daily', seedDay: day }, g.token)
expect('reject impossible score', (await j('PUT', `/runs/${run.runId}`, { score: 9000, durationMs: 4000, floors: 10 }, g.token))[0] === 422)
expect('reject too many floors too fast', (await j('PUT', `/runs/${run.runId}`, { score: 1000, durationMs: 2000, floors: 40 }, g.token))[0] === 422)
expect('reject duration longer than elapsed', (await j('PUT', `/runs/${run.runId}`, { score: 300, durationMs: 60000, floors: 10 }, g.token))[0] === 422)
expect('reject over max score', (await j('PUT', `/runs/${run.runId}`, { score: 25000, durationMs: 5000, floors: 90 }, g.token))[0] === 422)
expect('reject stale daily seed', (await j('POST', '/boards/helix-v1/runs', { protocolVersion: 1, rulesVersion: 'v1', mode: 'daily', seedDay: '2000-01-01' }, g.token))[0] === 409)
expect('reject old client', (await j('POST', '/boards/helix-v1/runs', { protocolVersion: 1, rulesVersion: 'v0', mode: 'daily', seedDay: day }, g.token))[0] === 426)
expect('reject missing token', (await j('POST', '/boards/helix-v1/runs', { protocolVersion: 1, rulesVersion: 'v1', mode: 'daily', seedDay: day }))[0] === 401)
const [rn] = await j('PUT', '/players/me', { displayName: `改名${tag}` }, g.token)
expect('rename', rn === 200)
const [ts, today] = await j('GET', '/boards/helix-v1?period=today&limit=10', null, g.token)
expect('today board', ts === 200 && today.total >= 3 && today.myRank?.score === 300 && today.entries.some(e => e.displayName === `改名${tag}`), `total=${today.total} my=${JSON.stringify(today.myRank)}`)
const [as, all] = await j('GET', '/boards/helix-v1?limit=5')
expect('all-time board', as === 200 && all.entries.length > 0 && all.entries[0].score >= all.entries.at(-1).score, `total=${all.total}`)
// Random-seed runs count for the all-time board only.
const [, rr] = await j('POST', '/boards/helix-v1/runs', { protocolVersion: 1, rulesVersion: 'v1', mode: 'random' }, players[1].token)
const [rs2, rrec] = await j('PUT', `/runs/${rr.runId}`, { score: 1500, durationMs: 4500, floors: 25 }, players[1].token)
expect('random run → all-time only', rs2 === 200 && rrec.today === null && rrec.all.rank >= 1, JSON.stringify(rrec.all))
console.log(failures ? `${failures} failure(s)` : 'all leaderboard checks passed')
process.exit(failures ? 1 : 0)
