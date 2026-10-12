# Helix Drift — plan de integración

## Alcance

Remix del showcase suministrado **Helix Drop** sobre el proyecto inicializado `game-3d` de Three.js. Se conserva el bucle arcade de caída por torre helicoidal con un único input, la torre diaria, el cliente de leaderboard online, el modo práctica, compartir retos y el soporte completo de español e inglés.

## Implementación

- Fusionar `src/`, `public/fonts/`, `tests/`, scripts de comprobación y el backend/contratos del ZIP suministrado.
- Mantener la capa de runtime del starter: `scripts/manus-tuning/`, identidad de Preview, `vite.config.ts` con el plugin de tuning, build TypeScript/Vite y puerto administrado.
- Mantener el acceso same-origin del leaderboard mediante rutas relativas; el backend queda incluido como fuente y contrato de despliegue, pero no se habilitan servicios administrados en esta fase porque el Blueprint aprobado dejó `onlineFeatures` sin provisionar.
- Conservar `es.json` y `en.json` con claves equivalentes, fuentes Figtree/Sora y configuración de locale guardada.
- Reconciliar nombre de paquete, lockfile y configuración Vite con el proyecto `helixdrift`, añadiendo la dependencia de QR usada por compartir resultados.
- Mantener los controles de toque existentes y añadir una entrega móvil instalable con `manifest.webmanifest`, icono de inicio, metadatos iOS/Android, safe areas y tamaños táctiles adaptativos en orientación vertical y horizontal.

## Estructura

- `src/engine/`: loop, input, audio, física, renderer, assets, i18n y persistencia.
- `src/game/`: torre, niveles diarios, simulación, temas, efectos y coordinación de la partida.
- `src/online/`: leaderboard same-origin y tarjetas/retos compartibles.
- `src/ui/` y `src/styles/`: HUD, menús, modales, controles táctiles y estilo visual.
- `public/manifest.webmanifest` y `public/helix-drift-icon.svg`: instalación PWA e identidad de la app móvil.
- `server/`: reglas, contrato, migraciones y servidor de leaderboard preservados como fuente de despliegue.
- `scripts/`: smoke/build checks del juego más la integración administrada de tuning.

## Diseño preservado

La dirección visual suministrada — arcade 3D compacto, contraste alto, tipografía display y paneles HUD inclinados — se mantiene sin sustituir los assets o la identidad del juego original. Los controles responden a teclado, ratón, gamepad y touch según el código fuente entregado.

## Entrega

Validar con typecheck, tests, build y smoke cuando el servidor de Preview esté disponible. Versionar los archivos resultantes en `main` y empujar al repositorio GitHub indicado por el usuario.
