---
'@tanstack/devtools-a11y': patch
---

Fix the `@tanstack/devtools-a11y/{react,solid,angular}/production` subpaths so they always mount the real accessibility panel, instead of silently resolving to `A11yDevtoolsCoreNoOp` under `NODE_ENV=production`.

The framework `/production` wrappers imported `A11yDevtoolsCore` from the conditional barrel `src/core/index.ts` (which yields the NoOp core whenever `NODE_ENV !== 'development'`), so consumers following the documented "use the `/production` sub-export in production" workflow got a non-functional, silent panel. The wrappers now import the raw core from `src/core/core.tsx`, matching the package's own `src/core/production.ts` convention. The inconsistent `src/solid/production.ts` value re-export is also pointed at the production wrapper (matching React/Angular), and a regression test now asserts every `/production` entry receives the real core under both `production` and `development`.
