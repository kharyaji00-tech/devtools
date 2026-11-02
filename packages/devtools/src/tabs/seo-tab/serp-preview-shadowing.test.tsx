import { render } from '@solidjs/testing-library'
import { ThemeContextProvider } from '@tanstack/devtools-ui'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DevtoolsProvider } from '../../context/devtools-context'
import { SerpPreviewSection } from './serp-preview'

const TITLE_FALLBACK = 'No title'
const NO_TITLE_ISSUE = 'No title tag set on the page.'

// jsdom delivers MutationObserver callbacks on the microtask queue; a macrotask
// tick also drains Solid's effect flush so the head watcher's onMount and the
// re-scan triggered by a head change have both run.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const injectedNodes: Array<Node> = []

const removeAllTitles = () => {
  for (const t of document.head.querySelectorAll('title')) t.remove()
}

const renderSection = () =>
  render(() => (
    <DevtoolsProvider>
      <ThemeContextProvider theme="dark">
        <SerpPreviewSection />
      </ThemeContextProvider>
    </DevtoolsProvider>
  ))

describe('SerpPreviewSection - <title> shadowing regression', () => {
  beforeEach(() => {
    localStorage.clear()
    // The bug only reproduces when the host <head> has NO <title> at mount:
    // that is when the head watcher creates a (synthetic) empty <title> which,
    // being first in tree order, shadows a real <title> added later.
    removeAllTitles()
    for (const n of injectedNodes) n.parentNode?.removeChild(n)
    injectedNodes.length = 0
  })

  afterEach(() => {
    for (const n of injectedNodes) n.parentNode?.removeChild(n)
    injectedNodes.length = 0
    removeAllTitles()
  })

  it('shows the app title (not the "No title" fallback or issue) when a real <title> is added after mount', async () => {
    const { unmount } = renderSection()

    await flush()

    // The head watcher created an empty synthetic <title> (first in tree
    // order) so it can observe title edits, and document.title is shadowed.
    expect(document.head.querySelectorAll('title').length).toBe(1)
    expect(document.head.querySelector('title')!.textContent).toBe('')
    expect(document.title).toBe('')

    // Initially — no real title anywhere — the SERP correctly reports a
    // missing title. (This proves the consumer still detects a genuinely
    // empty <head>.)
    expect(document.body.textContent).toContain(NO_TITLE_ISSUE)

    // The host app now appends its real <title> (e.g. a route-change head
    // manager) after the devtools mounted.
    const real = document.createElement('title')
    real.textContent = 'My App'
    document.head.appendChild(real)
    injectedNodes.push(real)
    await flush()

    // document.title is still "" because the synthetic <title> is first in
    // tree order — the exact shadowing this bug causes. The SERP would report
    // "No title" if it read document.title alone.
    expect(document.title).toBe('')

    // ...but the SERP resolves the first NON-EMPTY <title> instead, so it
    // renders the app's real title in both the desktop and mobile previews.
    const titleEls = document.querySelectorAll(
      '[data-testid="serp-preview-title"]',
    )
    expect(titleEls.length).toBeGreaterThanOrEqual(2)
    for (const el of titleEls) {
      expect(el.textContent).toContain('My App')
    }
    // Neither the "No title" fallback ...
    expect(document.body.textContent).not.toContain(TITLE_FALLBACK)
    // ... nor the false "No title tag set on the page." issue is reported for a
    // page that does in fact have a title.
    expect(document.body.textContent).not.toContain(NO_TITLE_ISSUE)

    unmount()
    await flush()

    // On unmount the empty synthetic <title> is removed; the app's real title
    // is left intact (and becomes the first, so document.title recovers).
    const titles = Array.from(document.head.querySelectorAll('title'))
    expect(titles).toHaveLength(1)
    expect(titles[0]).toBe(real)
    expect(document.title).toBe('My App')
  })

  it('still shows a real title present from before mount (no regression for the non-shadowing case)', async () => {
    const real = document.createElement('title')
    real.textContent = 'Static App'
    document.head.appendChild(real)
    injectedNodes.push(real)

    const { unmount } = renderSection()

    await flush()

    const titleEls = document.querySelectorAll(
      '[data-testid="serp-preview-title"]',
    )
    expect(titleEls.length).toBeGreaterThanOrEqual(2)
    for (const el of titleEls) {
      expect(el.textContent).toContain('Static App')
    }
    expect(document.body.textContent).not.toContain(NO_TITLE_ISSUE)

    unmount()
    await flush()
  })
})
