---
'@tanstack/devtools-vite': patch
---

Re-read `package.json` inside the `mounted` event handler instead of serving a snapshot captured once at dev-server startup. Vite does not restart the dev server when `package.json` changes, so the marketplace previously rebuilt its cards from stale dependency/install state after an external `pnpm add`/`pnpm remove`/version bump while the server was running.
