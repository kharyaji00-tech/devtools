import { EventClient } from '@tanstack/devtools-event-client/production'
import type {
  EventMap,
  OutdatedDeps,
  PackageJson,
  PluginInjection,
} from './index'

/**
 * The always-real `EventClient`, for server-side bundler plugins (rspack) that
 * gate their dev features on the compiler's `mode` rather than
 * `process.env.NODE_ENV`.
 *
 * The root `@tanstack/devtools-client` export selects the real vs. no-op
 * `EventClient` at module-import time using `process.env.NODE_ENV`. That is
 * correct for browser bundles (production bundlers tree-shake the no-op away)
 * but a poor fit for a Node bundler plugin whose config can load while
 * `NODE_ENV` is preset to a non-development value (Docker images with
 * `ENV NODE_ENV=production`, `cross-env`, programmatic `@rspack/core` usage,
 * test runners, ...). Importing the client from this `/production` subpath
 * guarantees the real `EventClient` is used regardless of `NODE_ENV`, so the
 * rspack plugin's `.on()`/`.emit()` wiring is never silently replaced with the
 * no-op when the compiler is in development mode.
 *
 * Re-exported types mirror the root export so consumers can import everything
 * they need from this single subpath.
 */
export type { OutdatedDeps, PackageJson, PluginInjection, EventMap }

export class DevtoolsEventClient extends EventClient<EventMap> {
  constructor() {
    super({
      pluginId: 'tanstack-devtools-core',
    })
  }
}

const devtoolsEventClient = new DevtoolsEventClient()

export { devtoolsEventClient }
