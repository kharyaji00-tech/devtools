---
'@tanstack/devtools': patch
---

Workspace pointer drags (tab drag, splitter resize, and strip-to-workspace drag) now listen for `pointercancel`, so a cancelled pointer ends the gesture cleanly instead of leaving drag state stuck, leaking document listeners, and — for the splitter — stranding `user-select: none` on the host page. A cancelled drag drops in place with no layout change, matching the existing trigger behavior.
