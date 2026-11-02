import { render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TanStackDevtoolsCore } from '@tanstack/devtools'
import SolidDevtoolsCore from '../src/core'
import type { TanStackDevtoolsSolidPlugin } from '../src/core'
import type { JSX } from 'solid-js'
import type { TanStackDevtoolsTheme } from '@tanstack/devtools'

// The real core mounts the full Solid/goober UI tree, which is heavy in jsdom
// and irrelevant to testing how the adapter propagates prop changes. Mock it
// down to the methods the adapter actually calls (constructor + mount +
// unmount + setConfig) so the reactivity pipeline can be observed in
// isolation. This is the same mocking pattern used by the React adapter test.
vi.mock('@tanstack/devtools', () => {
  // Vitest 4 constructs mocks with `new`; arrow functions are not constructors.
  const TanStackDevtoolsCore = vi.fn(
    class {
      mount = vi.fn()
      unmount = vi.fn()
      setConfig = vi.fn()
    },
  )
  return { TanStackDevtoolsCore }
})

const CoreMock = vi.mocked(TanStackDevtoolsCore)

const setConfigArgs = () =>
  (
    CoreMock.mock.results[0]!.value as {
      setConfig: ReturnType<typeof vi.fn>
    }
  ).setConfig.mock.calls.map((args) => args[0]) as Array<
    Record<string, unknown>
  >

const callsWith = (key: string) => setConfigArgs().filter((arg) => key in arg)

describe('SolidDevtoolsCore prop reactivity', () => {
  beforeEach(() => {
    CoreMock.mockClear()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  // Guard against the Solid footgun where destructuring props in the component
  // signature severs reactivity: prop changes must still reach the core via
  // setConfig. The plugins and config paths are tracked separately because
  // both were broken by the same destructured-props bug and each has its own
  // effect in core.tsx.

  it('pushes updated plugins to the core when the plugins prop changes', () => {
    const pluginA: TanStackDevtoolsSolidPlugin = {
      id: 'a',
      name: 'A',
      render: <div>A</div>,
    }
    const pluginB: TanStackDevtoolsSolidPlugin = {
      id: 'b',
      name: 'B',
      render: <div>B</div>,
    }
    const [plugins, setPlugins] = createSignal<
      Array<TanStackDevtoolsSolidPlugin>
    >([pluginA])

    render(() => <SolidDevtoolsCore plugins={plugins()} />)

    expect(callsWith('plugins')).toHaveLength(1)

    // Flip the signal to a 2-plugin array. The plugins memo must re-compute
    // and the "update plugins when they change" effect must push the new
    // array to the core via setConfig.
    setPlugins([pluginA, pluginB])

    const pluginsCalls = callsWith('plugins')
    expect(pluginsCalls).toHaveLength(2)
    const updated = pluginsCalls[1]!.plugins as Array<{ id?: string }>
    expect(updated).toHaveLength(2)
    expect(updated[0]!.id).toBe('a')
    expect(updated[1]!.id).toBe('b')
  })

  it('pushes updated config to the core when the config prop changes', () => {
    const [config, setConfig] = createSignal<{ theme?: TanStackDevtoolsTheme }>(
      { theme: 'dark' },
    )

    render(() => <SolidDevtoolsCore config={config()} />)

    expect(callsWith('config')).toHaveLength(1)
    expect(callsWith('config')[0]!.config).toMatchObject({ theme: 'dark' })

    setConfig({ theme: 'light' })

    const configCalls = callsWith('config')
    expect(configCalls).toHaveLength(2)
    expect(configCalls[1]!.config).toMatchObject({ theme: 'light' })
  })

  it('applies the current customTrigger when the config prop changes', () => {
    // Guards that convertTrigger resolves the trigger lazily from
    // props.config.customTrigger rather than a value captured at setup.
    const triggerA = vi.fn(
      (): JSX.Element => <div data-testid="trigger-a">A</div>,
    )
    const triggerB = vi.fn(
      (): JSX.Element => <div data-testid="trigger-b">B</div>,
    )
    type CustomTrigger = (
      el: HTMLElement,
      props: { theme: TanStackDevtoolsTheme },
    ) => JSX.Element
    const [config, setConfig] = createSignal<{ customTrigger?: CustomTrigger }>(
      { customTrigger: triggerA },
    )

    render(() => <SolidDevtoolsCore config={config()} />)

    expect(callsWith('config')).toHaveLength(1)

    setConfig({ customTrigger: triggerB })

    const configCalls = callsWith('config')
    expect(configCalls).toHaveLength(2)
    const wrapperAfter = configCalls[1]!.config as {
      customTrigger?: CustomTrigger
    }
    expect(typeof wrapperAfter.customTrigger).toBe('function')

    // After the swap, the wrapper must invoke triggerB and never the stale
    // triggerA. Render the returned Portal so its children are evaluated in a
    // proper reactive root.
    triggerA.mockClear()
    triggerB.mockClear()
    render(() =>
      wrapperAfter.customTrigger!(document.createElement('div'), {
        theme: 'dark',
      }),
    )
    expect(triggerB).toHaveBeenCalledTimes(1)
    expect(triggerA).not.toHaveBeenCalled()
  })
})
