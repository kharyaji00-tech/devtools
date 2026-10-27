import { createComponent, createEffect, createRoot, useContext } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ACTIVE_PLUGINS } from '../utils/constants'
import { allGroups, flattenTabs } from '../utils/layout-tree'
import { TANSTACK_DEVTOOLS_STATE } from '../utils/storage'
import {
  DevtoolsContext,
  DevtoolsProvider,
  getExistingStateFromStorage,
  getStateFromLocalStorage,
} from './devtools-context'
import type { TanStackDevtoolsPlugin } from './devtools-context'
import type { DevtoolsStore } from './devtools-store'

afterEach(() => vi.restoreAllMocks())

describe('getStateFromLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  it('should return undefined when no data in localStorage', () => {
    const state = getStateFromLocalStorage(undefined)
    expect(state).toEqual(undefined)
  })
  it('migrates a legacy activePlugins array into a single layout group', () => {
    const mockState = {
      activePlugins: ['plugin1'],
      settings: {
        theme: 'dark',
      },
    }
    localStorage.setItem(TANSTACK_DEVTOOLS_STATE, JSON.stringify(mockState))
    const state = getStateFromLocalStorage([
      {
        id: 'plugin1',
        render: () => {},
        name: 'Plugin 1',
      },
    ])
    // State written before the workspace became a tree reopens as one group, in
    // the stored order, and the superseded key is dropped.
    expect(state).toEqual({
      layout: { kind: 'group', id: 'g0', tabs: ['plugin1'], active: 0 },
      settings: { theme: 'dark' },
    })
    expect(state).not.toHaveProperty('activePlugins')
    // The migration is written back, so it only happens once.
    expect(
      JSON.parse(localStorage.getItem(TANSTACK_DEVTOOLS_STATE)!),
    ).not.toHaveProperty('activePlugins')
  })

  it('keeps an existing layout tree instead of rebuilding it', () => {
    const layout = {
      kind: 'split',
      dir: 'row',
      sizes: [0.5, 0.5],
      children: [
        { kind: 'group', id: 'g0', tabs: ['plugin1'], active: 0 },
        { kind: 'group', id: 'g1', tabs: ['plugin2'], active: 0 },
      ],
    }
    localStorage.setItem(
      TANSTACK_DEVTOOLS_STATE,
      JSON.stringify({ layout, activePlugins: ['plugin1'] }),
    )
    const state = getStateFromLocalStorage([
      { id: 'plugin1', render: () => {}, name: 'Plugin 1' },
      { id: 'plugin2', render: () => {}, name: 'Plugin 2' },
    ])
    // The tree wins: activePlugins is the superseded key, not a second opinion.
    expect(state?.layout).toEqual(layout)
    expect(flattenTabs(state?.layout ?? null)).toEqual(['plugin1', 'plugin2'])
  })
  it('should filter out inactive plugins', () => {
    const mockState = {
      activePlugins: ['plugin1', 'plugin2'],
      settings: {
        theme: 'dark',
      },
    }
    localStorage.setItem(TANSTACK_DEVTOOLS_STATE, JSON.stringify(mockState))
    const plugins = [{ id: 'plugin1', render: () => {}, name: 'Plugin 1' }]
    const state = getStateFromLocalStorage(plugins)
    expect(flattenTabs(state?.layout ?? null)).toEqual(['plugin1'])
  })
  it('should return empty plugin state if all active plugins are invalid', () => {
    const mockState = {
      activePlugins: ['plugin1', 'plugin2'],
      settings: {
        theme: 'dark',
      },
    }
    localStorage.setItem(TANSTACK_DEVTOOLS_STATE, JSON.stringify(mockState))
    const plugins = [{ id: 'plugin3', render: () => {}, name: 'Plugin 3' }]
    const state = getStateFromLocalStorage(plugins)
    expect(flattenTabs(state?.layout ?? null)).toEqual([])
  })
  it('should handle invalid JSON in localStorage gracefully', () => {
    localStorage.setItem(TANSTACK_DEVTOOLS_STATE, 'invalid json')
    const state = getStateFromLocalStorage(undefined)
    expect(state).toEqual(undefined)
  })

  it('should return undefined when no localStorage state exists (allowing defaultOpen to be applied)', () => {
    // No existing state in localStorage - this allows defaultOpen logic to trigger
    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'plugin1',
        render: () => {},
        name: 'Plugin 1',
        defaultOpen: true,
      },
      {
        id: 'plugin2',
        render: () => {},
        name: 'Plugin 2',
        defaultOpen: false,
      },
      {
        id: 'plugin3',
        render: () => {},
        name: 'Plugin 3',
        defaultOpen: true,
      },
    ]

    // When undefined is returned, getExistingStateFromStorage will fill activePlugins with defaultOpen plugins
    const state = getStateFromLocalStorage(plugins)
    expect(state).toEqual(undefined)
  })

  it('should preserve existing activePlugins from localStorage (defaultOpen should not override)', () => {
    const mockState = {
      activePlugins: ['plugin2'],
      settings: {
        theme: 'dark',
      },
    }
    localStorage.setItem(TANSTACK_DEVTOOLS_STATE, JSON.stringify(mockState))

    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'plugin1',
        render: () => {},
        name: 'Plugin 1',
        defaultOpen: true,
      },
      {
        id: 'plugin2',
        render: () => {},
        name: 'Plugin 2',
        defaultOpen: false,
      },
    ]

    const state = getStateFromLocalStorage(plugins)
    // Should keep existing activePlugins - defaultOpen logic won't override in getExistingStateFromStorage
    expect(flattenTabs(state?.layout ?? null)).toEqual(['plugin2'])
  })

  it('should automatically activate a single plugin when no active plugins exist', () => {
    // No existing state in localStorage
    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'only-plugin',
        render: () => {},
        name: 'Only Plugin',
      },
    ]

    const state = getStateFromLocalStorage(plugins)
    // Should return undefined - the single plugin activation happens in getExistingStateFromStorage
    expect(state).toEqual(undefined)
  })
})

