import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevTools from '../src/devtools'
import { DevtoolsProvider } from '../src/context/devtools-context'
import { PiPProvider } from '../src/context/pip-context'
import { TANSTACK_DEVTOOLS_STATE } from '../src/utils/storage'
import { PANE_CARD_INSET } from '../src/utils/constants'
import type {
  TanStackDevtoolsConfig,
  TanStackDevtoolsPlugin,
  TanStackDevtoolsPluginProps,
} from '../src/context/devtools-context'

const disposers: Array<() => void> = []
const originalInnerWidth = window.innerWidth
const originalInnerHeight = window.innerHeight
const originalUserSelect = document.body.style.userSelect
const originalSetPointerCapture = Element.prototype.setPointerCapture
const originalReleasePointerCapture = Element.prototype.releasePointerCapture
const originalHasPointerCapture = Element.prototype.hasPointerCapture
let popup: Window

const plugin = (id: string): TanStackDevtoolsPlugin => ({
  id,
  name: (heading) => {
    heading.textContent = `Plugin ${id}`
  },
  render: (mount: HTMLElement, props: TanStackDevtoolsPluginProps) => {
    mount.textContent = id
    void props
  },
  destroy: (pluginId: string) => void pluginId,
})

const click = (name: string) => {
  const control = [
    ...document.querySelectorAll<HTMLElement>('button,[role="button"]'),
  ].find(
    (node) =>
      node.getAttribute('aria-label') === name ||
      node.textContent?.trim() === name,
  )
  expect(control, `missing control ${name}`).toBeTruthy()
  control!.click()
}

const mountWorkbench = (
  plugins: Array<TanStackDevtoolsPlugin>,
  config: Partial<TanStackDevtoolsConfig> = {},
) => {
  const host = document.body.appendChild(document.createElement('div'))
  const dispose = render(
    () =>
      createComponent(DevtoolsProvider, {
        plugins,
        config: { defaultOpen: true, ...config } as TanStackDevtoolsConfig,
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

const WORKSPACE_BOX = { width: 1674, height: 400 }

const mockWorkspaceRect = () => {
  const nativeRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.getAttribute('data-testid') === 'plugins-workspace') {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: WORKSPACE_BOX.width,
          bottom: WORKSPACE_BOX.height,
          width: WORKSPACE_BOX.width,
          height: WORKSPACE_BOX.height,
          toJSON: () => ({}),
        }
      }
      return nativeRect.call(this)
    },
  )
}

const pointer = (
  target: Element | Document,
  type: string,
  x: number,
  y: number,
) =>
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
    }),
  )

const workspace = () =>
  document.querySelector<HTMLElement>('[data-testid="plugins-workspace"]')!
const preview = () =>
  document.querySelector<HTMLElement>('[data-testid="plugin-drag-preview"]')
const overlay = () =>
  document.querySelector<HTMLElement>('[data-testid="plugin-drop-overlay"]')
const groupTabBars = () =>
  document.querySelectorAll('[data-testid^="plugin-group-tabs-"]').length
const splitters = () =>
  document.querySelectorAll('[data-testid="plugin-splitter"]').length
const liveRegion = () =>
  document
    .querySelector<HTMLElement>('[data-testid="plugin-workspace-status"]')
    ?.textContent?.trim()

/** Open two plugins in a split layout (two groups, one splitter). */
const mountTwoPanes = () => {
  mockWorkspaceRect()
  mountWorkbench(['one', 'two'].map(plugin))
  click('Plugin one')
  click('Plugin two')
}

/** Mount two plugins, open only the first so the second stays in the strip. */
const mountOneOpenOneInStrip = () => {
  mockWorkspaceRect()
  mountWorkbench(['one', 'two'].map(plugin))
  click('Plugin one')
}

const stripEntry = (id: string) =>
  document.querySelector<HTMLElement>(
    `[aria-labelledby="plugin-title-container-${id}"]`,
  )!

