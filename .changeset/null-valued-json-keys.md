---
'@tanstack/devtools-ui': patch
---

Fix `JsonTree` dropping the key label of null-valued object properties. Because `typeof null === 'object'`, the hoisted key-rendering guard in `JsonValue` treated a null property like an object/array and skipped its key, so `{ a: null }` rendered as `{ null }`. The guard now explicitly excludes `null` so keyed null properties keep their `"a": null` label, including nested ones.
