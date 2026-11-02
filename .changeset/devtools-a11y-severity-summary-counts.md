---
'@tanstack/devtools-a11y': patch
---

Fix the accessibility panel summary counts collapsing to 0 for non-active severities while a severity filter is active. The per-severity summary buttons and the header total now derive from a memo that applies only `threshold` and `disabledRules`; the active `impactKey` severity filter is applied only to the rendered issue list and overlay highlights.
