import '@testing-library/jest-dom/vitest'
import React, { useEffect, useState } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TanStackDevtoolsCore } from '@tanstack/devtools'
import { TanStackDevtools } from '../src/devtools'
import type {
  TanStackDevtoolsPlugin,
  TanStackDevtoolsPluginProps,
} from '@tanstack/devtools'

vi.mock('@tanstack/devtools', () => {
  const TanStackDevtoolsCore = vi.fn(
    class {
      mount = vi.fn()
      unmount = vi.fn()
      setConfig = vi.fn()
    },
  )
  return {
    TanStackDevtoolsCore,
    PLUGIN_CONTAINER_ID: 'plugin-container',
    PLUGIN_TITLE_CONTAINER_ID: 'plugin-title-container',
  }
})

const CoreMock = vi.mocked(TanStackDevtoolsCore)

const PLUGIN_KEY = (id: string) => `plugin-container-${id}`
const TITLE_KEY = (id: string) => `plugin-title-container-${id}`

const PROPS: TanStackDevtoolsPluginProps = { theme: 'dark', devtoolsOpen: true }

type CoreInstance = {
  mount: ReturnType<typeof vi.fn>
  unmount: ReturnType<typeof vi.fn>
  setConfig: ReturnType<typeof vi.fn>
}

const lastCoreInstance = (): CoreInstance =>
  CoreMock.mock.results.at(-1)!.value as CoreInstance

const pluginsFromCtor = (): Array<TanStackDevtoolsPlugin> =>
  (
    CoreMock.mock.calls.at(-1)![0] as {
      plugins: Array<TanStackDevtoolsPlugin>
    }
  ).plugins

const pluginsFromLastSetConfig = (): Array<TanStackDevtoolsPlugin> => {
  const setConfig = lastCoreInstance().setConfig
  const call = setConfig.mock.calls.at(-1)!
  return (call[0] as { plugins: Array<TanStackDevtoolsPlugin> }).plugins
}

const mountPane = (id: string): HTMLDivElement => {
  const el = document.createElement('div')
  el.setAttribute('id', PLUGIN_KEY(id))
  document.body.appendChild(el)
  return el
}

const mountTitle = (id: string): HTMLHeadingElement => {
  const el = document.createElement('h3')
  el.setAttribute('id', TITLE_KEY(id))
  document.body.appendChild(el)
  return el
}

type ProbeRecord = {
  mounted: boolean
  mounts: number
  cleanups: number
  ticks: number
}
const probeState: Record<string, ProbeRecord> = {}

const probe = (id: string): ProbeRecord => probeState[id]!

const Probe = ({ id }: { id: string }) => {
  const [, force] = useState(0)
  useEffect(() => {
    const record: ProbeRecord = probeState[id] ?? {
      mounted: false,
      mounts: 0,
      cleanups: 0,
      ticks: 0,
    }
    probeState[id] = record
    record.mounted = true
    record.mounts += 1
    const handle = setInterval(() => {
      record.ticks += 1
      force((n) => n + 1)
    }, 10)
    return () => {
      clearInterval(handle)
      record.mounted = false
      record.cleanups += 1
    }
  }, [id])
  return <span data-testid={`probe-${id}`}>probe-{id}</span>
}

const plugin = (
  id: string,
  options: { destroy?: (pluginId: string) => void } = {},
) => ({
  id,
  name: id.toUpperCase(),
  render: () => <Probe id={id} />,
  ...(options.destroy ? { destroy: options.destroy } : {}),
})

