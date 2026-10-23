---
'@tanstack/devtools': patch
---

Keep the resize separators focusable so keyboard resizing works. The disable-tabbing hook was stripping the authored `tabindex="0"` from the panel resize handle and plugin-pane gutters whenever the panel opened, and a mouse grab no longer focused the separator because the drag handler's `preventDefault()` suppressed the default focus without a compensating `.focus()`.
