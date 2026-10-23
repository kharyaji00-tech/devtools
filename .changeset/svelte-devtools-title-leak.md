---
'@tanstack/svelte-devtools': patch
---

Unmount component-valued plugin titles when their heading element is replaced or the plugin is destroyed. The `name` callback previously mounted a Svelte instance that was never cleaned up, leaking live instances on every config update and plugin open/close cycle.
