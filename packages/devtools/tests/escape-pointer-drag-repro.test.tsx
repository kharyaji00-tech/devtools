import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevTools from '../src/devtools'
import { DevtoolsProvider } from '../src/context/devtools-context'
import { PiPProvider } from '../src/context/pip-context'
import { flattenTabs } from '../src/utils/layout-tree'
import { TANSTACK_DEVTOOLS_STATE } from '../src/utils/storage'
import type {
  TanStackDevtoolsConfig,
  TanStackDevtoolsPlugin,
} from '../src/context/devtools-context'

const disposers: Array<() => void> = []

const plugin = (id: string): TanStackDevtoolsPlugin => ({
  id,
  name: `Plugin ${id}`,
  render: (mount) => {
    mount.textContent = id
  },
})

const mountWorkbench = (plugins: Array<TanStackDevtoolsPlugin>) => {
  const host = document.body.appendChild(document.createElement('div'))
  const dispose = render(
    () =>
      createComponent(DevtoolsProvider, {
        plugins,
        config: { defaultOpen: true } as TanStackDevtoolsConfig,
        get children() {
          return createComponent(PiPProvider, {
            get children() {
              return createComponent(DevTools, {})
            },
          })
        },
      }),
    host,
  )
  disposers.push(dispose)
  return host
}

const click = (name: string) => {
  const control = [
    ...document.querySelectorAll<HTMLElement>('button,[role="button"]'),
  ].find(
    (node) =>
      node.getAttribute('aria-label') === name ||
      node.textContent.trim() === name,
  )
  expect(control, `missing control ${name}`).toBeTruthy()
  control!.click()
}

const storedLayout = () =>
  flattenTabs(JSON.parse(localStorage.getItem(TANSTACK_DEVTOOLS_STATE)!).layout)

const workspace = () =>
  document.querySelector<HTMLElement>('[data-testid="plugins-workspace"]')!
const preview = () =>
  document.querySelector<HTMLElement>('[data-testid="plugin-drag-preview"]')
const overlay = () =>
  document.querySelector<HTMLElement>('[data-testid="plugin-drop-overlay"]')
const status = () =>
  document.querySelector<HTMLElement>(
    '[data-testid="plugin-workspace-status"]',
  )!

const pointer = (el: EventTarget, type: string, x: number, y: number) =>
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
    }),
  )

const keydown = (el: EventTarget, key: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

const DRAG_HOLD_MS = 500

const openTwoPlugins = () => {
  mountWorkbench([plugin('one'), plugin('two')])
  click('Plugin one')
  click('Plugin two')
  // Two plugins opened from the strip land side by side: group g0 holds "one"
  // on the left, group g1 holds "two" on the right.
  expect(storedLayout()).toEqual(['one', 'two'])
  return document.querySelector<HTMLElement>('[data-testid="plugin-tab-one"]')!
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  // jsdom has no layout engine, so the workspace and every group rect would
  // measure zero and hit-testing would find no drop target. Give the workspace
  // a real box (1000x400 at the origin) so the two panes lay out left/right and
  // the pointer coordinates below land inside real groups.
  const nativeRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.getAttribute('data-testid') === 'plugins-workspace') {
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 1000,
          bottom: 400,
          left: 0,
          width: 1000,
          height: 400,
          toJSON: () => ({}),
        }
      }
      return nativeRect.call(this)
    },
  )
  vi.useFakeTimers()
})

afterEach(() => {
  try {
    while (disposers.length) disposers.pop()!()
    document.body.replaceChildren()
  } finally {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  }
})

describe('Escape aborts an in-progress pointer tab drag', () => {
  it('control: a pointer drag without Escape stacks the tab into the target group', () => {
    const tab = openTwoPlugins()

    // Hold to pick the tab up. Before the hold elapses there is no drag.
    pointer(tab, 'pointerdown', 250, 200)
    expect(workspace()).not.toHaveAttribute('data-tsd-dragging')
    vi.advanceTimersByTime(DRAG_HOLD_MS)
    expect(workspace()).toHaveAttribute('data-tsd-dragging', 'true')
    expect(preview()).not.toBeNull()

    // (750, 200) is the centre of the right-hand group ("two"); the drop
    // resolves to stacking "one" into it.
    pointer(document, 'pointermove', 750, 200)
    expect(overlay()).not.toBeNull()
    pointer(document, 'pointerup', 750, 200)

    // "one" stacked into "two"'s group: a single group ["two", "one"].
    expect(storedLayout()).toEqual(['two', 'one'])
    expect(workspace()).not.toHaveAttribute('data-tsd-dragging')
    expect(preview()).toBeNull()
    expect(overlay()).toBeNull()
  })

  it('Escape cancels the pointer drag: the preview never resurrects and the release is a no-op', () => {
    const tab = openTwoPlugins()

    pointer(tab, 'pointerdown', 250, 200)
    vi.advanceTimersByTime(DRAG_HOLD_MS)
    expect(workspace()).toHaveAttribute('data-tsd-dragging', 'true')
    expect(preview()).not.toBeNull()

    // Escape announces a cancel and clears every shared drag signal.
    keydown(tab, 'Escape')
    expect(status()).toHaveTextContent('Plugin one left where it was')
    expect(workspace()).not.toHaveAttribute('data-tsd-dragging')
    expect(preview()).toBeNull()
    expect(overlay()).toBeNull()

    // The pointer gesture is now aborted: moving the cursor must NOT bring the
    // drag preview, the drop overlay, or the dragging attribute back.
    pointer(document, 'pointermove', 750, 200)
    expect(preview()).toBeNull()
    expect(overlay()).toBeNull()
    expect(workspace()).not.toHaveAttribute('data-tsd-dragging')

    // Releasing the pointer must NOT commit the cancelled drop.
    pointer(document, 'pointerup', 750, 200)
    expect(storedLayout()).toEqual(['one', 'two'])
    expect(preview()).toBeNull()
    expect(overlay()).toBeNull()
  })

  it('Escape does not leave the gesture stuck: a later drag can still pick up and drop', () => {
    const tab = openTwoPlugins()

    pointer(tab, 'pointerdown', 250, 200)
    vi.advanceTimersByTime(DRAG_HOLD_MS)
    keydown(tab, 'Escape')
    pointer(document, 'pointermove', 750, 200)
    pointer(document, 'pointerup', 750, 200)
    expect(storedLayout()).toEqual(['one', 'two'])

    // A fresh drag on the same tab still works end to end.
    pointer(tab, 'pointerdown', 250, 200)
    vi.advanceTimersByTime(DRAG_HOLD_MS)
    expect(workspace()).toHaveAttribute('data-tsd-dragging', 'true')
    pointer(document, 'pointermove', 750, 200)
    pointer(document, 'pointerup', 750, 200)
    expect(storedLayout()).toEqual(['two', 'one'])
  })
})
