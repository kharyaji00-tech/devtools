---
'@tanstack/devtools-bundler-core': patch
---

Fix the plugins marketplace staying permanently empty when the package-manager `outdated` command produces empty or non-JSON output. `emitOutdatedDeps` now always resolves (emitting `null` on failure) instead of leaving its promise pending, so the Vite/Rspack `mounted` handler no longer hangs and `package-json-read` is delivered to connected clients.