describe('getExistingStateFromStorage - integration tests', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should automatically activate a single plugin when no localStorage state exists', () => {
    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'only-plugin',
        render: () => {},
        name: 'Only Plugin',
      },
    ]

    const state = getExistingStateFromStorage(undefined, plugins)
    expect(flattenTabs(state.state.layout)).toEqual(['only-plugin'])
    expect(state.plugins).toHaveLength(1)
    expect(state.plugins![0]?.id).toBe('only-plugin')
  })

  it('should activate plugins with defaultOpen: true when no localStorage state exists', () => {
    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'plugin1',
        render: () => {},
        name: 'Plugin 1',
        defaultOpen: true,
      },
      {
        id: 'plugin2',
        render: () => {},
        name: 'Plugin 2',
        defaultOpen: false,
      },
      {
        id: 'plugin3',
        render: () => {},
        name: 'Plugin 3',
        defaultOpen: true,
      },
    ]

    const state = getExistingStateFromStorage(undefined, plugins)
    expect(flattenTabs(state.state.layout)).toEqual(['plugin1', 'plugin3'])
    expect(state.plugins).toHaveLength(3)
  })

  it('opens every defaultOpen plugin that fits under MAX_ACTIVE_PLUGINS', () => {
    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'plugin1',
        render: () => {},
        name: 'Plugin 1',
        defaultOpen: true,
      },
      {
        id: 'plugin2',
        render: () => {},
        name: 'Plugin 2',
        defaultOpen: true,
      },
      {
        id: 'plugin3',
        render: () => {},
        name: 'Plugin 3',
        defaultOpen: true,
      },
      {
        id: 'plugin4',
        render: () => {},
        name: 'Plugin 4',
        defaultOpen: true,
      },
      {
        id: 'plugin5',
        render: () => {},
        name: 'Plugin 5',
        defaultOpen: true,
      },
    ]

    const state = getExistingStateFromStorage(undefined, plugins)
    // Five is under the cap now that panes can split and stack, so all five
    // open. Pinned to the constant rather than a literal.
    expect(flattenTabs(state.state.layout)).toEqual(
      plugins.slice(0, MAX_ACTIVE_PLUGINS).map((plugin) => plugin.id),
    )
    expect(flattenTabs(state.state.layout).length).toBeLessThanOrEqual(
      MAX_ACTIVE_PLUGINS,
    )
    // All 5 plugins should still be in the plugins array
    expect(state.plugins).toHaveLength(5)
  })

  it('should preserve existing activePlugins from localStorage even when plugins have defaultOpen', () => {
    const mockState = {
      activePlugins: ['plugin2', 'plugin4'],
      settings: {
        theme: 'dark',
      },
    }
    localStorage.setItem(TANSTACK_DEVTOOLS_STATE, JSON.stringify(mockState))

    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'plugin1',
        render: () => {},
        name: 'Plugin 1',
        defaultOpen: true,
      },
      {
        id: 'plugin2',
        render: () => {},
        name: 'Plugin 2',
        defaultOpen: false,
      },
      {
        id: 'plugin3',
        render: () => {},
        name: 'Plugin 3',
        defaultOpen: true,
      },
      {
        id: 'plugin4',
        render: () => {},
        name: 'Plugin 4',
        defaultOpen: false,
      },
    ]

    const state = getExistingStateFromStorage(undefined, plugins)
    // Should preserve the localStorage state, not use defaultOpen
    expect(flattenTabs(state.state.layout)).toEqual(['plugin2', 'plugin4'])
    expect(state.plugins).toHaveLength(4)
  })

  it('should return empty activePlugins when no defaultOpen and multiple plugins', () => {
    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'plugin1',
        render: () => {},
        name: 'Plugin 1',
      },
      {
        id: 'plugin2',
        render: () => {},
        name: 'Plugin 2',
      },
      {
        id: 'plugin3',
        render: () => {},
        name: 'Plugin 3',
      },
    ]

    const state = getExistingStateFromStorage(undefined, plugins)
    expect(flattenTabs(state.state.layout)).toEqual([])
    expect(state.plugins).toHaveLength(3)
  })

  it('should handle single plugin with defaultOpen: false by activating it anyway', () => {
    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'only-plugin',
        render: () => {},
        name: 'Only Plugin',
        defaultOpen: false,
      },
    ]

    const state = getExistingStateFromStorage(undefined, plugins)
    // Single plugin should be activated regardless of defaultOpen flag
    expect(flattenTabs(state.state.layout)).toEqual(['only-plugin'])
  })

  it('should merge config settings into the returned state', () => {
    const plugins: Array<TanStackDevtoolsPlugin> = [
      {
        id: 'plugin1',
        render: () => {},
        name: 'Plugin 1',
      },
    ]

    const config = {
      theme: 'light' as const,
    }

    const state = getExistingStateFromStorage(config as any, plugins)
    expect(state.settings.theme).toBe('light')
    expect(flattenTabs(state.state.layout)).toEqual(['plugin1'])
  })
})

