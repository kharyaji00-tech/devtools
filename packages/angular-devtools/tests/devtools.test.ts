import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TanStackDevtools } from '../src/devtools'
import type { TanStackDevtoolsPlugin } from '@tanstack/devtools'

/**
 * The devtools core re-invokes every mounted plugin's `render` and `name`
 * callbacks when the theme or the devtools open-state changes, reusing the same
 * mount node. This is the documented contract that all framework adapters must
 * honor: repeated `render`/`name` calls against the same container must keep a
 * single mounted instance and update it in place — never stack a second one.
 *
 * The Svelte adapter's test (`packages/svelte-devtools/tests/devtools.test.ts`)
 * mocks the core and exercises the real adapter. We do the same for the Angular
 * adapter, mocking `@angular/core`'s rendering/DI/primitives with a *reactive*
 * stand-in (signals + effects) so the real `devtools.ts` orchestration — keyed
 * replace-in-place and input propagation — runs and is observable.
 */

const hoisted = vi.hoisted(() => {
  const state = {
    afterNextRenderCb: null as null | (() => void),
    createdRefs: [] as Array<{
      host: HTMLElement
      child: HTMLElement
      componentType: unknown
      location: { nativeElement: HTMLElement }
      hostView: { id: number }
      changeDetectorRef: { detectChanges: () => void }
      setInput: (name: string, value: unknown) => void
      setInputCalls: Array<{ name: string; value: unknown }>
      injector: unknown
      destroy: () => void
      onDestroy: (cb: () => void) => void
    }>,
    views: new Set<object>(),
    appRef: {
      attachView: (v: object) => {
        state.views.add(v)
      },
      detachView: (v: object) => {
        state.views.delete(v)
      },
    },
    capturedPlugins: vi.fn(),
  }
  return state
})

vi.mock('@tanstack/devtools', () => ({
  PLUGIN_CONTAINER_ID: 'plugin-container',
  TanStackDevtoolsCore: class {
    constructor(init: { plugins: Array<TanStackDevtoolsPlugin> }) {
      hoisted.capturedPlugins(init.plugins)
    }
    mount() {}
    setConfig() {}
    unmount() {}
  },
}))

vi.mock('@angular/core', () => {
  // --- minimal reactive stand-ins (signal + effect) ---
  let activeEffect: null | (() => void) = null
  const track = (subs: Set<() => void>) => {
    if (activeEffect) subs.add(activeEffect)
  }
  const notify = (subs: Set<() => void>) => {
    for (const run of subs) run()
  }
  const makeSignal = <T>(initial: T) => {
    const subs = new Set<() => void>()
    let value = initial
    const s = Object.assign(
      (nv?: T) =>
        nv === undefined ? (track(subs), value) : ((value = nv), s),
      {
        set: (nv: T) => {
          value = nv
          notify(subs)
        },
        update: (fn: (v: T) => T) => {
          value = fn(value)
          notify(subs)
        },
      },
    )
    return s
  }
  const signal = makeSignal
  const input = makeSignal
  const computed = <T>(fn: () => T) => () => fn()
  const isSignal = (v: unknown) =>
    typeof v === 'function' && typeof (v as any)?.set === 'function'
  const untracked = <T>(accessor: () => T) => {
    const prev = activeEffect
    activeEffect = null
    try {
      return accessor()
    } finally {
      activeEffect = prev
    }
  }

  // --- injection tokens + DI ---
  class ElementRef {
    nativeElement: HTMLElement
    constructor() {
      this.nativeElement = document.createElement('div')
    }
  }
  class ApplicationRef {}
  class EnvironmentInjector {}
  class Injector {}
  class DestroyRef {
    onDestroy(_cb: () => void) {}
  }
  const injectorMocks = new Map<unknown, unknown>([
    [ElementRef, new ElementRef()],
    [ApplicationRef, hoisted.appRef],
    [EnvironmentInjector, {}],
    [Injector, {}],
    [DestroyRef, { onDestroy(_cb: () => void) {} }],
  ])
  const inject = (token: unknown) => injectorMocks.get(token)
  const runInInjectionContext = (_injector: unknown, fn: () => void) => fn()

  // --- component rendering ---
  const createComponent = (type: unknown, opts: {
    hostElement: HTMLElement
  }) => {
    const child = document.createElement('div')
    child.dataset['componentType'] = String((type as any)?.name ?? 'unknown')
    opts.hostElement.appendChild(child)
    const onDestroyCbs: Array<() => void> = []
    const setInputCalls: Array<{ name: string; value: unknown }> = []
    const ref = {
      host: opts.hostElement,
      child,
      componentType: type,
      location: { nativeElement: opts.hostElement },
      hostView: { id: hoisted.createdRefs.length },
      changeDetectorRef: { detectChanges: () => {} },
      setInput: (name: string, value: unknown) => {
        setInputCalls.push({ name, value })
      },
      setInputCalls,
      injector: {},
      destroy: () => {
        child.remove()
        for (const cb of onDestroyCbs) cb()
      },
      onDestroy: (cb: () => void) => {
        onDestroyCbs.push(cb)
      },
    }
    hoisted.createdRefs.push(ref)
    return ref
  }
  const reflectComponentType = (_type: unknown) => ({
    inputs: [{ propName: 'theme' }, { propName: 'devtoolsOpen' }],
  })

  // --- lifecycle hooks ---
  const afterNextRender = (cb: () => void) => {
    hoisted.afterNextRenderCb = cb
  }
  // A reactive effect: tracks signals it reads and re-runs when they change.
  const effect = (cb: () => void) => {
    const run = () => {
      const prev = activeEffect
      activeEffect = run
      try {
        cb()
      } finally {
        activeEffect = prev
      }
    }
    run()
  }

  return {
    ApplicationRef,
    ChangeDetectionStrategy: { OnPush: 0 },
    Component: () => (target: unknown) => target,
    ComponentRef: class {},
    DestroyRef,
    ElementRef,
    EnvironmentInjector,
    Injector,
    Type: class {},
    afterNextRender,
    computed,
    createComponent,
    effect,
    inject,
    input,
    isSignal,
    reflectComponentType,
    runInInjectionContext,
    signal,
    untracked,
  }
})