const pane = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid="plugin-pane-${id}"]`)

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.tanstackDevtoolsTheme
  document.body.style.userSelect = originalUserSelect
  history.replaceState({}, '', '/')
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  const popupDocument = document.implementation.createHTMLDocument('PiP')
  const listeners = new Map<string, EventListener>()
  popup = {
    document: popupDocument,
    close: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListener) =>
      listeners.set(type, listener),
    ),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn((event: Event) => {
      listeners.get(event.type)?.(event)
      return true
    }),
  } as unknown as Window
  vi.spyOn(window, 'open').mockReturnValue(popup)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
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
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
    })
    document.body.style.userSelect = originalUserSelect
    Element.prototype.setPointerCapture = originalSetPointerCapture
    Element.prototype.releasePointerCapture = originalReleasePointerCapture
    Element.prototype.hasPointerCapture = originalHasPointerCapture
  }
})

describe('plugin workspace pointercancel', { timeout: 30_000 }, () => {
  describe('tab drag (startTabDrag)', () => {
    it('pointercancel after hold ends the drag with no commit and no ghost drop on a later pointerup', () => {
      vi.useFakeTimers()
      try {
        mountTwoPanes()
        const tab = document.querySelector<HTMLElement>(
          '[data-testid="plugin-tab-one"]',
        )!
        expect(groupTabBars()).toBe(2)
        expect(splitters()).toBe(1)

        pointer(tab, 'pointerdown', 100, 10)
        vi.advanceTimersByTime(600)
        expect(workspace()).toHaveAttribute('data-tsd-dragging', 'true')
        expect(preview()).not.toBeNull()

        pointer(document, 'pointercancel', 100, 10)
        expect(workspace()).not.toHaveAttribute('data-tsd-dragging')
        expect(preview()).toBeNull()
        expect(overlay()).toBeNull()
        expect(groupTabBars()).toBe(2)
        expect(splitters()).toBe(1)

        // The leaked `pointerup` handler used to commit a ghost drop here.
        pointer(document, 'pointerup', 100, 10)
        expect(groupTabBars()).toBe(2)
        expect(splitters()).toBe(1)
        expect(preview()).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('pointerup after a completed hold still commits the drop (no regression)', () => {
      vi.useFakeTimers()
      try {
        mountTwoPanes()
        const tab = document.querySelector<HTMLElement>(
          '[data-testid="plugin-tab-one"]',
        )!
        pointer(tab, 'pointerdown', 100, 10)
        vi.advanceTimersByTime(600)
        expect(preview()).not.toBeNull()

        const padded = WORKSPACE_BOX.width - PANE_CARD_INSET * 2
        const rightCentre = PANE_CARD_INSET + padded * 0.75
        pointer(document, 'pointermove', rightCentre, 16)
        pointer(document, 'pointerup', rightCentre, 16)

        expect(preview()).toBeNull()
        expect(overlay()).toBeNull()
        expect(workspace()).not.toHaveAttribute('data-tsd-dragging')
        expect(groupTabBars()).toBe(1)
        expect(splitters()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('strip to workspace drag (startStripDrag + acceptStripDrags)', () => {
    it('pointercancel during the strip hold prevents the phantom handover', () => {
      vi.useFakeTimers()
      try {
        mountOneOpenOneInStrip()
        const entry = stripEntry('two')
        expect(entry, 'missing strip entry for two').toBeTruthy()
        expect(pane('two')).toBeNull()

        pointer(entry, 'pointerdown', 100, 50)
        pointer(document, 'pointercancel', 100, 50)
        vi.advanceTimersByTime(600)

        expect(workspace()).not.toHaveAttribute('data-tsd-dragging')
        expect(preview()).toBeNull()
        expect(overlay()).toBeNull()
        expect(pane('two')).toBeNull()

        pointer(document, 'pointerup', 100, 50)
        expect(pane('two')).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('pointercancel after handover ends the drag with no commit and no announce', () => {
      vi.useFakeTimers()
      try {
        mountOneOpenOneInStrip()
        const entry = stripEntry('two')
        pointer(entry, 'pointerdown', 100, 50)
        vi.advanceTimersByTime(600)

        expect(workspace()).toHaveAttribute('data-tsd-dragging', 'true')
        expect(preview()).not.toBeNull()
        expect(overlay()).not.toBeNull()
        const before = liveRegion()

        pointer(document, 'pointercancel', 100, 50)
        expect(workspace()).not.toHaveAttribute('data-tsd-dragging')
        expect(preview()).toBeNull()
        expect(overlay()).toBeNull()
        expect(pane('two')).toBeNull()
        expect(liveRegion()).toBe(before)
        expect(liveRegion()).not.toContain('was not placed')
      } finally {
        vi.useRealTimers()
      }
    })

    it('normal strip drag onto a pane opens and announces (no regression)', () => {
      vi.useFakeTimers()
      try {
        mountOneOpenOneInStrip()
        const entry = stripEntry('two')
        pointer(entry, 'pointerdown', 100, 50)
        vi.advanceTimersByTime(600)
        expect(preview()).not.toBeNull()

        const padded = WORKSPACE_BOX.width - PANE_CARD_INSET * 2
        const cx = PANE_CARD_INSET + padded / 2
        const cy = PANE_CARD_INSET + 16
        pointer(document, 'pointermove', cx, cy)
        pointer(document, 'pointerup', cx, cy)

        expect(pane('two')).not.toBeNull()
        expect(liveRegion()).toContain('stacked as a tab')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('splitter (startSplitterDrag)', () => {
    const splitterEl = () =>
      document.querySelector<HTMLElement>('[data-testid="plugin-splitter"]')!

    it('pointercancel restores body user-select and releases pointer capture', () => {
      vi.useFakeTimers()
      try {
        mountTwoPanes()
        const splitter = splitterEl()
        splitter.hasPointerCapture = () => true
        expect(document.body.style.userSelect).toBe('')

        pointer(splitter, 'pointerdown', 830, 400)
        expect(document.body.style.userSelect).toBe('none')

        pointer(document, 'pointermove', 900, 400)
        pointer(document, 'pointercancel', 900, 400)

        expect(document.body.style.userSelect).toBe('')
        expect(Element.prototype.releasePointerCapture).toHaveBeenCalledWith(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('pointercancel removes the pointermove listener so further moves do nothing', () => {
      vi.useFakeTimers()
      try {
        mountTwoPanes()
        const splitter = splitterEl()
        pointer(splitter, 'pointerdown', 830, 400)
        pointer(document, 'pointermove', 900, 400)
        const ariaAfterMove = splitter.getAttribute('aria-valuenow')
        const layoutAfterMove = localStorage.getItem(TANSTACK_DEVTOOLS_STATE)

        pointer(document, 'pointercancel', 900, 400)
        pointer(document, 'pointermove', 1200, 400)

        expect(splitter.getAttribute('aria-valuenow')).toBe(ariaAfterMove)
        expect(localStorage.getItem(TANSTACK_DEVTOOLS_STATE)).toBe(
          layoutAfterMove,
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it('normal pointerup keeps the resize and restores user-select (no regression)', () => {
      vi.useFakeTimers()
      try {
        mountTwoPanes()
        const splitter = splitterEl()
        splitter.hasPointerCapture = () => true
        const before = JSON.parse(
          localStorage.getItem(TANSTACK_DEVTOOLS_STATE)!,
        ).layout.sizes

        pointer(splitter, 'pointerdown', 830, 400)
        expect(document.body.style.userSelect).toBe('none')
        pointer(document, 'pointermove', 1030, 400)
        pointer(document, 'pointerup', 1030, 400)

        expect(document.body.style.userSelect).toBe('')
        expect(Element.prototype.releasePointerCapture).toHaveBeenCalledWith(1)
        const after = JSON.parse(
          localStorage.getItem(TANSTACK_DEVTOOLS_STATE)!,
        ).layout.sizes
        expect(after).not.toEqual(before)

        // The leaked `pointermove` used to keep resizing panes after release.
        pointer(document, 'pointermove', 1500, 400)
        expect(JSON.parse(localStorage.getItem(TANSTACK_DEVTOOLS_STATE)!).layout.sizes).toEqual(after)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
