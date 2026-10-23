import { fireEvent, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeContextProvider } from '@tanstack/devtools-ui'
import { DevtoolsProvider } from '../context/devtools-context'
import { HotkeyConfig } from './hotkey-config'
import type { KeyboardKey } from '../context/devtools-store'
import type { TanStackDevtoolsConfig } from '../context/devtools-context'

const MODIFIERS: Array<KeyboardKey> = ['CtrlOrMeta', 'Alt', 'Shift']

/**
 * Renders HotkeyConfig with a reactive hotkey driven through `onHotkeyChange`,
 * so a toggle/key edit updates the prop the way the real SettingsTab wires it.
 * `onHotkeyChange` is spied so each test can assert the exact emitted hotkey.
 */
const renderHotkeyConfig = (initialHotkey: Array<KeyboardKey>) => {
  const onHotkeyChange = vi.fn()
  const [hotkey, setHotkey] = createSignal<Array<KeyboardKey>>(initialHotkey)
  const result = render(() => (
    <ThemeContextProvider theme="dark">
      <DevtoolsProvider config={{ theme: 'dark' } as TanStackDevtoolsConfig}>
        <HotkeyConfig
          title="Open/Close Devtools"
          description="Hotkey to open/close devtools"
          hotkey={hotkey()}
          modifiers={MODIFIERS}
          onHotkeyChange={(next) => {
            onHotkeyChange(next)
            setHotkey(next)
          }}
        />
      </DevtoolsProvider>
    </ThemeContextProvider>
  ))
  return { ...result, onHotkeyChange }
}

describe('HotkeyConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the CtrlOrMeta toggle pressed and the modifier out of the Key input for the default hotkey', () => {
    // The default is now ['CtrlOrMeta', '~']; the modifier must show up as a
    // pressed toggle, and the Key input must hold only the non-modifier key.
    const { getByRole, getByLabelText, getByText } = renderHotkeyConfig([
      'CtrlOrMeta',
      '~',
    ])

    expect(
      getByRole('button', { name: 'Ctrl Or Meta' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
    expect(
      getByRole('button', { name: 'Alt' }).getAttribute('aria-pressed'),
    ).toBe('false')
    expect(
      getByRole('button', { name: 'Shift' }).getAttribute('aria-pressed'),
    ).toBe('false')

    // The Key input shows only '~', not the pre-fix 'CtrlOrMeta+~'.
    expect(getByLabelText<HTMLInputElement>('Key').value).toBe('~')

    // Only the three configured modifier toggles are rendered.
    expect(() => getByRole('button', { name: 'Control' })).toThrow()
    expect(() => getByRole('button', { name: 'Meta' })).toThrow()

    // The summary reflects the real hotkey.
    expect(getByText('CtrlOrMeta + ~')).toBeTruthy()
  })

  it('preserves the CtrlOrMeta modifier when the Key input is edited', () => {
    // Regression: with the bug, editing the key dropped the unrecognised
    // modifier and bound the toggle to a bare letter.
    const { getByLabelText, onHotkeyChange } = renderHotkeyConfig([
      'CtrlOrMeta',
      '~',
    ])

    fireEvent.input(getByLabelText('Key'), { target: { value: 'd' } })

    expect(onHotkeyChange).lastCalledWith(['CtrlOrMeta', 'D'])
  })

  it('adds a toggled modifier alongside the existing ones', () => {
    const { getByRole, onHotkeyChange } = renderHotkeyConfig([
      'CtrlOrMeta',
      '~',
    ])

    fireEvent.click(getByRole('button', { name: 'Alt' }))

    expect(onHotkeyChange).lastCalledWith(['CtrlOrMeta', 'Alt', '~'])
  })

  it('removes a modifier when its toggle is pressed while active', () => {
    const { getByRole, onHotkeyChange } = renderHotkeyConfig([
      'CtrlOrMeta',
      '~',
    ])

    fireEvent.click(getByRole('button', { name: 'Ctrl Or Meta' }))

    expect(onHotkeyChange).lastCalledWith(['~'])
  })

  it('does not leak a literal Control modifier into the Key input', () => {
    // Simulates an unmigrated host config (or a value written by an older
    // build). The canonical modifier list must keep Control out of the Key
    // input even though it is not in the rendered toggle list.
    const { getByLabelText, getByRole } = renderHotkeyConfig(['Control', '~'])

    expect(getByLabelText<HTMLInputElement>('Key').value).toBe('~')
    expect(
      getByRole('button', { name: 'Ctrl Or Meta' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false')
  })

  it('preserves a literal Control modifier when the Key input is edited', () => {
    const { getByLabelText, onHotkeyChange } = renderHotkeyConfig([
      'Control',
      '~',
    ])

    fireEvent.input(getByLabelText('Key'), { target: { value: 'd' } })

    // Control must survive the edit rather than being silently dropped.
    expect(onHotkeyChange).lastCalledWith(['Control', 'D'])
  })

  it('collapses a literal Control onto CtrlOrMeta when that toggle is turned on (no doubling)', () => {
    // Toggling CtrlOrMeta over a stored literal Control must not produce a
    // doubled `['CtrlOrMeta', 'Control', '~']`.
    const { getByRole, onHotkeyChange } = renderHotkeyConfig(['Control', '~'])

    fireEvent.click(getByRole('button', { name: 'Ctrl Or Meta' }))

    expect(onHotkeyChange).lastCalledWith(['CtrlOrMeta', '~'])
    // The toggle is now pressed.
    expect(
      getByRole('button', { name: 'Ctrl Or Meta' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
  })
})
