---
'@tanstack/devtools': patch
---

Fix the plugins strip swallowing keyboard/assistive-tech activation after a press-and-hold

The strip's `suppressClick` flag (set when a press is held past the 500ms drag
hold) was only reset on the next `pointerdown`. A keyboard or AT activation
fires a native `click` on the strip's `<button>` with no pointer events, so the
reset never ran and the `onClick` guard silently swallowed the click — leaving
every strip entry inert via keyboard until a pointer press happened to land on
one. Clear the flag when the gesture ends (in the strip's `pointerup` handler)
so it can never leak into a later, pointer-less click.