function setSignal(sig: unknown, value: unknown) {
  // `input()` returns an `InputSignal` whose setter is not on its public type.
  ;(sig as { set: (v: unknown) => void }).set(value)
}

function createAdapter(plugin: {
  id?: string
  name?: string | (new () => unknown)
  render?: unknown
  defaultOpen?: boolean
}) {
  const instance = new TanStackDevtools()
  setSignal(instance.plugins, [
    {
      id: plugin.id ?? 'test',
      defaultOpen: plugin.defaultOpen ?? true,
      name: (plugin.name ?? 'Test') as never,
      render: plugin.render as never,
    },
  ])
  setSignal(instance.config, undefined)
  setSignal(instance.eventBusConfig, undefined)
  // Drive the adapter past `afterNextRender`, where the core is constructed
  // and the converted plugin callbacks are captured.
  hoisted.afterNextRenderCb?.()
  return {
    instance,
    plugins: hoisted.capturedPlugins.mock
      .calls.at(-1)![0] as Array<TanStackDevtoolsPlugin>,
  }
}

describe('TanStackDevtools (angular adapter)', () => {
  beforeEach(() => {
    hoisted.capturedPlugins.mockClear()
    hoisted.createdRefs.length = 0
    hoisted.views.clear()
    hoisted.afterNextRenderCb = null
  })

  describe('plugin panel render callback (class component)', () => {
    class PanelComponent {}

    it('keeps a single panel and updates it in place across re-renders', () => {
      const { plugins } = createAdapter({ name: 'Test', render: PanelComponent })
      const container = document.createElement('div')
      container.id = 'plugin-container-test'

      for (const devtoolsOpen of [true, false, true, false, true]) {
        plugins[0]!.render(container, { theme: 'dark', devtoolsOpen })
      }

      // One mount in the container, one view on the ApplicationRef — re-renders
      // reuse the existing mount instead of stacking a second one.
      expect(container.children).toHaveLength(1)
      expect(hoisted.views.size).toBe(1)
      expect(hoisted.createdRefs.filter((r) => r.host === container)).toHaveLength(
        1,
      )
    })

    it('propagates the latest render props to the live mount', () => {
      const { plugins } = createAdapter({ name: 'Test', render: PanelComponent })
      const container = document.createElement('div')
      container.id = 'plugin-container-test'

      plugins[0]!.render(container, { theme: 'dark', devtoolsOpen: true })
      const ref = hoisted.createdRefs.at(-1)!

      // A theme/open toggle re-invokes render with new props; the same mount is
      // updated (setInput), not replaced.
      plugins[0]!.render(container, { theme: 'light', devtoolsOpen: false })

      expect(container.children).toHaveLength(1)
      expect(hoisted.createdRefs.at(-1)).toBe(ref)
      const applied = ref.setInputCalls.filter((c) => c.name === 'theme')
      expect(applied.at(-1)!.value).toBe('light')
      const open = ref.setInputCalls.filter((c) => c.name === 'devtoolsOpen')
      expect(open.at(-1)!.value).toBe(false)
    })

    it('tears down the panel when the plugin is destroyed', () => {
      const { plugins } = createAdapter({ name: 'Test', render: PanelComponent })
      const container = document.createElement('div')
      container.id = 'plugin-container-test'

      plugins[0]!.render(container, { theme: 'dark', devtoolsOpen: true })
      plugins[0]!.destroy?.('test')

      expect(container.children).toHaveLength(0)
      expect(hoisted.views.size).toBe(0)
    })

    it('re-mounts after the plugin is closed and reopened', () => {
      const { plugins } = createAdapter({ name: 'Test', render: PanelComponent })

      const first = document.createElement('div')
      first.id = 'plugin-container-test'
      plugins[0]!.render(first, { theme: 'dark', devtoolsOpen: true })
      plugins[0]!.destroy?.('test')

      // The core hands a fresh mount element when a plugin reopens; a new mount
      // must be created for it.
      const reopened = document.createElement('div')
      reopened.id = 'plugin-container-test'
      plugins[0]!.render(reopened, { theme: 'dark', devtoolsOpen: true })

      expect(reopened.children).toHaveLength(1)
      expect(hoisted.views.size).toBe(1)
    })
  })

  describe('plugin tab title callback (class component)', () => {
    class TitleComponent {}

    it('keeps a single title and updates it in place across re-renders', () => {
      const { plugins } = createAdapter({ name: TitleComponent, render: null })
      const heading = document.createElement('h3')
      heading.id = 'plugin-title-container-test'

      for (const devtoolsOpen of [true, false, true, false, true]) {
        ;(plugins[0]!.name as unknown as (
          e: HTMLElement,
          props: { theme: string; devtoolsOpen: boolean }
        ) => void)(heading, { theme: 'dark', devtoolsOpen })
      }

      expect(heading.children).toHaveLength(1)
      expect(hoisted.views.size).toBe(1)
      expect(hoisted.createdRefs.filter((r) => r.host === heading)).toHaveLength(
        1,
      )
    })
  })

  describe('plugin panel render callback (functional component)', () => {
    it('mounts the functional panel once and updates it in place', async () => {
      const setups = vi.fn()
      const teardowns = vi.fn()
      const renderFn = () => {
        return (_inputs: () => unknown, host: HTMLElement) => {
          setups()
          const el = document.createElement('div')
          el.className = 'fn-panel'
          host.appendChild(el)
          return () => {
            teardowns()
            el.remove()
          }
        }
      }

      const { plugins } = createAdapter({ name: 'Test', render: renderFn })
      const container = document.createElement('div')
      container.id = 'plugin-container-test'

      for (const devtoolsOpen of [true, false, true, false, true]) {
        await plugins[0]!.render(container, { theme: 'dark', devtoolsOpen })
      }

      // The functional render callback is awaited once; the core's subsequent
      // re-renders update the existing mount's inputs instead of starting a
      // second setup. Exactly one host view, one element, one setup.
      expect(hoisted.views.size).toBe(1)
      expect(setups).toHaveBeenCalledOnce()
      expect(teardowns).not.toHaveBeenCalled()
      expect(container.querySelectorAll('.fn-panel')).toHaveLength(1)

      plugins[0]!.destroy?.('test')
      expect(container.querySelectorAll('.fn-panel')).toHaveLength(0)
      expect(hoisted.views.size).toBe(0)
      expect(teardowns).toHaveBeenCalledOnce()
    })
  })

  describe('open/close lifecycle (no leak across re-mounts)', () => {
    class PanelComponent {}

    it('does not accumulate views across many render/destroy cycles', () => {
      const { plugins } = createAdapter({ name: 'Test', render: PanelComponent })

      for (let i = 0; i < 4; i++) {
        const container = document.createElement('div')
        container.id = 'plugin-container-test'
        plugins[0]!.render(container, { theme: 'dark', devtoolsOpen: true })
        plugins[0]!.destroy?.('test')
      }

      expect(hoisted.views.size).toBe(0)
    })
  })
})
