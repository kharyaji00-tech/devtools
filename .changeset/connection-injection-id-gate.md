---
'@tanstack/devtools-vite': patch
'@tanstack/devtools-rspack': patch
---

Fix connection-injection so the `__TANSTACK_DEVTOOLS_PORT__`/`_HOST__`/`_PROTOCOL__` placeholders are replaced for the module ids bundlers actually produce. The previous module-id gate (`id.includes('@tanstack/devtools') || id.includes('@tanstack/event-bus')`) silently skipped Vite pre-bundled ids (e.g. `.vite/deps/@tanstack_devtools-event-bus_client.js`, shared `chunk-*.js`) and pnpm/yarn workspace realpath ids (`packages/event-bus/dist/.../client.js`, which lack the `@tanstack/` scope), leaving the placeholders unreplaced and making the browser-side event-bus client silently fall back to the `4206`/`localhost`/`http` defaults. The transform now relies on placeholder presence alone, which is a precise ownership check (these identifiers appear nowhere else in user code). This fixes the devtools server connection in HTTPS dev setups and whenever port 4206 is in use and the bus falls back to an OS-assigned port.
