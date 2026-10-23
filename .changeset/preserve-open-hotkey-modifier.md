---
'@tanstack/devtools': patch
---

Preserve the modifier when editing the open hotkey in Settings. The default open hotkey is now the UI-representable `CtrlOrMeta` token and any stored literal `Control`/`Meta` is migrated to it on load.
