import { expect, test } from '@playwright/test'
import { DevtoolsPage, SELECTORS } from '@tanstack/devtools-e2e'

/**
 * Keyboard/focus operability of the plugin-pane gutters in a real browser.
 *
 * The existing `plugin-workspace.spec.ts` "a gutter resizes from the keyboard"
 * uses `locator.press(...)`, which focuses and presses as one step, so it never
 * exercised the close/reopen tabindex stripping path the bug report identifies
 * (evidence #6). These specs cover focusability across an open/close cycle and
 * the mouse-grab → keyboard handoff for the gutters.
 */
const DEMO = 'demo'
const PROBE = 'event-probe'

const openTwoPanes = async (dt: DevtoolsPage) => {
  await dt.goto()
  await dt.openViaTrigger()
  await dt.stripEntry('Event Probe').click()
  await expect(dt.groupTabBars()).toHaveCount(2)
  await expect(dt.splitters()).toHaveCount(1)
  await expect(dt.pane(DEMO)).toBeVisible()
  await expect(dt.pane(PROBE)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('tsd-e2e-started') === null) {
      localStorage.clear()
      sessionStorage.setItem('tsd-e2e-started', '1')
    }
  })
})

test('grabbing a gutter with the mouse leaves it focused for keyboard resize', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await openTwoPanes(dt)

  const before = (await dt.pane(DEMO).boundingBox())!.width
  // Drive the real `startSplitterDrag` with a dispatched pointerdown, which
  // calls `target.focus()` despite `preventDefault()`.
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement
    const box = el.getBoundingClientRect()
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        button: 0,
        bubbles: true,
        cancelable: true,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
        pointerId: 1,
      }),
    )
  }, `[data-testid="${SELECTORS.splitter}"]`)
  await expect(dt.splitters().first()).toBeFocused()

  // The keyboard resizes from there without re-grabbing.
  await dt.splitters().first().press('ArrowRight')
  await expect
    .poll(async () => (await dt.pane(DEMO).boundingBox())!.width)
    .toBeGreaterThan(before)

  // Release the drag to clean up document-level listeners.
  await page.evaluate(() => {
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
})

test('a plugin-pane gutter keeps focusability across a close and reopen', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await openTwoPanes(dt)
  await expect(dt.splitters().first()).toHaveAttribute('tabindex', '0')

  await dt.closeViaButton()
  await expect(dt.panel()).toHaveAttribute('data-open', 'false')
  // While closed the gutter is removed from the tab order (the close pass set
  // tabindex=-1, overwriting the authored 0).
  await expect(dt.splitters().first()).toHaveAttribute('tabindex', '-1')

  // Reopen: the authored tabindex=0 is restored exactly, so the gutter is
  // focusable and the keyboard still resizes — this is the close/reopen path
  // the bug report says stripped the gutters.
  await dt.openViaTrigger()
  await expect(dt.splitters().first()).toHaveAttribute('tabindex', '0')
  // Wait for the workspace to re-measure/reveal before focusing: the workspace
  // toggles `display` on visibility, so focusing a still-hidden gutter is a no-op.
  await expect(dt.pane(DEMO)).toBeVisible()
  await expect(dt.splitters().first()).toBeVisible()
  await dt.splitters().first().focus()
  await expect(dt.splitters().first()).toBeFocused()
  const before = (await dt.pane(DEMO).boundingBox())!.width
  await dt.splitters().first().press('ArrowRight')
  await expect
    .poll(async () => (await dt.pane(DEMO).boundingBox())!.width)
    .toBeGreaterThan(before)
})
