---
'@tanstack/devtools-event-bus': patch
---

Close the client event bus `BroadcastChannel` on `stop()` to prevent duplicate event delivery after an unmount→remount cycle.
