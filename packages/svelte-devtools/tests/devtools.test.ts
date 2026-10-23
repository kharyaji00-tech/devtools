import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TanStackDevtoolsSvelteAdapter } from '../src/devtools'
import LifecyclePanel from './LifecyclePanel.svelte'
import LifecycleTitle from './LifecycleTitle.svelte'
import type { TanStackDevtoolsPlugin } from '@tanstack/devtools'

type PluginNameCallback = Exclude<TanStackDevtoolsPlugin['name'], string>

const { capturePlugins } = vi.hoisted(() => ({ capturePlugins: vi.fn() }))

vi.mock('@tanstack/devtools', () => ({
  TanStackDevtoolsCore: class {
    constructor(init: { plugins: Array<TanStackDevtoolsPlugin> }) {
      capturePlugins(init.plugins)
    }

    mount() {}
    setConfig() {}
    unmount() {}
  },
}))

describe('TanStackDevtoolsSvelteAdapter', () => {
  beforeEach(() => {
    capturePlugins.mockReset()
  })

  it('updates panel props without replacing the mounted component', () => {
    const recordDestroy = vi.fn()
    const recordMount = vi.fn()
    const recordUpdate = vi.fn()
    const adapter = new TanStackDevtoolsSvelteAdapter()
    adapter.mount(document.createElement('div'), {
      plugins: [
        {
          id: 'test',
          name: 'Test',
          component: LifecyclePanel,
          props: { recordDestroy, recordMount, recordUpdate },
        },
      ],
    })

    const plugins = capturePlugins.mock
      .calls[0]![0] as Array<TanStackDevtoolsPlugin>
    const container = document.createElement('div')
    for (const devtoolsOpen of [true, false, true, false, true]) {
      plugins[0]!.render(container, { theme: 'dark', devtoolsOpen })
    }

    expect(container.children).toHaveLength(1)
    expect(
      container.firstElementChild?.getAttribute('data-devtools-open'),
    ).toBe('true')
    expect(recordMount).toHaveBeenCalledOnce()
    expect(recordDestroy).not.toHaveBeenCalled()
    expect(recordUpdate.mock.calls.map(([open]) => open)).toEqual([
      true,
      false,
      true,
      false,
      true,
    ])

    plugins[0]!.destroy?.('test')

    expect(container.children).toHaveLength(0)
    expect(recordDestroy).toHaveBeenCalledOnce()

    adapter.destroy()
    expect(recordDestroy).toHaveBeenCalledOnce()
  })

  it('updates component-valued title props without replacing the mounted component', () => {
    const recordDestroy = vi.fn()
    const recordMount = vi.fn()
    const recordUpdate = vi.fn()
    const adapter = new TanStackDevtoolsSvelteAdapter()
    adapter.mount(document.createElement('div'), {
      plugins: [
        {
          id: 'test',
          name: LifecycleTitle,
          component: LifecyclePanel,
          props: { recordDestroy, recordMount, recordUpdate },
        },
      ],
    })

    const plugins = capturePlugins.mock
      .calls[0]![0] as Array<TanStackDevtoolsPlugin>
    const heading = document.createElement('h3')
    for (const devtoolsOpen of [true, false, true, false, true]) {
      ;(plugins[0]!.name as PluginNameCallback)(heading, {
        theme: 'dark',
        devtoolsOpen,
      })
    }

    expect(heading.children).toHaveLength(1)
    expect(
      heading.firstElementChild?.getAttribute('data-devtools-open'),
    ).toBe('true')
    expect(recordMount).toHaveBeenCalledOnce()
    expect(recordDestroy).not.toHaveBeenCalled()
    expect(recordUpdate.mock.calls.map(([open]) => open)).toEqual([
      true,
      false,
      true,
      false,
      true,
    ])

    plugins[0]!.destroy?.('test')

    expect(heading.children).toHaveLength(0)
    expect(recordDestroy).toHaveBeenCalledOnce()

    adapter.destroy()
    expect(recordDestroy).toHaveBeenCalledOnce()
  })

  it('destroys the previous title component when name is re-invoked with a new element', () => {
    const recordDestroy = vi.fn()
    const recordMount = vi.fn()
    const recordUpdate = vi.fn()
    const adapter = new TanStackDevtoolsSvelteAdapter()
    adapter.mount(document.createElement('div'), {
      plugins: [
        {
          id: 'test',
          name: LifecycleTitle,
          component: LifecyclePanel,
          props: { recordDestroy, recordMount, recordUpdate },
        },
      ],
    })

    const plugins = capturePlugins.mock
      .calls[0]![0] as Array<TanStackDevtoolsPlugin>
    const heading1 = document.createElement('h3')
    const heading2 = document.createElement('h3')

    ;(plugins[0]!.name as PluginNameCallback)(heading1, {
      theme: 'dark',
      devtoolsOpen: true,
    })
    ;(plugins[0]!.name as PluginNameCallback)(heading2, {
      theme: 'dark',
      devtoolsOpen: true,
    })

    expect(recordMount).toHaveBeenCalledTimes(2)
    // The first title instance is destroyed when the second name() call uses a new heading.
    expect(recordDestroy).toHaveBeenCalledOnce()
    expect(heading1.children).toHaveLength(0)
    expect(heading2.children).toHaveLength(1)

    plugins[0]!.destroy?.('test')

    expect(heading2.children).toHaveLength(0)
    expect(recordDestroy).toHaveBeenCalledTimes(2)

    adapter.destroy()
    expect(recordDestroy).toHaveBeenCalledTimes(2)
  })
})
