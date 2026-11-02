---
'@tanstack/devtools-bundler-core': patch
---

Fix AST traversal crash and silent subtree drops in `walk`/`forEachChild`. The per-`node.type` child-key cache assumed all instances of a node type share one shape, but oxc instances of the same type can hold `null`, a primitive, or a child node in the same key (e.g. `Literal.value`, `PropertyDefinition.accessibility`) and can omit optional keys entirely (e.g. `Identifier.typeAnnotation` in JS vs. TS). This caused mid-file `TypeError`s or silently skipped subtrees, with the wrong shape shared across every file a worker parses. Traversal now discovers child keys per instance and skips `null`/primitives before the node check, so transformations (plugin injection, log enhancement, source annotation, devtools removal) no longer silently abort on affected files.
