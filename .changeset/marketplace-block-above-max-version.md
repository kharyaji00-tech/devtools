---
'@tanstack/devtools': patch
---

Block marketplace plugins whose installed dependency version is above `maxVersion` as incompatible instead of offering "Bump Version". `buildPluginCards` mapped every unsatisfied version check to `bump-version`, so a version above `maxVersion` rendered an enabled "Bump Version" button that installs `^minVersion` (downgrading the dependency or leaving it still above max) and injects the plugin anyway. The existing blocked "Version Mismatch / Incompatible" card machinery was unreachable dead code. `satisfiesVersionRange` now returns a structured `violation: 'min' | 'max'` field, and `buildPluginCards` assigns `version-mismatch` for above-max violations.