describe('provider resilience', () => {
  beforeEach(() => localStorage.clear())

  it('fails loudly for storage reads while tolerating storage quota errors', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new Error('read blocked')
    })
    expect(() => getStateFromLocalStorage(undefined)).toThrow('read blocked')
    localStorage.setItem(
      TANSTACK_DEVTOOLS_STATE,
      JSON.stringify({
        activePlugins: ['missing'],
        settings: { theme: 'dark' },
      }),
    )
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota')
    })
    expect(() =>
      getStateFromLocalStorage([
        { id: 'kept', name: 'Kept', render: () => {} },
      ]),
    ).not.toThrow()
  })

  it('generates stable unique IDs while preserving explicit duplicate IDs', () => {
    const generated = getExistingStateFromStorage(undefined, [
      { name: 'Same Name', render: () => {} },
      { name: 'Same Name', render: () => {} },
      { name: () => {}, render: () => {} },
    ]).plugins!.map((entry) => entry.id)
    expect(generated).toEqual(['same-name-0', 'same-name-1', '2'])
    const explicit = getExistingStateFromStorage(undefined, [
      { id: 'duplicate', name: 'A', render: () => {} },
      { id: 'duplicate', name: 'B', render: () => {} },
    ]).plugins!.map((entry) => entry.id)
    expect(explicit).toEqual(['duplicate', 'duplicate'])
  })

  it('reactively replaces plugins through the existing onSetPlugins callback', async () => {
    let replace!: (plugins: Array<TanStackDevtoolsPlugin>) => void
    let ids: Array<string> = []
    const dispose = createRoot((disposeRoot) => {
      createComponent(DevtoolsProvider, {
        plugins: [{ name: 'Old', render: () => {} }],
        onSetPlugins: (setter) => {
          replace = setter
        },
        get children() {
          const context = useContext(DevtoolsContext)!
          createEffect(() => {
            ids = context.store.plugins?.map((entry) => entry.id!) ?? []
          })
          return null
        },
      })
      return disposeRoot
    })
    await Promise.resolve()
    expect(ids).toEqual(['old-0'])
    replace([{ name: 'New', render: () => {} }])
    expect(ids).toEqual(['new-0'])
    dispose()
  })
})

