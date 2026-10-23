import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevTools from '../src/devtools'
import { DevtoolsProvider } from '../src/context/devtools-context'
import { PiPProvider } from '../src/context/pip-context'
import type {
  TanStackDevtoolsConfig,
  TanStackDevtoolsPlugin,
} from '../src/context/devtools-context'

const disposers: Array<() => void> = []

const plugin = (id: string): TanStackDevtoolsPlugin => ({
  id,
  name: (heading) => {
    heading.textContent = `Plugin ${id}`
  },
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

/** All strip entries, in render order. */
const stripEntries = () => [
  ...document.querySelectorAll<HTMLElement>(
    '[data-testid="plugins-strip"] [data-plugin-title-control]',
  ),
]

/** The strip entry for a given plugin id, or null once it has left the strip. */
const stripEntry = (id: string) =>
  document.querySelector<HTMLElement>(
    `[data-testid="plugins-strip"] [data-plugin-title-control][aria-labelledby="plugin-title-container-${id}"]`,
  )

/** A plugin is open once its pane's own close control exists. */
const isOpen = (id: string) =>
  document.querySelector(`[data-testid="plugin-tab-close-${id}"]`) !== null

beforeEach(() => {
  localStorage.clear()
  history.replaceState({}, '', '/')
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  try {
    while (disposers.length) disposers.pop()!()
    document.body.replaceChildren()
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  }
})

describe(
  'plugins strip — suppressClick keyboard leak',
  { timeout: 30_000 },
  () => {
    it('opens a strip entry on a pointer-less (keyboard) click from a fresh mount', () => {
      // Two plugins, so neither auto-opens and both stay in the strip.
      mountWorkbench([plugin('one'), plugin('two')])
      expect(stripEntries()).toHaveLength(2)
      expect(isOpen('two')).toBe(false)

      // Keyboard / AT activation of a native <button> fires `click` with no
      // pointer events: no preceding `pointerdown` ever resets the flag.
      stripEntry('two')!.click()

      expect(isOpen('two')).toBe(true)
      expect(stripEntry('two')).toBeNull()
      // The other entry is unaffected and still in the strip.
      expect(stripEntry('one')).not.toBeNull()
    })

    it('opens a different entry by keyboard after a press-and-hold armed the flag', () => {
      vi.useFakeTimers()
      mountWorkbench([plugin('one'), plugin('two')])
      const entryA = stripEntry('one')!

      // Press entry A and hold past the 500ms drag-hold so the hold fires and
      // arms `suppressClick`. The release point is outside the (zero-size)
      // workspace box, so the handed-off drag misses and A's entry stays in the
      // strip with no `click` on the entry.
      entryA.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          bubbles: true,
          clientX: 10,
          clientY: 10,
        }),
      )
      vi.advanceTimersByTime(500)
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))

      // A drag that missed should leave A closed and still in the strip.
      expect(isOpen('one')).toBe(false)
      expect(stripEntry('one')).not.toBeNull()

      // Keyboard / AT activation of a DIFFERENT entry: a `click` with no pointer
      // events. Before the fix the guard swallowed this and B stayed closed.
      stripEntry('two')!.click()

      expect(isOpen('two')).toBe(true)
      expect(stripEntry('two')).toBeNull()
    })

    it('still opens an entry by pointer (pointerdown + click) after a press-and-hold', () => {
      vi.useFakeTimers()
      mountWorkbench([plugin('one'), plugin('two')])
      const entryA = stripEntry('one')!

      entryA.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          bubbles: true,
          clientX: 10,
          clientY: 10,
        }),
      )
      vi.advanceTimersByTime(500)
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))

      // A real pointer activation of B: pointerdown resets the flag, the release
      // is quick (the new hold never fires), then the browser's trailing click
      // opens it. Regression guard for the still-working pointer path.
      const entryB = stripEntry('two')!
      entryB.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          bubbles: true,
          clientX: 30,
          clientY: 10,
        }),
      )
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
      entryB.click()

      expect(isOpen('two')).toBe(true)
      expect(stripEntry('two')).toBeNull()
    })

    it('opens the pressed entry after a press-and-hold that never moved', () => {
      vi.useFakeTimers()
      mountWorkbench([plugin('one'), plugin('two')])
      const entryA = stripEntry('one')!

      // Press and hold past the 500ms hold without moving the pointer, then
      // release over the same entry. The hold fires (handing off a drag that
      // immediately misses), but the flag is cleared on pointerup — before the
      // trailing browser `click` — so that click is not swallowed and the
      // pressed plugin opens. A press that never moved is not a real drag.
      entryA.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          bubbles: true,
          clientX: 10,
          clientY: 10,
        }),
      )
      vi.advanceTimersByTime(500)
      entryA.dispatchEvent(
        new PointerEvent('pointerup', {
          button: 0,
          bubbles: true,
          clientX: 10,
          clientY: 10,
        }),
      )
      entryA.click()

      expect(isOpen('one')).toBe(true)
    })
  },
)
