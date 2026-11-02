import { expect, test } from '@playwright/test'
import { DevtoolsPage } from '@tanstack/devtools-e2e'

/**
 * Real-browser verification that a `pointercancel` ends each workspace drag
 * cleanly. jsdom cannot reproduce real pointer capture, real rect hit-testing,
 * or the OS-level cancellations (touch scroll takeover, palm rejection, native
 * drag start) that fire `pointercancel` instead of `pointerup`. These cover what
 * the unit tests in `packages/devtools/tests/plugin-workspace-pointercancel.test.tsx`
 * cannot: the live document listener, the real host-page `user-select`, and that
 * a subsequent real `pointerup` commits no ghost drop.
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

test('a cancelled tab drag ends cleanly with no ghost drop on a later pointerup', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await openTwoPanes(dt)

  const tab = (await dt.pluginTab(PROBE).boundingBox())!
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2)
  await page.mouse.down()
  // The hold fires after ~500ms; the drag preview is the signal it began.
  const preview = page.getByTestId('plugin-drag-preview')
  await expect(preview).toBeVisible({ timeout: 5000 })
  await expect(dt.workspace()).toHaveAttribute('data-tsd-dragging', 'true')
  await expect(dt.groupTabBars()).toHaveCount(2)
  await expect(dt.splitters()).toHaveCount(1)

  await page.evaluate(() => {
    document.dispatchEvent(
      new PointerEvent('pointercancel', {
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    )
  })

  await expect(preview).toHaveCount(0)
  await expect(dt.workspace()).not.toHaveAttribute('data-tsd-dragging', 'true')
  await expect(dt.groupTabBars()).toHaveCount(2)
  await expect(dt.splitters()).toHaveCount(1)

  // The leaked `pointerup` handler used to fire here and commit a ghost drop.
  await page.mouse.up()
  await expect(dt.groupTabBars()).toHaveCount(2)
  await expect(dt.splitters()).toHaveCount(1)
})

test('a cancelled splitter drag restores host-page user-select and stops resizing', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await openTwoPanes(dt)

  const gutter = (await dt.splitters().first().boundingBox())!
  await page.mouse.move(
    gutter.x + gutter.width / 2,
    gutter.y + gutter.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(gutter.x + 80, gutter.y + gutter.height / 2, {
    steps: 5,
  })

  expect(await page.evaluate(() => document.body.style.userSelect)).toBe('none')
  const widthBefore = (await dt.pane(DEMO).boundingBox())!.width

  await page.evaluate(() => {
    document.dispatchEvent(
      new PointerEvent('pointercancel', {
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    )
  })

  expect(await page.evaluate(() => document.body.style.userSelect)).not.toBe(
    'none',
  )

  // The leaked `pointermove` used to keep resizing panes on every mouse move.
  await page.mouse.move(gutter.x + 240, gutter.y + gutter.height / 2, {
    steps: 5,
  })
  const widthAfter = (await dt.pane(DEMO).boundingBox())!.width
  expect(widthAfter).toBeCloseTo(widthBefore, 0)

  // A later real pointerup is a no-op.
  await page.mouse.up()
  const widthAfterUp = (await dt.pane(DEMO).boundingBox())!.width
  expect(widthAfterUp).toBeCloseTo(widthBefore, 0)
})
