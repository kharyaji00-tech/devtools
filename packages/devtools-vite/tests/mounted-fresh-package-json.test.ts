import { beforeEach, describe, expect, it, vi } from 'vitest'
import { devtools } from '../src/plugin'
import type { Plugin } from 'vite'
import type * as Core from '@tanstack/devtools-bundler-core'
import type { PackageJson } from '@tanstack/devtools-client'

// `vi.hoisted` lifts the shared fakes above the `vi.mock` hoisting boundary so
// the mock factories (which are themselves hoisted to the top of the file) can
// safely reference them, and the test body can reset/inspect them between runs.
const { eventClient, handlers, emitCalls, coreMocks } = vi.hoisted(() => {
  const handlers: Record<string, Array<(event: any) => void>> = {}
  const emitCalls: Array<{ event: string; payload: any }> = []

  const eventClient = {
    on: vi.fn((event: string, cb: (event: any) => void) => {
      ;(handlers[event] ??= []).push(cb)
      return () => {}
    }),
    emit: vi.fn((event: string, payload: any) => {
      emitCalls.push({ event, payload })
    }),
  }

  const coreMocks = {
    readPackageJson: vi.fn(() => Promise.resolve(null as PackageJson | null)),
    emitOutdatedDeps: vi.fn(() => Promise.resolve(null)),
  }

  return { eventClient, handlers, emitCalls, coreMocks }
})

vi.mock('@tanstack/devtools-client', () => ({
  devtoolsEventClient: eventClient,
}))

vi.mock('@tanstack/devtools-bundler-core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>()
  return {
    ...actual,
    readPackageJson: coreMocks.readPackageJson,
    emitOutdatedDeps: coreMocks.emitOutdatedDeps,
  }
})

function findPlugin(plugins: Array<Plugin>, name: string): Plugin {
  const found = plugins.find((p) => p.name === name)
  if (!found) throw new Error(`plugin '${name}' not found`)
  return found
}

function packageJsonReadPayloads(): Array<{ packageJson: PackageJson | null }> {
  return emitCalls
    .filter((c) => c.event === 'package-json-read')
    .map((c) => c.payload)
}

async function invokeMounted(): Promise<void> {
  const mounted = handlers['mounted']
  if (!mounted || mounted.length === 0) {
    throw new Error('no mounted handler was registered')
  }
  await Promise.all(
    mounted.map((h) =>
      h({
        type: 'tanstack-devtools-core:mounted',
        payload: undefined,
        pluginId: 'tanstack-devtools-core',
      }),
    ),
  )
}

describe('@tanstack/devtools:event-client-setup - package.json freshness', () => {
  beforeEach(async () => {
    for (const key of Object.keys(handlers)) delete handlers[key]
    emitCalls.length = 0
    eventClient.on.mockClear()
    eventClient.emit.mockClear()
    coreMocks.readPackageJson.mockReset()
    coreMocks.emitOutdatedDeps.mockReset()
    coreMocks.emitOutdatedDeps.mockResolvedValue(null)

    const plugins = devtools()
    const eventClientSetup = findPlugin(
      plugins,
      '@tanstack/devtools:event-client-setup',
    )
    const configureServer = eventClientSetup.configureServer as () => Promise<void>
    await configureServer()
  })

  // Guards against re-introducing the capture-once startup snapshot: the
  // `mounted` handler must read package.json lazily, not from a constant
  // closed over in configureServer (which Vite never re-runs on package.json
  // changes, so the snapshot would go stale for the whole dev session).
  it('does not capture package.json once at configureServer startup', () => {
    expect(coreMocks.readPackageJson).not.toHaveBeenCalled()
  })

  it('reads package.json fresh on every mount instead of a stale startup snapshot', async () => {
    const v1: PackageJson = {
      name: 'app',
      dependencies: { 'left-pad': '1.0.0' },
    }
    const v2: PackageJson = {
      name: 'app',
      dependencies: { 'left-pad': '1.0.0', 'new-pkg': '2.0.0' },
    }

    coreMocks.readPackageJson.mockResolvedValueOnce(v1).mockResolvedValueOnce(v2)

    await invokeMounted()
    const firstPayloads = packageJsonReadPayloads()
    expect(firstPayloads).toHaveLength(1)
    expect(firstPayloads[0]!.packageJson).toEqual(v1)

    // Simulate editing package.json on disk, then re-opening the marketplace
    // (which remounts and re-emits `mounted`). The stale-snapshot bug would
    // serve v1 again; the fix re-reads so the second mount sees v2.
    await invokeMounted()
    const secondPayloads = packageJsonReadPayloads()
    expect(secondPayloads).toHaveLength(2)
    expect(secondPayloads[1]!.packageJson).toEqual(v2)
    expect(secondPayloads[1]!.packageJson).not.toEqual(v1)
    expect(secondPayloads[1]!.packageJson?.dependencies?.['new-pkg']).toBe(
      '2.0.0',
    )

    // readPackageJson is called exactly once per mount, never at startup.
    expect(coreMocks.readPackageJson).toHaveBeenCalledTimes(2)
  })
})
