---
'@tanstack/devtools-bundler-core': patch
---

Fix `removeDevtools` swallowing the trailing newline when overwriting a non-JSX-context devtools element with `null`, which produced invalid JavaScript (e.g. `const x = nullconst y = 1`) and broke production builds.