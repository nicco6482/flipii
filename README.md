# weflipi

**weflipi** is a daily minigame party for groups of friends, made by **nicco6482**. Every day (midnight, Spain time) a different minigame is on; everyone can play it as many times as they like until it changes, and only their best score counts. Friends create a group, share the invite link or 6-letter code, and compete on today's group ranking and a weekly season (Monday to Sunday: 10 / 8 / 6 / 5 / 4 / 3 / 2 points by daily place, 1 point just for playing).

Minigames: Helix Drift (3D), Reflejos, Apilar, Coches, Dardos, Flappy, Bolos and Minigolf. Any game can also be practised without counting.

## Turning on groups (Vercel + Upstash)

Groups need a small Redis database. In the Vercel project: **Storage → Create Database → Upstash (Redis) → Free plan → Connect to this project**, then redeploy. Vercel adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which `api/weflipi.js` reads (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work). Without them the games still work and the hub explains that groups are not active yet.

Locally, `pnpm dev` and `pnpm preview` serve the same API from memory (reset on restart), or from Upstash when those variables are in `.env.local`.

| Path | Responsibility |
| --- | --- |
| `index.html`, `src/weflipi/` | weflipi hub, API client and the 2D minigames (`games/`), all in a 400×700 canvas runtime (`engine.ts`). |
| `server/weflipi-games.mjs` | Shared rules: game rotation, day/season maths, score validation and points. |
| `server/weflipi-api.mjs`, `api/weflipi.js` | API (guest players, groups, scores, rankings) and its Vercel function. |
| `helix.html`, `src/main.ts`… | Helix Drift; its daily-tower runs count for weflipi on Helix days. |

---

## Helix Drift

**Helix Drift** is a one-input 3D arcade tower-drop game built on the Manus `game-3d` Three.js + Rapier runtime. Rotate the helix tower and guide the bouncing ball through the gaps, all the way to the base. The remix preserves the supplied daily tower, practice mode, challenge sharing, same-origin leaderboard client, and Spanish / English localization. Made by **nicco6482**.

## Development

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

The managed Preview runtime uses `HOST=0.0.0.0 PORT=3000 pnpm dev`. The production build is emitted to `dist/` with a relative base so it remains portable under Preview and published paths.

## Project layout

| Path | Responsibility |
| --- | --- |
| `src/engine/` | Fixed-step loop, unified input, audio, Rapier physics, renderer, saves and localization. |
| `src/game/` | Daily tower generation, simulation, themes, effects and gameplay orchestration. |
| `src/online/` | Relative-URL leaderboard client and share-card / challenge-link helpers. |
| `src/ui/` and `src/styles/` | HTML/CSS menus, HUD, results, settings, touch controls and responsive presentation. |
| `server/` | Preserved leaderboard rules, API implementation, migrations and deployment contract from the supplied source. |
| `scripts/` | Bundle checks, smoke/playtest helpers and the managed Preview tuning bridge. |

## Controls

Use **A / D**, **Left / Right**, or drag to rotate the tower. Press **Space** or use the daily button to start, **Escape** to pause, and use the touch controls on mobile. The daily tower is shared by players; practice runs remain unranked.

## Leaderboard backend (legacy, not deployed)

The browser client uses relative `/api/leaderboards/v1/` paths and never embeds a server credential. The supplied backend source and `game-backend-contract.json` remain in the repository for the approved hybrid deployment path. The current Blueprint intentionally leaves online services unprovisioned, so local Preview treats unavailable leaderboard requests as offline while gameplay remains fully playable.

For local backend testing, set `HELIX_API_PROXY` to a compatible server URL before starting Vite; the development server then forwards `/api` requests without changing the production client paths.

## Localization and fonts

All player-facing strings are maintained in both `src/i18n/es.json` (default) and `src/i18n/en.json` (used for English browsers). The supplied Sora and Figtree font files and their license notices are kept in `public/fonts/`.
