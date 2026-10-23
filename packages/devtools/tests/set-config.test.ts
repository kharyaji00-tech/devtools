import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TanStackDevtoolsCore } from '../src/core'
import * as mountImpl from '../src/mount-impl'
import type { TanStackDevtoolsPlugin } from '../src/context/devtools-context'
import type { ClientEventBusConfig } from '@tanstack/devtools-event-bus/client'

// `mount()` resolves the dynamic `import('./mount-impl')` on a microtask, then
// calls `mountDevtools` with whatever the core has gathered in `#config`,
// `#plugins`, and `#eventBusConfig`. Spying on the live module namespace is the
// only way to observe that snapshot (a file-level `vi.mock` is not applied to
// dynamic imports by Vitest 4's module runner — see index.test.ts).
const mountAndCapture = async (
  devtools: TanStackDevtoolsCore,
  mockedMount: ReturnType<typeof vi.spyOn>,
) => {
  devtools.mount(document.createElement('div'))
  await vi.waitFor(() => expect(mockedMount).toHaveBeenCalledOnce())
  return mockedMount.mock.calls.at(-1)![0]!
}

const eventBusConfig: ClientEventBusConfig = {
  connectToServerBus: true,
  debug: true,
  port: 4206,
  host: 'localhost',
  protocol: 'http',
}

const plugin: TanStackDevtoolsPlugin = {
  id: 'test-plugin',
  name: 'Test Plugin',
  render: () => {},
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TanStackDevtoolsCore.setConfig', () => {
  it('merges nested config fields rather than planting a junk `config` key', async () => {
    const mockedMount = vi
      .spyOn(mountImpl, 'mountDevtools')
      .mockReturnValue({ dispose: vi.fn(), eventBus: { stop: vi.fn() } })

    const devtools = new TanStackDevtoolsCore({})
    devtools.setConfig({ config: { theme: 'dark', position: 'bottom-left' } })

    const { config } = await mountAndCapture(devtools, mockedMount)

    expect(config.theme).toBe('dark')
    expect(config.position).toBe('bottom-left')
    // No init-shaped keys may leak into the settings object.
    expect(config).not.toHaveProperty('config')
    expect(config).not.toHaveProperty('plugins')
    expect(config).not.toHaveProperty('eventBusConfig')
  })

  it('merges subsequent config updates on top of constructor config', async () => {
    const mockedMount = vi
      .spyOn(mountImpl, 'mountDevtools')
      .mockReturnValue({ dispose: vi.fn(), eventBus: { stop: vi.fn() } })

    const devtools = new TanStackDevtoolsCore({ config: { theme: 'dark' } })
    devtools.setConfig({ config: { position: 'bottom-left' } })

    const { config } = await mountAndCapture(devtools, mockedMount)

    // Constructor-applied `theme` survives; new `position` is merged in.
    expect(config.theme).toBe('dark')
    expect(config.position).toBe('bottom-left')
    expect(config).not.toHaveProperty('config')
  })

  it('passes plugins through `mountDevtools` without a junk `plugins` settings key', async () => {
    const mockedMount = vi
      .spyOn(mountImpl, 'mountDevtools')
      .mockReturnValue({ dispose: vi.fn(), eventBus: { stop: vi.fn() } })

    const devtools = new TanStackDevtoolsCore({})
    devtools.setConfig({ plugins: [plugin] })

    const { config, plugins } = await mountAndCapture(devtools, mockedMount)

    expect(plugins).toEqual([plugin])
    expect(config).not.toHaveProperty('plugins')
    expect(config).not.toHaveProperty('config')
  })

  it('forwards eventBusConfig instead of dropping it or leaking it into settings', async () => {
    const mockedMount = vi
      .spyOn(mountImpl, 'mountDevtools')
      .mockReturnValue({ dispose: vi.fn(), eventBus: { stop: vi.fn() } })

    const devtools = new TanStackDevtoolsCore({})
    devtools.setConfig({ eventBusConfig })

    const { config, eventBusConfig: received } = await mountAndCapture(
      devtools,
      mockedMount,
    )

    expect(received).toBe(eventBusConfig)
    expect(config).not.toHaveProperty('eventBusConfig')
    expect(config).not.toHaveProperty('config')
    expect(config).not.toHaveProperty('plugins')
  })

  it('handles a full init-shaped object without cross-contamination', async () => {
    const mockedMount = vi
      .spyOn(mountImpl, 'mountDevtools')
      .mockReturnValue({ dispose: vi.fn(), eventBus: { stop: vi.fn() } })

    const devtools = new TanStackDevtoolsCore({})
    devtools.setConfig({
      config: { theme: 'dark', position: 'top-left' },
      eventBusConfig,
      plugins: [plugin],
    })

    const { config, plugins, eventBusConfig: received } = await mountAndCapture(
      devtools,
      mockedMount,
    )

    expect(config.theme).toBe('dark')
    expect(config.position).toBe('top-left')
    expect(plugins).toEqual([plugin])
    expect(received).toBe(eventBusConfig)
    // The settings object must stay clean — only settings keys, never init keys.
    expect(config).not.toHaveProperty('config')
    expect(config).not.toHaveProperty('plugins')
    expect(config).not.toHaveProperty('eventBusConfig')
  })
})
