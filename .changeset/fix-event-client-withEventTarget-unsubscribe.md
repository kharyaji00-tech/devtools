---
'@tanstack/devtools-event-client': patch
---

Fix a listener leak in `EventClient.on()` when used with `{ withEventTarget: true }`. The returned unsubscribe function previously removed the wrong function object from the internal `EventTarget`, so the internal listener was never removed and the callback kept firing on every subsequent `emit()` (and stayed referenced in memory). The cleanup now removes the exact internal listener that was registered.
