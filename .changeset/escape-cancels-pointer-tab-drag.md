---
'@tanstack/devtools': patch
---

Fix Escape not cancelling an in-progress pointer tab drag in the workbench. Previously, pressing Escape during a pointer tab-drag cleared only the shared drag signals, leaving the pointer gesture's closure state and document listeners active, so the drag could resurrect on the next pointer move and commit the drop the user had cancelled.
