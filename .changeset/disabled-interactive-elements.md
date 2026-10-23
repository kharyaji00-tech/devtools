---
'@tanstack/devtools-a11y': patch
---

Stop the custom a11y rules from flagging disabled interactive elements (e.g. `<button disabled>`) as not keyboard accessible. `isInteractiveElement` no longer returns `false` for inherently interactive tags that carry the `disabled` attribute, so disabled buttons/inputs/selects/textareas/links are exempted from the `click-handler-on-non-interactive`, `mouse-only-event-handlers`, and `static-element-interaction` rules. `isFocusable` now returns `false` for disabled form controls so a disabled `<input tabindex="0">` can no longer trigger the "has tabindex but no keyboard handler" finding.
