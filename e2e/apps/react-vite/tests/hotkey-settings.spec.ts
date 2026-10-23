import { expect, test } from '@playwright/test'
import { DevtoolsPage } from '@tanstack/devtools-e2e'
import type { Page } from '@playwright/test'

// The shell's default open hotkey is now ["CtrlOrMeta", "~"], which expands to
// both Control+~ and Meta+~ at match time. The previous default ["Control","~"]
// matched only Control+~. Dispatching the exact keydown events the shell
// listens for (mirroring hotkey.spec.ts) lets us distinguish the two.
async function dispatchKeys(page: Page, key: string) {
  await page.evaluate((k) => {
    const mod = k === 'Control'
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, ctrlKey: mod, metaKey: !mod }),
    )
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '~',
        ctrlKey: mod,
        metaKey: !mod,
      }),
    )
    window.dispatchEvent(new KeyboardEvent('keyup', { key: '~' }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k }))
  }, key)
}

test.describe('open hotkey default + Settings editing', () => {
  test('default hotkey now matches Meta+~ (CtrlOrMeta), not only Control+~', async ({
    page,
  }) => {
    const dt = new DevtoolsPage(page)
    await dt.goto()
    await expect(dt.panel()).toHaveAttribute('data-open', 'false')
    // The old ["Control","~"] default rejected Meta+~; the new CtrlOrMeta
    // default accepts it.
    await dispatchKeys(page, 'Meta')
    await expect(dt.panel()).toHaveAttribute('data-open', 'true')
  })

  test('editing the open hotkey in Settings keeps CtrlOrMeta and does not bind a bare letter', async ({
    page,
  }) => {
    const dt = new DevtoolsPage(page)
    await dt.goto()
    // Open the panel and go to Settings.
    await dt.trigger().click()
    await dt.expectOpen()
    await page.getByTestId('tsd-tab-settings').click()
    await expect(page.getByTestId('settings-workspace')).toBeVisible()

    // The "Open/Close Devtools" HotkeyConfig: ensure Ctrl Or Meta is pressed,
    // then change the Key to "d". Scope via the heading's parent group so the
    // sibling "Source Inspector" HotkeyConfig does not match.
    const hotkeyGroup = page
      .getByRole('heading', { name: 'Open/Close Devtools', exact: true })
      .locator('xpath=parent::div')
    await expect(
      hotkeyGroup.getByRole('button', { name: 'Ctrl Or Meta' }),
    ).toHaveAttribute('aria-pressed', 'true')
    // The default modifier is shown as the pressed toggle, NOT as text in the
    // Key input (the pre-fix bug rendered "CtrlOrMeta+~" / "Control+~" there).
    await expect(hotkeyGroup.getByLabel('Key')).toHaveValue('~')
    await hotkeyGroup.getByLabel('Key').fill('d')

    // The persisted hotkey must keep the modifier, not drop to a bare ["D"].
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tanstack_devtools_settings') || '{}'),
    )
    expect(stored.openHotkey).toEqual(['CtrlOrMeta', 'D'])

    // Close the panel so its persisted "open" state does not reopen it after
    // reload, then reload. Panel starts closed.
    await dt.closeViaButton()
    await expect(dt.panel()).toHaveAttribute('data-open', 'false')
    await page.reload()
    await expect(dt.panel()).toHaveAttribute('data-open', 'false')
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }))
    })
    await expect(dt.panel()).toHaveAttribute('data-open', 'false')

    // But Control+d (the edited combo) does open it.
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }),
      )
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'D', ctrlKey: true }),
      )
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'D' }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }))
    })
    await expect(dt.panel()).toHaveAttribute('data-open', 'true')
  })
})
