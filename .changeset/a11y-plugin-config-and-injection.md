---
'@tanstack/devtools-a11y': patch
'@tanstack/devtools': patch
'@tanstack/devtools-bundler-core': patch
'@tanstack/devtools-client': patch
---

Fix the documented A11y plugin configuration API and marketplace injection, which generated non-compiling imports.

`@tanstack/devtools-a11y` never exported `createA11yPlugin` and had no root export, so `import { createA11yPlugin } from '@tanstack/devtools-a11y'` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`, and `mergeConfig()` was called without user options so initial configuration could never reach the store.

The framework plugin helpers (`a11yDevtoolsPlugin(options?)` on `./react`, `./solid`, `./angular`) now accept `A11yPluginOptions` and thread them through the core to `mergeConfig(options)` via `AllyProvider`. The plugin registry, docs, and the bundler injector now reference the real exported factory and emit a resolving import. The injector learns an optional `pluginImport.importPath` so a marketplace plugin can import from a package subpath while `packageName` still drives dependency checks.
