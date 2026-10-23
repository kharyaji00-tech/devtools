---
'@tanstack/devtools': patch
---

Repair the live layout tree when plugins change at runtime. `updatePlugins` (the `setConfig({ plugins })` path used by every adapter) now prunes dangling tab ids from `store.state.layout` against the new plugin ids, restoring the invariant the mount path already enforces — so removing or reordering a plugin at runtime no longer leaves a phantom pane/tab or wastes an `MAX_ACTIVE_PLUGINS` slot, and the in-session workspace no longer diverges from what a reload shows.
