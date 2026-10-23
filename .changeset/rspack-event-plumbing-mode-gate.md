---
'@tanstack/devtools-rspack': patch
'@tanstack/devtools-client': minor
'@tanstack/devtools-event-bus': minor
---

Fix `@tanstack/devtools-rspack` silently disabling the plugin marketplace / install-devtools / bump-package-version flow when `NODE_ENV` is preset to a non-development value.

The rspack plugin intentionally gates its dev features on `compiler.options.mode === 'development'`, but the event plumbing it wired onto was gated on `process.env.NODE_ENV === 'development'`: the `devtoolsEventClient` singleton from `@tanstack/devtools-client` selects the real vs. no-op `EventClient` at module-import time via `NODE_ENV`, and `ServerEventBus.start()` refused to listen outside development. Whenever `NODE_ENV` was preset to anything other than `'development'` when the user's `rspack.config` loaded (Docker images with `ENV NODE_ENV=production`, `cross-env`, programmatic `@rspack/core` usage), every `.on()` registered onto the no-op and every `.emit()` was dropped, and the event bus never started — with zero errors or warnings.

- `@tanstack/devtools-client` now exposes a `/production` subpath that exports a `DevtoolsEventClient` (and a `devtoolsEventClient` singleton) built from the always-real `EventClient`, for server-side bundler plugins that gate on compiler `mode`. The root export's `NODE_ENV`-gated behavior (used by the browser bundle for production tree-shaking) is unchanged. `EventMap` is now exported.
- `@tanstack/devtools-rspack` imports its `devtoolsEventClient` from `@tanstack/devtools-client/production` and starts the `ServerEventBus` with `force: true`, so a dev-mode compiler gets a working event bus and live event wiring regardless of the preset `NODE_ENV`. Production-mode (`mode !== 'development'`) behavior is unchanged.
- `@tanstack/devtools-event-bus` adds an opt-in `force?: boolean` to `ServerEventBusConfig`. When `true`, `start()` bypasses the `process.env.NODE_ENV !== 'development'` early return (used by the rspack plugin); the default (`false`) preserves the existing behavior relied on by the Vite plugin.
