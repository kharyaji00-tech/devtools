import { render } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHeadChanges } from './use-head-changes'

// The hook drives Solid's onMount/onCleanup, so it must run inside an owner.
// `render` mounts a component whose owner onCleanup runs when `unmount()` is
// called, and `null` keeps DOM output out of the way.
type Change =
  | { kind: 'added'; node: Node }
  | { kind: 'removed'; node: Node }
  | { kind: 'title'; title: string }
  | {
      kind: 'attr'
      target: Element
      name: string | null
      oldValue: string | null
    }

const mountHeadChanges = (
  onChange: (change: Change) => void,
  opts?: Parameters<typeof createHeadChanges>[1],
) =>
  render(() => {
    createHeadChanges(onChange as never, opts)
    return null
  })

// jsdom delivers MutationObserver callbacks on the microtask queue; a macrotask
// tick also drains Solid's effect flush so onMount has run.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const injectedNodes: Array<Node> = []

const removeAllTitles = () => {
  for (const t of document.head.querySelectorAll('title')) t.remove()
}

describe('createHeadChanges', () => {
  beforeEach(() => {
    removeAllTitles()
  })

  afterEach(() => {
    for (const node of injectedNodes) node.parentNode?.removeChild(node)
    injectedNodes.length = 0
    removeAllTitles()
  })

  it('does not emit a spurious added(<title>) on mount when <head> has no title', async () => {
    const events: Array<Change> = []
    const { unmount } = mountHeadChanges((c) => events.push(c))

    await flush()

    // The hook used to append its synthetic <title> AFTER calling observe(),
    // so it reported its own creation as { kind: 'added', node }. Nothing
    // mutated the head besides the hook itself, so consumers must see no
    // head-change events on mount.
    expect(events).toEqual([])
    // The synthetic <title> the hook needs for observation does exist ...
    expect(document.head.querySelectorAll('title').length).toBe(1)
    expect(document.head.querySelector('title')!.textContent).toBe('')

    unmount()
    await flush()

    // ... and, since the app never adopted it, it is removed again on cleanup
    // so the devtools leaves no placeholder in the host <head>.
    expect(document.head.querySelectorAll('title').length).toBe(0)
  })

  it('creates no synthetic <title> when observeTitle is disabled', async () => {
    const events: Array<Change> = []
    const { unmount } = mountHeadChanges((c) => events.push(c), {
      observeTitle: false,
    })

    await flush()

    // No synthetic <title> is created when title observation is off.
    expect(document.head.querySelectorAll('title').length).toBe(0)

    // A real <title> the app adds later is still a normal head change.
    const real = document.createElement('title')
    real.textContent = 'Late'
    document.head.appendChild(real)
    injectedNodes.push(real)
    await flush()

    expect(events.some((e) => e.kind === 'added' && e.node === real)).toBe(true)

    unmount()
  })

  it('keeps a real <title> the app adds after mount and removes only the empty synthetic on cleanup', async () => {
    const events: Array<Change> = []
    const { unmount } = mountHeadChanges((c) => events.push(c))

    await flush()

    // The hook created an (empty) synthetic <title> first.
    expect(document.head.querySelectorAll('title').length).toBe(1)

    // The host app appends its own real <title> later (the shadowing
    // scenario). That is a genuine head change and must reach consumers — the
    // synthetic filter must not suppress real titles.
    const real = document.createElement('title')
    real.textContent = 'My App'
    document.head.appendChild(real)
    injectedNodes.push(real)
    await flush()

    expect(events.some((e) => e.kind === 'added' && e.node === real)).toBe(true)

    unmount()
    await flush()

    // The empty synthetic is removed on cleanup, but the app's real title is
    // left alone.
    const titles = Array.from(document.head.querySelectorAll('title'))
    expect(titles).toHaveLength(1)
    expect(titles[0]).toBe(real)
  })

  it('keeps the synthetic <title> on cleanup when the app adopted it by setting its text', async () => {
    const { unmount } = mountHeadChanges(() => {})

    await flush()

    const synthetic = document.head.querySelector('title')!
    // `document.title = ...` writes into the first <title> in tree order —
    // the devtools' synthetic one — so the app has now "adopted" it.
    document.title = 'Adopted'
    await flush()

    expect(synthetic.textContent).toBe('Adopted')

    unmount()
    await flush()

    // An adopted synthetic (now the app's real title) is not torn down —
    // cleanup must not delete content the app wrote.
    expect(document.head.querySelectorAll('title').length).toBe(1)
    expect(document.head.querySelector('title')).toBe(synthetic)
  })
})
