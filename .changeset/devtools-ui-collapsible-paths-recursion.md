---
'@tanstack/devtools-ui': patch
---

Fix `JsonTree` / `CollapsiblePaths` failing to compile (TS2589) for self-referential value types such as trees, linked lists, or graphs. `CollapsibleKeys` now stops recursing after a bounded depth (10 levels), so cyclic `TData` resolves to a finite path union instead of triggering `error TS2589: Type instantiation is excessively deep and possibly infinite` at every `JsonTree` usage site.

Note: this caps the generated `collapsePaths` union at 10 levels of nesting. Runtime behavior is unchanged (`collapsePaths` is still matched as strings), but the type-level union no longer offers or validates paths deeper than 10 levels. All existing types (deep-but-finite nesting, `any`, `unknown`, `undefined`, arrays, generics) are unchanged.
