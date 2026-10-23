---
'@tanstack/devtools-rspack': patch
---

Fix the `@tanstack/devtools-rspack` loader misclassifying production-defaulted builds as development. When a rspack config omits `mode` (which rspack treats as production), the loader fell back to `'development'` and injected dev-only instrumentation (`data-tsd-source` attributes, enhanced console logs, the console-pipe IIFE, the runtime bridge) into the production bundle while skipping `removeDevtoolsOnBuild` stripping. The loader now resolves the pipeline mode from the loader context, then the compiler option, then falls back to `'production'`, matching rspack's own semantics and the plugin's `compiler.options.mode === 'development'` gate.