describe('updatePlugins repairs the live layout against the new plugin ids', () => {
  beforeEach(() => localStorage.clear())

  // Mount the provider the way TanStackDevtoolsCore does: capture the
  // `updatePlugins` setter through `onSetPlugins` and read the live store
  // through the context. Stores update synchronously, so the store handle is
  // current as soon as `replace` returns.
  const mountProvider = (initial: Array<TanStackDevtoolsPlugin>) => {
    let replace!: (plugins: Array<TanStackDevtoolsPlugin>) => void
    let store!: DevtoolsStore
    const dispose = createRoot((disposeRoot) => {
      createComponent(DevtoolsProvider, {
        plugins: initial,
        onSetPlugins: (setter) => {
          replace = setter
        },
        get children() {
          store = useContext(DevtoolsContext)!.store
          return null
        },
      })
      return disposeRoot
    })
    return {
      replace: (plugins: Array<TanStackDevtoolsPlugin>) => replace(plugins),
      get store() {
        return store
      },
      dispose,
    }
  }

  const plugin = (id: string): TanStackDevtoolsPlugin => ({
    id,
    name: id,
    render: () => {},
  })

  const seedLayout = (tabs: Array<string>) =>
    localStorage.setItem(
      TANSTACK_DEVTOOLS_STATE,
      JSON.stringify({ layout: { kind: 'group', id: 'g0', tabs, active: 0 } }),
    )

  it('prunes a removed plugin tab from the live layout', async () => {
    seedLayout(['a', 'b'])
    const { replace, store, dispose } = mountProvider([
      plugin('a'),
      plugin('b'),
    ])
    await Promise.resolve()
    expect(flattenTabs(store.state.layout)).toEqual(['a', 'b'])

    replace([plugin('b')])
    // 'a' is gone from the layout, not left behind as a dangling tab.
    expect(flattenTabs(store.state.layout)).toEqual(['b'])
    expect(store.plugins?.map((p) => p.id)).toEqual(['b'])
    dispose()
  })

  it('keeps surviving panes and the split structure when one plugin goes', async () => {
    localStorage.setItem(
      TANSTACK_DEVTOOLS_STATE,
      JSON.stringify({
        layout: {
          kind: 'split',
          dir: 'row',
          sizes: [0.5, 0.5],
          children: [
            { kind: 'group', id: 'g0', tabs: ['a'], active: 0 },
            { kind: 'group', id: 'g1', tabs: ['b', 'c'], active: 0 },
          ],
        },
      }),
    )
    const { replace, store, dispose } = mountProvider([
      plugin('a'),
      plugin('b'),
      plugin('c'),
    ])
    await Promise.resolve()

    replace([plugin('a'), plugin('c')])
    const layout = store.state.layout!
    expect(layout.kind).toBe('split')
    expect(flattenTabs(layout)).toEqual(['a', 'c'])
    // 'b' is pruned out of the second group, which still holds 'c'.
    expect(allGroups(layout).map((g) => g.tabs)).toEqual([['a'], ['c']])
    dispose()
  })

  it('prunes every tab whose generated id shifted on reorder', async () => {
    // Plugins without an explicit id get `<name>-<index>`, so reordering shifts
    // every id. Before the fix the layout kept referencing the stale ids.
    const alpha: TanStackDevtoolsPlugin = { name: 'Alpha', render: () => {} }
    const beta: TanStackDevtoolsPlugin = { name: 'Beta', render: () => {} }
    seedLayout(['alpha-0', 'beta-1'])
    const { replace, store, dispose } = mountProvider([alpha, beta])
    await Promise.resolve()
    expect(store.plugins?.map((p) => p.id)).toEqual(['alpha-0', 'beta-1'])
    expect(flattenTabs(store.state.layout)).toEqual(['alpha-0', 'beta-1'])

    // Reorder -> new ids beta-0 / alpha-1; none of the old ids survive.
    replace([beta, alpha])
    expect(store.plugins?.map((p) => p.id)).toEqual(['beta-0', 'alpha-1'])
    expect(flattenTabs(store.state.layout)).toEqual([])
    expect(store.state.layout).toBeNull()
    dispose()
  })

  it('matches the layout a reload would produce from the same persisted state', async () => {
    seedLayout(['a', 'b'])
    const { replace, store, dispose } = mountProvider([
      plugin('a'),
      plugin('b'),
    ])
    await Promise.resolve()

    replace([plugin('b')])

    const live = flattenTabs(store.state.layout)
    // What a reload (mount) would do with the persisted state the runtime
    // update just wrote. Before the fix these disagreed.
    const reloaded = getStateFromLocalStorage([plugin('b')])
    expect(flattenTabs(reloaded?.layout ?? null)).toEqual(live)
    expect(live).toEqual(['b'])
    dispose()
  })

  it('does not auto-open plugins newly added at runtime', async () => {
    seedLayout(['a'])
    const { replace, store, dispose } = mountProvider([plugin('a')])
    await Promise.resolve()
    expect(flattenTabs(store.state.layout)).toEqual(['a'])

    replace([plugin('a'), plugin('new')])
    // 'new' is available but not opened — repair prunes, it never adds.
    expect(store.plugins?.map((p) => p.id)).toEqual(['a', 'new'])
    expect(flattenTabs(store.state.layout)).toEqual(['a'])
    expect(store.state.layout).not.toBeNull()
    dispose()
  })

  it('does not rewrite storage when the plugin set is unchanged', async () => {
    seedLayout(['a', 'b'])
    const { replace, store, dispose } = mountProvider([
      plugin('a'),
      plugin('b'),
    ])
    await Promise.resolve()

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    replace([plugin('a'), plugin('b')])
    // Unchanged ids -> repairLayout produces the same content -> no
    // replaceLayout -> no TANSTACK_DEVTOOLS_STATE write from the update.
    expect(
      setItem.mock.calls.some(([key]) => key === TANSTACK_DEVTOOLS_STATE),
    ).toBe(false)
    expect(flattenTabs(store.state.layout)).toEqual(['a', 'b'])
    dispose()
  })
})
