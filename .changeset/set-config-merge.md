---
'@tanstack/devtools': patch
---

Fix `TanStackDevtoolsCore.setConfig` so runtime config updates are applied. `setConfig` now merges `init.config` into the settings and forwards `init.eventBusConfig` (mirroring the constructor) instead of spreading the whole init-shaped argument flat into settings, which silently discarded nested config, dropped `eventBusConfig`, and leaked junk `config`/`plugins`/`eventBusConfig` keys into the persisted settings.
