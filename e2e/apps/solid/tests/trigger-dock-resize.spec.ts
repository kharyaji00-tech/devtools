import { test, expect } from '@playwright/test'

test('the docked edge trigger stays on screen after the window shrinks', async ({
  page,
}) => {
  await page.goto('/')

  // Wait for the floating trigger to mount (it seeds from its bottom-right
  // fixed position on first load, so it starts at the bottom-right corner).
  const trigger = page.getByRole('button', {
    name: 'Open TanStack Devtools',
    exact: true,
  })
  await expect(trigger).toBeVisible()
  const triggerBox = await trigger.boundingBox()
  expect(triggerBox).not.toBeNull()

  // Drag the trigger past the right edge near the bottom of the viewport so
  // it docks against the right edge as a slim tab. We sweep the pointer in
  // steps so each pointer move registers as a drag (and accumulates the
  // velocity needed to cross the edge), then release.
  const viewport = await page.viewportSize()
  expect(viewport).not.toBeNull()
  const targetX = viewport!.width + 200
  const targetY = viewport!.height - 20
  await page.mouse.move(
    triggerBox!.x + triggerBox!.width / 2,
    triggerBox!.y + triggerBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await page.mouse.up()

  // The docked tab is the only visible trigger while docked.
  const dockedTab = page.getByRole('button', {
    name: 'Open TanStack Devtools (docked)',
  })
  await expect(dockedTab).toBeVisible()
  const floatingTrigger = page.getByRole('button', {
    name: 'Open TanStack Devtools',
    exact: true,
  })
  await expect(floatingTrigger).toHaveCount(0)

  // Now shrink the window drastically along the docked axis. Without the
  // fix, the docked tab keeps its stale along-edge pixel offset from the
  // larger viewport and ends up entirely below the new viewport.
  await page.setViewportSize({ width: viewport!.width, height: 400 })
  // Give the resize listener and the reactive re-run a moment to flush.
  await page.waitForTimeout(100)

  const tabBox = await dockedTab.boundingBox()
  expect(tabBox).not.toBeNull()
  // The tab is fully inside the new (shrunk) viewport.
  expect(tabBox!.y).toBeGreaterThanOrEqual(0)
  expect(tabBox!.y + tabBox!.height).toBeLessThanOrEqual(400)
  // And it is still anchored to the right edge of the viewport.
  expect(tabBox!.x + tabBox!.width).toBeLessThanOrEqual(viewport!.width + 1)
  expect(tabBox!.x + tabBox!.width).toBeGreaterThanOrEqual(viewport!.width - 1)

  // The tab is still interactive: clicking it opens the panel.
  await dockedTab.click()
  await expect(
    page
      .getByTestId('tanstack-devtools-panel')
      .and(page.locator('[data-open="true"]')),
  ).toBeVisible()
})
