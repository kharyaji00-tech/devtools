import { expect, test } from '@playwright/test'
import { DevtoolsPage, SELECTORS } from '@tanstack/devtools-e2e'

/**
 * Keyboard-operability of the resize separators in a real browser.
 *
 * The component tests in `packages/devtools/tests/workbench.test.tsx` dispatch
 * KeyboardEvent/MouseEvent directly on the separator, which reaches the handler
 * without the element ever being focused. These specs cover the real-browser flow
 * the bug report reproduced: the separator must be focusable (the disable-tabbing
 * hook must not strip its authored `tabindex=0`) and a mouse grab must leave it
 * focused (preventDefault must not suppress focus without a compensating
 * .focus()), so arrow/Home/End keys then resize the panel.
 */
const PANEL_CLOSE_THRESHOLD = 70
const PANEL_MAX_VIEWPORT_RATIO = 0.9

const handle = (page: import('@playwright/test').Page) =>
  page.getByTestId(SELECTORS.resizeHandle)

const valueNow = async (page: import('@playwright/test').Page) => {
  const v = await handle(page).getAttribute('aria-valuenow')
  return v === null ? null : Number(v)
}

test('the resize handle is focusable and resizes from the keyboard', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await dt.goto()
  await dt.openViaTrigger()

  // The handle keeps its authored `tabindex=0` while the panel is open, so
  // `.focus()` actually moves focus onto it (the bug left activeElement at BODY).
  await expect(handle(page)).toHaveAttribute('tabindex', '0')
  await handle(page).focus()
  await expect(handle(page)).toBeFocused()

  const before = await valueNow(page)
  expect(before).not.toBeNull()

  // ArrowUp grows a bottom-anchored panel by 10.
  await handle(page).press('ArrowUp')
  await expect.poll(async () => valueNow(page)).toBe(before! + 10)

  // Home collapses to the minimum height.
  await handle(page).press('Home')
  await expect.poll(async () => valueNow(page)).toBe(PANEL_CLOSE_THRESHOLD)

  // End grows to the maximum (floor(innerHeight * 0.9)).
  const maxHeight = await page.evaluate(
    (ratio) => Math.floor(window.innerHeight * ratio),
    PANEL_MAX_VIEWPORT_RATIO,
  )
  await handle(page).press('End')
  await expect.poll(async () => valueNow(page)).toBe(maxHeight)
})

test('grabbing the handle with the mouse leaves it focused for keyboard resize', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await dt.goto()
  await dt.openViaTrigger()

  // Drive the real `handleDragStart` with a dispatched mousedown, the same
  // pattern `resize.spec.ts` uses (Playwright's `mouse.down` clamps to the
  // viewport and the handle sits at the panel edge). The fix focuses the
  // separator despite `preventDefault()`, so the keyboard can take over.
  await page.evaluate(
    (handleSel) => {
      const el = document.querySelector(handleSel) as HTMLElement
      const box = el.getBoundingClientRect()
      el.dispatchEvent(
        new MouseEvent('mousedown', {
          button: 0,
          bubbles: true,
          cancelable: true,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        }),
      )
    },
    `[data-testid="${SELECTORS.resizeHandle}"]`,
  )
  await expect(handle(page)).toBeFocused()
  const before = await valueNow(page)
  // The keyboard can take over immediately, without re-grabbing.
  await handle(page).press('ArrowUp')
  await expect.poll(async () => valueNow(page)).toBe(before! + 10)
  // Release the drag to clean up the document-level mousemove/stop listeners.
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
})

test('Tab reaches the resize handle', async ({ page }) => {
  const dt = new DevtoolsPage(page)
  await dt.goto()
  await dt.openViaTrigger()

  // Walk the real browser tab order with Playwright's keyboard. The handle must
  // appear in it (tabindex=0); before the fix the stripped tabindex meant Tab
  // cycled through the other controls and returned to body without ever
  // reaching the separator. Bound the walk so a failure fails fast.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    if (await handle(page).evaluate((el) => el === document.activeElement)) {
      return
    }
  }
  throw new Error('Tab never reached the resize handle')
})

test('the handle stays focusable across a close and reopen', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await dt.goto()
  await dt.openViaTrigger()

  await dt.closeViaButton()
  // Assert the attribute directly rather than `expectClosed()`: a closed panel
  // is translated off-screen/hidden, so the visibility wait is unreliable, but
  // `data-open` flips immediately.
  await expect(dt.panel()).toHaveAttribute('data-open', 'false')
  // While closed the whole panel subtree is removed from the tab order.
  await expect(handle(page)).toHaveAttribute('tabindex', '-1')

  // Reopen via the trigger and the authored `tabindex=0` is restored exactly,
  // even though the close pass overwrote it with "-1" and Solid does not reapply
  // the static `tabIndex={0}` on reopen.
  await dt.openViaTrigger()
  await expect(handle(page)).toHaveAttribute('tabindex', '0')
  await handle(page).focus()
  await expect(handle(page)).toBeFocused()
  const before = await valueNow(page)
  await handle(page).press('ArrowUp')
  await expect.poll(async () => valueNow(page)).toBe(before! + 10)
})

