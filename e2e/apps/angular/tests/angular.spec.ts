import { test, expect } from '@playwright/test'
import { DevtoolsPage } from '@tanstack/devtools-e2e'

// NOTE: `@tanstack/angular-devtools` build currently fails on Windows (its build
// script uses `rm -rf`), so this app is verified in CI (Linux), not necessarily
// locally on Windows.
test('angular devtools renders the demo plugin panel', async ({ page }) => {
  const dt = new DevtoolsPage(page)
  await dt.goto('/')
  await dt.openViaTrigger()
  // The @defer block + dynamic import render the standalone panel component
  // asynchronously, so allow a generous timeout for it to appear.
  await expect(page.getByTestId('demo-plugin')).toBeVisible({ timeout: 30_000 })
})

// The devtools core re-invokes each mounted plugin's `render` callback whenever
// the devtools open-state changes, reusing the same mount node (panes are
// hidden, never unmounted). The Angular adapter must reuse — not replace by
// re-mounting — the panel on each re-invocation, otherwise every cycle leaks a
// new component instance (and its change-detector/listeners) into the host
// `ApplicationRef`. The demo panel counts its own constructions in
// `window.__demoPanelMounts`; it must stay at one across cycles.
test('angular devtools does not duplicate the plugin panel on open/close cycles', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await dt.goto('/')
  await dt.openViaTrigger()
  const panel = page.getByTestId('demo-plugin')
  await expect(panel).toBeVisible({ timeout: 30_000 })

  const mounts = () =>
    page.evaluate(() => (globalThis as any).__demoPanelMounts ?? 0)
  const baseline = await mounts()

  for (let i = 0; i < 3; i++) {
    await dt.closeViaButton()
    await expect(dt.panel()).toHaveAttribute('data-open', 'false')
    await dt.openViaTrigger()
  }

  // One visible panel, and no leaked instances (the count must not grow).
  await expect(panel).toHaveCount(1)
  expect(await mounts()).toBe(baseline)
})

// The core also re-invokes `render` when the theme changes. Toggling the
// Theme select (Settings → Theme) back and forth must keep a single panel and
// a single live component instance.
test('angular devtools does not duplicate the plugin panel on theme toggle', async ({
  page,
}) => {
  const dt = new DevtoolsPage(page)
  await dt.goto('/')
  await dt.openViaTrigger()
  const panel = page.getByTestId('demo-plugin')
  await expect(panel).toBeVisible({ timeout: 30_000 })

  const mounts = () =>
    page.evaluate(() => (globalThis as any).__demoPanelMounts ?? 0)
  const baseline = await mounts()

  await dt.tab('settings').click()
  const themeSelect = page.getByLabel('Theme')
  await themeSelect.selectOption('light')
  await themeSelect.selectOption('dark')
  await themeSelect.selectOption('light')
  await themeSelect.selectOption('dark')

  await dt.tab('plugins').click()

  await expect(panel).toHaveCount(1)
  expect(await mounts()).toBe(baseline)
})
