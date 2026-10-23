---
'@tanstack/devtools-event-bus': patch
---

Fix a remote crash in the WebSocket message handler. Malformed incoming WebSocket frames (including syntactically valid JSON with a non-numeric BigInt marker such as `{"__type":"bigint","value":"abc"}`, or plain invalid JSON) previously threw an uncaught exception out of the `ws` message listener and killed the host dev server process. The `parseWithBigInt` reviver now leaves markers with non-numeric values unchanged instead of throwing, and the WebSocket receive path is guarded with `try/catch` to match the existing `POST /__devtools/send` handlers. The client `BroadcastChannel` receive path is likewise guarded.
