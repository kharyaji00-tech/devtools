---
'@tanstack/devtools-utils': patch
---

Fix the Vue devtools panel never unmounting its core instance. Vue nulls template refs during the synchronous unmount traversal before `onUnmounted` runs, so the `devToolRef.value` guard was always `false` and `unmount()` was skipped. The panel now snapshots the mounted element at `onMounted` time and unmounts based on that snapshot, mirroring the Preact adapter fix.
