import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { A11yPluginOptions } from '../src/core/types/types'

type PanelElement = {
  props: {
    options?: A11yPluginOptions
    theme?: unknown
    devtoolsOpen?: unknown
  }
}

const { captures } = vi.hoisted(() => ({
  captures: [] as Array<{
    name: string
    component: (props: unknown) => unknown
  }>,
}))

vi.mock('@tanstack/devtools-utils/react', () => ({
  createReactPanel: () => [() => null, () => null],
  createReactPlugin: ({ name, Component }: any) => {
    captures.push({ name, component: Component })
    return [
      () => ({ name, render: () => null }),
      () => ({ name, render: () => null }),
    ]
  },
}))

afterEach(() => {
  vi.resetModules()
  captures.length = 0
})

describe('a11yDevtoolsPlugin (React) options threading', () => {
  beforeEach(() => {
    captures.length = 0
  })

  it('returns a plugin and forwards options onto the panel element', async () => {
    const { a11yDevtoolsPlugin } = await import('../src/react/plugin')
    const plugin = a11yDevtoolsPlugin({
      threshold: 'critical',
      ruleSet: 'wcag2a',
      showOverlays: false,
    })

    expect(plugin).toMatchObject({ name: 'TanStack A11y' })
    expect(captures).toHaveLength(1)
    expect(captures[0]?.name).toBe('TanStack A11y')

    const component = captures[0]!.component
    const element = component({
      theme: 'dark',
      devtoolsOpen: true,
    }) as PanelElement

    // React.createElement returns an element whose props carry the forwarded options
    expect(element.props.options).toEqual({
      threshold: 'critical',
      ruleSet: 'wcag2a',
      showOverlays: false,
    })
    expect(element.props.theme).toBe('dark')
    expect(element.props.devtoolsOpen).toBe(true)
  })

  it('threads no options when called with no arguments', async () => {
    const { a11yDevtoolsPlugin } = await import('../src/react/plugin')
    a11yDevtoolsPlugin()

    const component = captures[0]!.component
    const element = component({
      theme: 'light',
      devtoolsOpen: false,
    }) as PanelElement

    expect(element.props.options).toBeUndefined()
    expect(element.props.theme).toBe('light')
    expect(element.props.devtoolsOpen).toBe(false)
  })

  it('keeps the no-op plugin name in production shape', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    captures.length = 0
    const { a11yDevtoolsNoOpPlugin } = await import('../src/react/plugin')
    const plugin = a11yDevtoolsNoOpPlugin()
    expect(plugin).toMatchObject({ name: 'TanStack A11y' })
    vi.unstubAllEnvs()
  })
})
