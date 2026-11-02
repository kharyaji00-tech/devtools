---
'@tanstack/devtools': patch
---

Fix the SEO head watcher injecting an empty `<title>` that triggered a spurious head-change event on mount and permanently shadowed the host app's real title. The hook now resolves the `<title>` before arming its `MutationObserver`, filters its own synthetic element out of emitted added/removed events, and removes it on cleanup when still empty. The SERP preview resolves the first non-empty `<title>` instead of relying solely on `document.title`.
