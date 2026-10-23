---
'@tanstack/angular-devtools': patch
---

Fix plugin panel and tab-title duplication on theme toggle or devtools open/close. The adapter unconditionally created a new Angular component on every `render`/`name` re-invocation, leaking instances into the host `ApplicationRef`. Mounted components are now keyed by container and reused with updated inputs, matching the Svelte/Vue/React adapters.
