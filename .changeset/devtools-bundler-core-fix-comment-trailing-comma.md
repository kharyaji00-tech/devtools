---
'@tanstack/devtools-bundler-core': patch
---

Fix Marketplace plugin install corrupting the `plugins` array when a comment follows the last element's trailing comma. The injector now derives the separating comma from AST positions (stripping comments via oxc-parser comment ranges) instead of a `trimEnd().endsWith(',')` text heuristic, which inserted a second comma and produced an elision hole that corrupted the user's source file on disk and crashed the Marketplace tab.
