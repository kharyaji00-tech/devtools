---
'@tanstack/devtools-bundler-core': patch
---

Fix the Source Inspector missing source info for JSX used as prop/attribute values. `collectJsx` no longer stops traversal at each `JSXOpeningElement`, so JSX nested in attribute values (e.g. `icon={<Bar />}`, `footer={<Button />}`) is now collected and annotated with `data-tsd-source` like JSX in child expression containers.
