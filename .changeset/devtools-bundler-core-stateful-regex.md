---
'@tanstack/devtools-bundler-core': patch
---

Make `matcher` deterministic when `injectSource.ignore` regexes use the `g` (global) or `y` (sticky) flag. Such regexes are stateful under `.test()`, advancing `lastIndex` on each match; since the user's config regex object is reused across every module/component transform, ignored files and components alternated between being ignored and injected depending on processing order. The matcher now clones `g`/`y`-flagged regexes without those flags per call, so matching is stateless and the user's config object is never mutated.
