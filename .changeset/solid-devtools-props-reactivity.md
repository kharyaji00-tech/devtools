---
'@tanstack/solid-devtools': patch
---

Runtime changes to the `plugins` and `config` props now reach the devtools core. The Solid adapter destructured its props in the component signature, which severs SolidJS reactivity, so `setConfig` was called once at setup and never again — dynamically added/removed plugins and config changes (including `customTrigger`) never appeared in the UI. The component now reads props through the `props` object inside its `createMemo`/`createEffect` getters (and `convertTrigger` reads `props.config?.customTrigger`), matching the Solid convention documented in the adapter guide.
