import { expect, test } from '@playwright/test'
import { DevtoolsPage, SELECTORS } from '@tanstack/devtools-e2e'

const DEMO = 'demo'
const PROBE = 'event-probe'

/**
 * Devtools PiP mode detaches the whole Solid tree into a popup window opened by
 * `window.open('', 'TSDT-Devtools-Panel', ...)`. Solid delegates events through
 * a single document-level listener installed by `delegateEvents()` on the
 * document the event targets; the main document gets the full set by default,
 * but the popup document only gets what `pip-context.tsx` registers.
 *
 * These tests drive a *real* popup window (not a stubbed `window.open`) so they
 * exercise delegated-event dispatch on the popup's own document — the exact
 * path that left `onDblClick` dead before the fix.
 */

const unequalRowSplit = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    localStorage.setItem(
      'tanstack_devtools_state',
      JSON.stringify({
        layout: {
          kind: 'split',
          dir: 'row',
          sizes: [0.7, 0.3],
          children: [
            { kind: 'group', id: 'g0', tabs: ['demo'], active: 0 },
            { kind: 'group', id: 'g1', tabs: ['event-probe'], active: 0 },
          ],
        },
      }),
    )
  })

// `addInitScript` runs on every navigation, so only seed a clean slate once.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('tsd-e2e-started') === null) {
      localStorage.clear()
      sessionStorage.setItem('tsd-e2e-started', '1')
    }
  })
})

const enterPip = (page: import('@playwright/test').Page) =>
  Promise.all([
    page.waitForEvent('popup', { timeout: 15_000 }),
    page.getByTestId(SELECTORS.pipButton).click(),
  ]).then(([popup]) => popup)

test('double-click resets a splitter inside the detached PiP window', async ({
  page,
}) => {
  // Seed an unequal split so a reset has a visible "from" state.
  await page.goto('/')
  await unequalRowSplit(page)
  await page.reload()

  const dt = new DevtoolsPage(page)
  await dt.openViaTrigger()
  await expect(dt.splitters()).toHaveCount(1)
  await expect(dt.pane(DEMO)).toBeVisible()

  // Confirm the seeded unequal geometry before detaching.
  const mainDemo = (await dt.pane(DEMO).boundingBox())!.width
  const mainProbe = (await dt.pane(PROBE).boundingBox())!.width
  expect(mainDemo - mainProbe).toBeGreaterThan(80)

  const popup = await enterPip(page)
  const pdt = new DevtoolsPage(popup)
  await expect
    .poll(async () => await pdt.splitters().count(), {
      timeout: 15_000,
    })
    .toBe(1)

  // The unequal sizes travel with the portaled tree.
  const popupDemoBefore = (await pdt.pane(DEMO).boundingBox())!.width
  const popupProbeBefore = (await pdt.pane(PROBE).boundingBox())!.width
  expect(popupDemoBefore - popupProbeBefore).toBeGreaterThan(80)

  // Double-click the splitter *inside the popup*. Before the fix, `dblclick`
  // was not delegated on the popup document, so this was a silent no-op.
  // A locator-based dblclick auto-scrolls the gutter into the popup's viewport;
  // raw mouse coordinates can fall outside the (smaller) popup viewport.
  await pdt.splitters().first().dblclick()

  // The panes reset to (roughly) equal shares.
  await expect
    .poll(async () => {
      const d = (await pdt.pane(DEMO).boundingBox())!.width
      const p = (await pdt.pane(PROBE).boundingBox())!.width
      return Math.abs(d - p)
    })
    .toBeLessThan(6)

  // And the persisted layout now records equal sizes.
  const layout = (await pdt.storedLayout()) as { sizes?: number[] }
  expect(layout.sizes).toBeDefined()
  for (const size of layout.sizes!) {
    expect(size).toBeCloseTo(1 / layout.sizes!.length, 1)
  }
})

test('the detached window delegates the previously-missing events', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await dt.goto()
  await dt.openViaTrigger()
  await dt.stripEntry('Event Probe').click()
  await expect(dt.splitters()).toHaveCount(1)

  const popup = await enterPip(page)
  await expect
    .poll(async () => await popup.getByTestId(SELECTORS.splitter).count(), {
      timeout: 15_000,
    })
    .toBe(1)

  const delegated = await popup.evaluate(() => {
    const set = (document as unknown as Record<string, unknown>)[
      '_$DX_DELEGATE'
    ] as Set<string> | undefined
    return set ? [...set] : []
  })
  // The events that were missing from the pre-fix nine-event list must now be
  // delegated on the popup document (the report called out `dblclick`; the
  // others are the same latent trap).
  for (const name of [
    'dblclick',
    'beforeinput',
    'contextmenu',
    'keyup',
    'mousemove',
    'mouseup',
    'touchstart',
  ]) {
    expect(delegated).toContain(name)
  }
})
