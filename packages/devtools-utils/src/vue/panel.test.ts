import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVuePanel } from './panel'

// Minimal stand-in for a class-based devtools core, mirroring the contract of
// the real TanStackDevtoolsCore (construct -> mount -> unmount).
function makeCoreClass() {
  const coreMount = vi.fn()
  const coreUnmount = vi.fn()
  const construct = vi.fn<(...args: Array<unknown>) => void>()
  class Core {
    mount = coreMount
    unmount = coreUnmount
    constructor(...args: Array<unknown>) {
      construct(...args)
    }
  }
  return { Core, construct, coreMount, coreUnmount }
}

const pluginProps = () => ({ theme: 'dark' as const, devtoolsOpen: true })

// A parent that conditionally renders the Panel via v-if, exposing a `show`
// ref through the closure so the test can toggle it imperatively.
function makeToggleParent(Panel: unknown, show: { value: boolean }) {
  return defineComponent({
    setup() {
      return () =>
        show.value
          ? h(Panel as never, {
              props: pluginProps(),
              devtoolsProps: pluginProps(),
            })
          : null
    },
  })
}

describe('createVuePanel', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('constructs and mounts the core instance into the rendered div on mount', () => {
    const { Core, construct, coreMount } = makeCoreClass()
    const [Panel] = createVuePanel(Core as any)
    const host = document.createElement('div')
    const devtoolsProps = pluginProps()
    const props = pluginProps()

    const app = createApp(Panel, { props, devtoolsProps })
    app.mount(host)

    expect(construct).toHaveBeenCalledTimes(1)
    expect(construct).toHaveBeenCalledWith(devtoolsProps)
    expect(coreMount).toHaveBeenCalledTimes(1)
    expect(coreMount).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      props,
    )

    const mountedEl = coreMount.mock.calls[0]![0] as HTMLElement
    expect(mountedEl.tagName).toBe('DIV')
    expect(mountedEl.parentElement).toBe(host)

    app.unmount()
  })

  it('unmounts the core instance when the panel is unmounted via app.unmount()', () => {
    const { Core, coreMount, coreUnmount } = makeCoreClass()
    const [Panel] = createVuePanel(Core as any)
    const host = document.createElement('div')

    const app = createApp(Panel, {
      props: pluginProps(),
      devtoolsProps: pluginProps(),
    })
    app.mount(host)
    expect(coreMount).toHaveBeenCalledTimes(1)
    expect(coreUnmount).not.toHaveBeenCalled()

    app.unmount()
    expect(coreUnmount).toHaveBeenCalledTimes(1)
    // Vue removes the rendered subtree from the host on unmount.
    expect(host.children).toHaveLength(0)
  })

  it('unmounts the core instance when the panel is removed via v-if', async () => {
    const { Core, coreMount, coreUnmount } = makeCoreClass()
    const [Panel] = createVuePanel(Core as any)

    const show = ref(true)
    const Parent = makeToggleParent(Panel, show)
    const host = document.createElement('div')
    const app = createApp(Parent)
    app.mount(host)
    expect(coreMount).toHaveBeenCalledTimes(1)
    expect(coreUnmount).not.toHaveBeenCalled()

    // Vue nulls the template ref during the synchronous unmount traversal,
    // *before* onUnmounted runs — this is the regression path for the bug.
    show.value = false
    await nextTick()

    expect(coreUnmount).toHaveBeenCalledTimes(1)
    expect(host.children).toHaveLength(0)

    app.unmount()
  })

  it('NoOpPanel never constructs, mounts, or unmounts the core instance', () => {
    const { Core, construct, coreMount, coreUnmount } = makeCoreClass()
    const [, NoOpPanel] = createVuePanel(Core as any)
    const host = document.createElement('div')

    const app = createApp(NoOpPanel, {
      props: pluginProps(),
      devtoolsProps: pluginProps(),
    })
    app.mount(host)

    expect(construct).not.toHaveBeenCalled()
    expect(coreMount).not.toHaveBeenCalled()
    expect(host.children).toHaveLength(0)

    app.unmount()
    expect(coreUnmount).not.toHaveBeenCalled()
  })
})
