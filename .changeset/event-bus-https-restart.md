---
'@tanstack/devtools-event-bus': patch
'@tanstack/devtools-vite': patch
---

Fix the devtools event bus dying after a Vite dev-server restart in HTTPS mode. The "already running" guard in `ServerEventBus.start()` now only short-circuits in standalone mode, so external-server (HTTPS piggyback) mode always re-attaches its `/__devtools/*` handlers to the current Vite server even when stale process-wide globals are present. `stop()` now clears those globals, and the Vite plugin calls `bus.stop()` on the dev server `'close'` event so an in-process restart starts from a clean slate. External handlers are also prepended (instead of appended) so they run before the host server's own request/upgrade handlers.
