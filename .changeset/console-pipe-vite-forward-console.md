---
'@tanstack/devtools-bundler-core': patch
---

Skip Vite 8 `server.forwardConsole` log lines in the console pipe's server-side recursion guard. Vite prints forwarded client console calls as `<time> [vite] [console.<level>] …` through `globalThis.console`, which the pipe previously re-captured as a fresh server log and echoed back to the browser, causing an infinite client→terminal→server→client echo loop (unbounded browser/memory/terminal growth under `forwardConsole`, which is default-enabled for AI-agent dev-server workflows). Genuine server logs are still piped; terminal output is unaffected.