describe('TanStackDevtools plugin cleanup', () => {
  beforeEach(() => {
    CoreMock.mockClear()
    for (const key of Object.keys(probeState)) delete probeState[key]
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('unmounts the plugin component when destroy fires (effects clean up) and forwards to the user destroy', () => {
    const userDestroy = vi.fn()
    act(() => {
      render(
        <TanStackDevtools plugins={[plugin('p', { destroy: userDestroy })]} />,
      )
    })
    const corePlugin = pluginsFromCtor()[0]!
    const pane = mountPane('p')

    act(() => {
      corePlugin.render(pane, PROPS)
    })
    expect(pane.querySelector('[data-testid="probe-p"]')).toBeInTheDocument()
    expect(probe('p').mounted).toBe(true)
    expect(probe('p').cleanups).toBe(0)

    act(() => {
      corePlugin.destroy!('p')
    })

    expect(
      pane.querySelector('[data-testid="probe-p"]'),
    ).not.toBeInTheDocument()
    expect(probe('p').mounted).toBe(false)
    expect(probe('p').cleanups).toBe(1)
    expect(userDestroy).toHaveBeenCalledTimes(1)
    expect(userDestroy).toHaveBeenCalledWith('p')
  })

  it('prunes the title portal when the pane renders (opens), so the title component unmounts', () => {
    act(() => {
      render(
        <TanStackDevtools
          plugins={[
            {
              id: 'p',
              name: <Probe id="p-title" />,
              render: () => <Probe id="p" />,
            },
          ]}
        />,
      )
    })
    const corePlugin = pluginsFromCtor()[0]!
    const title = mountTitle('p')

    act(() => {
      ;(
        corePlugin.name as (
          el: HTMLHeadingElement,
          props: TanStackDevtoolsPluginProps,
        ) => void
      )(title, PROPS)
    })
    expect(
      title.querySelector('[data-testid="probe-p-title"]'),
    ).toBeInTheDocument()
    expect(probe('p-title').mounted).toBe(true)

    const pane = mountPane('p')
    act(() => {
      corePlugin.render(pane, PROPS)
    })

    expect(
      title.querySelector('[data-testid="probe-p-title"]'),
    ).not.toBeInTheDocument()
    expect(probe('p-title').mounted).toBe(false)
    expect(probe('p-title').cleanups).toBe(1)
    expect(pane.querySelector('[data-testid="probe-p"]')).toBeInTheDocument()
    expect(probe('p').mounted).toBe(true)
  })

  it('recreating a pane (reopen) re-attaches the portal to the new container', () => {
    const userDestroy = vi.fn()
    act(() => {
      render(
        <TanStackDevtools plugins={[plugin('p', { destroy: userDestroy })]} />,
      )
    })
    const corePlugin = pluginsFromCtor()[0]!

    const firstPane = mountPane('p')
    act(() => {
      corePlugin.render(firstPane, PROPS)
    })
    expect(
      firstPane.querySelector('[data-testid="probe-p"]'),
    ).toBeInTheDocument()

    act(() => {
      corePlugin.destroy!('p')
    })
    expect(
      firstPane.querySelector('[data-testid="probe-p"]'),
    ).not.toBeInTheDocument()
    expect(probe('p').cleanups).toBe(1)

    const reopenedPane = mountPane('p')
    act(() => {
      corePlugin.render(reopenedPane, PROPS)
    })
    expect(
      reopenedPane.querySelector('[data-testid="probe-p"]'),
    ).toBeInTheDocument()
    expect(probe('p').mounted).toBe(true)
    expect(probe('p').mounts).toBe(2)
  })

  it('prunes a plugin portal when the plugin is removed from the plugins prop (no destroy fires)', () => {
    let rerender: (ui: React.ReactElement) => void = () => {}
    act(() => {
      const result = render(
        <TanStackDevtools plugins={[plugin('a'), plugin('b')]} />,
      )
      rerender = result.rerender
    })
    const ctorPlugins = pluginsFromCtor()
    const paneA = mountPane('a')
    const paneB = mountPane('b')
    act(() => {
      ctorPlugins[0]!.render(paneA, PROPS)
      ctorPlugins[1]!.render(paneB, PROPS)
    })
    expect(paneA.querySelector('[data-testid="probe-a"]')).toBeInTheDocument()
    expect(paneB.querySelector('[data-testid="probe-b"]')).toBeInTheDocument()

    act(() => {
      rerender(<TanStackDevtools plugins={[plugin('a')]} />)
    })

    expect(paneA.querySelector('[data-testid="probe-a"]')).toBeInTheDocument()
    expect(probe('a').mounted).toBe(true)
    expect(probe('a').cleanups).toBe(0)
    expect(
      paneB.querySelector('[data-testid="probe-b"]'),
    ).not.toBeInTheDocument()
    expect(probe('b').mounted).toBe(false)
    expect(probe('b').cleanups).toBe(1)
  })

  it('prunes a title portal when its plugin is removed from the plugins prop', () => {
    let rerender: (ui: React.ReactElement) => void = () => {}
    act(() => {
      const result = render(
        <TanStackDevtools
          plugins={[
            {
              id: 'a',
              name: <Probe id="a-title" />,
              render: () => <Probe id="a" />,
            },
          ]}
        />,
      )
      rerender = result.rerender
    })
    const corePlugin = pluginsFromCtor()[0]!
    const title = mountTitle('a')
    act(() => {
      ;(
        corePlugin.name as (
          el: HTMLHeadingElement,
          props: TanStackDevtoolsPluginProps,
        ) => void
      )(title, PROPS)
    })
    expect(
      title.querySelector('[data-testid="probe-a-title"]'),
    ).toBeInTheDocument()

    act(() => {
      rerender(<TanStackDevtools plugins={[]} />)
    })

    expect(
      title.querySelector('[data-testid="probe-a-title"]'),
    ).not.toBeInTheDocument()
    expect(probe('a-title').mounted).toBe(false)
    expect(probe('a-title').cleanups).toBe(1)
  })

  it('adding a plugin keeps existing plugin portals mounted', () => {
    let rerender: (ui: React.ReactElement) => void = () => {}
    act(() => {
      const result = render(<TanStackDevtools plugins={[plugin('a')]} />)
      rerender = result.rerender
    })
    const paneA = mountPane('a')
    act(() => {
      pluginsFromCtor()[0]!.render(paneA, PROPS)
    })
    expect(paneA.querySelector('[data-testid="probe-a"]')).toBeInTheDocument()

    act(() => {
      rerender(<TanStackDevtools plugins={[plugin('a'), plugin('b')]} />)
    })

    expect(paneA.querySelector('[data-testid="probe-a"]')).toBeInTheDocument()
    expect(probe('a').mounted).toBe(true)
    expect(probe('a').cleanups).toBe(0)

    const paneB = mountPane('b')
    act(() => {
      pluginsFromLastSetConfig()[1]!.render(paneB, PROPS)
    })
    expect(paneB.querySelector('[data-testid="probe-b"]')).toBeInTheDocument()
  })
})
