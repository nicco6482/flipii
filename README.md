# Helix Drift

**Helix Drift** is a one-input 3D arcade tower-drop game built on the Manus `game-3d` Three.js + Rapier runtime. Rotate the helix tower and guide the bouncing ball through the gaps, all the way to the base. The remix preserves the supplied daily tower, practice mode, challenge sharing, same-origin leaderboard client, and English / Simplified Chinese localization.

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

## Leaderboard backend

The browser client uses relative `/api/leaderboards/v1/` paths and never embeds a server credential. The supplied backend source and `game-backend-contract.json` remain in the repository for the approved hybrid deployment path. The current Blueprint intentionally leaves online services unprovisioned, so local Preview treats unavailable leaderboard requests as offline while gameplay remains fully playable.

For local backend testing, set `HELIX_API_PROXY` to a compatible server URL before starting Vite; the development server then forwards `/api` requests without changing the production client paths.

## Localization and fonts

All player-facing strings are maintained in both `src/i18n/en.json` and `src/i18n/zh-CN.json`. The supplied Sora, Figtree and Noto Sans SC font files and their license notices are kept in `public/fonts/`.
