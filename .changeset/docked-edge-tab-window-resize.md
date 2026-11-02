---
'@tanstack/devtools': patch
---

Reposition the docked edge trigger tab when the window is resized. Previously the resize handler skipped the docked state, so the tab kept its stale along-edge pixel offset and could end up entirely outside the new viewport (mouse users lost access until reload or `Ctrl+~`). The tab now maps its stored percent into the current viewport on every resize, the same way the undocked floating trigger does.
