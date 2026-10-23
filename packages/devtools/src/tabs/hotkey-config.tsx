import { Show } from 'solid-js'
import { Button, Input } from '@tanstack/devtools-ui'

import { uppercaseFirstLetter } from '../utils/sanitize'
import { createStyles } from '../styles/use-styles'
import { keyboardModifiers } from '../context/devtools-store'
import type { KeyboardKey } from '../context/devtools-store'

interface HotkeyConfigProps {
  title: string
  description: string
  hotkey: Array<KeyboardKey>
  modifiers: Array<KeyboardKey>
  onHotkeyChange: (hotkey: Array<KeyboardKey>) => void
}

const MODIFIER_DISPLAY_NAMES: Record<KeyboardKey, string> = {
  Shift: 'Shift',
  Alt: 'Alt',
  Meta: 'Meta',
  Control: 'Control',
  CtrlOrMeta: 'Ctrl Or Meta',
}

export const HotkeyConfig = (props: HotkeyConfigProps) => {
  const styles = createStyles()

  const toggleModifier = (modifier: KeyboardKey) => {
    if (props.hotkey.includes(modifier)) {
      props.onHotkeyChange(props.hotkey.filter((key) => key !== modifier))
    } else {
      const existingModifiers = props.hotkey.filter((key) =>
        keyboardModifiers.includes(key as any),
      )
      const otherKeys = props.hotkey.filter(
        (key) => !keyboardModifiers.includes(key as any),
      )
      // `CtrlOrMeta` subsumes the literal `Control`/`Meta` it expands to, so
      // turning it on over a stored literal would double the modifier (e.g.
      // `['Control', '~']` -> `['Control', 'CtrlOrMeta', '~']`). Drop the
      // literals so the abstract toggle is the single source of truth.
      const mergedModifiers =
        modifier === 'CtrlOrMeta'
          ? existingModifiers.filter(
              (key) => key !== 'Control' && key !== 'Meta',
            )
          : existingModifiers
      props.onHotkeyChange([...mergedModifiers, modifier, ...otherKeys])
    }
  }

  const getNonModifierValue = () => {
    return props.hotkey
      .filter((key) => !keyboardModifiers.includes(key as any))
      .join('+')
  }

  const handleKeyInput = (input: string) => {
    const makeModifierArray = (key: string) => {
      if (key.length === 1) return [uppercaseFirstLetter(key)]
      const modifiersArray: Array<string> = []
      for (const character of key) {
        const newLetter = uppercaseFirstLetter(character)
        if (!modifiersArray.includes(newLetter)) modifiersArray.push(newLetter)
      }
      return modifiersArray
    }

    const hotkeyModifiers = props.hotkey.filter((key) =>
      keyboardModifiers.includes(key as any),
    )
    const newKeys = input
      .split('+')
      .flatMap((key) => makeModifierArray(key))
      .filter(Boolean)
    props.onHotkeyChange([...hotkeyModifiers, ...newKeys])
  }

  const getDisplayHotkey = () => {
    return props.hotkey.join(' + ')
  }

  return (
    <div class={styles().settingsGroup}>
      {/* `title` names the shortcut, `description` explains it — before, the
          description was rendered as the heading and `title` went unused. */}
      <h4 class={styles().hotkeyTitle}>{props.title}</h4>
      <p class={styles().hotkeyDescription}>{props.description}</p>
      <div class={styles().settingsModifiers}>
        <Show keyed when={props.hotkey}>
          {props.modifiers.map((modifier) => {
            const enabled = props.hotkey.includes(modifier)
            return (
              <Button
                variant="secondary"
                aria-pressed={enabled}
                onclick={() => toggleModifier(modifier)}
                outline={!enabled}
              >
                {MODIFIER_DISPLAY_NAMES[modifier] || modifier}
              </Button>
            )
          })}
        </Show>
      </div>
      <Input
        label="Key"
        description="Use '+' to combine keys (e.g., 'a+b' or 'd'). This will be used with the enabled modifiers from above"
        placeholder="a"
        value={getNonModifierValue()}
        onChange={handleKeyInput}
      />
      <p class={styles().hotkeyResult}>
        Final shortcut is{' '}
        <kbd class={styles().hotkeyResultKeys}>{getDisplayHotkey()}</kbd>
      </p>
    </div>
  )
}
