---
'@tanstack/react-devtools': patch
---

Closing a plugin's tab (or removing it from the `plugins` prop) now unmounts the plugin's React component. Previously the React adapter's portal state was add-only, so `createPortal` kept the component mounted in a detached DOM node with its effects, intervals and subscriptions still running until the plugin was reopened or the devtools unmounted. The adapter now prunes the plugin's portal entries from its `destroy` callback (mirroring the Angular and Svelte adapters), drops the stale title portal when a pane opens, and reconciles its stored entries against the current `plugins` prop to cover the prop-removal path the core does not signal with `destroy`.
