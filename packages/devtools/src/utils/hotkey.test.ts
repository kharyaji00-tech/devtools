import { describe, expect, it } from 'vitest'
import {
  getHotkeyPermutations,
  isHotkeyCombinationPressed,
  migrateHotkeyModifiers,
  normalizeHotkey,
} from './hotkey'
import type { KeyboardKey } from '../context/devtools-store'

describe('hotkey utilities', () => {
  describe('migrateHotkeyModifiers', () => {
    it('rewrites a legacy literal Control to the CtrlOrMeta token', () => {
      const hotkey: Array<KeyboardKey> = ['Control', '~']
      expect(migrateHotkeyModifiers(hotkey)).toEqual(['CtrlOrMeta', '~'])
    })

    it('rewrites a legacy literal Meta to the CtrlOrMeta token', () => {
      const hotkey: Array<KeyboardKey> = ['Meta', '~']
      expect(migrateHotkeyModifiers(hotkey)).toEqual(['CtrlOrMeta', '~'])
    })

    it('leaves a hotkey that already uses CtrlOrMeta untouched', () => {
      const hotkey: Array<KeyboardKey> = ['CtrlOrMeta', '~']
      expect(migrateHotkeyModifiers(hotkey)).toEqual(['CtrlOrMeta', '~'])
    })

    it('leaves a hotkey with no literal Control/Meta untouched', () => {
      const hotkey: Array<KeyboardKey> = ['Shift', 'A']
      expect(migrateHotkeyModifiers(hotkey)).toEqual(['Shift', 'A'])
    })

    it('collapses a doubled CtrlOrMeta+Control combo into a single CtrlOrMeta', () => {
      // Produced by the bug when toggling CtrlOrMeta on top of the legacy
      // ['Control', '~'] default.
      const hotkey: Array<KeyboardKey> = ['CtrlOrMeta', 'Control', '~']
      expect(migrateHotkeyModifiers(hotkey)).toEqual(['CtrlOrMeta', '~'])
    })

    it('collapses both Control and Meta into one CtrlOrMeta', () => {
      const hotkey: Array<KeyboardKey> = ['Meta', 'Control', 'X']
      expect(migrateHotkeyModifiers(hotkey)).toEqual(['CtrlOrMeta', 'X'])
    })

    it('preserves other modifiers and the key when collapsing', () => {
      const hotkey: Array<KeyboardKey> = ['Control', 'Alt', 'B']
      expect(migrateHotkeyModifiers(hotkey)).toEqual(['CtrlOrMeta', 'Alt', 'B'])
    })

    it('handles an empty hotkey array', () => {
      const hotkey: Array<KeyboardKey> = []
      expect(migrateHotkeyModifiers(hotkey)).toEqual([])
    })
  })

  describe('normalizeHotkey', () => {
    it('should return unchanged array when CtrlOrMeta is not present', () => {
      const hotkey: Array<KeyboardKey> = ['Shift', 'A']
      const result = normalizeHotkey(hotkey)
      expect(result).toEqual([['Shift', 'A']])
    })

    it('should expand CtrlOrMeta to Control and Meta variants', () => {
      const hotkey: Array<KeyboardKey> = ['Shift', 'CtrlOrMeta']
      const result = normalizeHotkey(hotkey)
      expect(result).toHaveLength(2)
      expect(result).toContainEqual(['Shift', 'Control'])
      expect(result).toContainEqual(['Shift', 'Meta'])
    })
  })

  describe('getHotkeyPermutations', () => {
    it('should generate permutations for modifiers in any order', () => {
      const hotkey: Array<KeyboardKey> = ['Shift', 'Control', 'A']
      const result = getHotkeyPermutations(hotkey)
      expect(result).toContainEqual(['Shift', 'Control', 'A'])
      expect(result).toContainEqual(['Control', 'Shift', 'A'])
    })

    it('should handle CtrlOrMeta expansion with multiple permutations', () => {
      const hotkey: Array<KeyboardKey> = ['Shift', 'CtrlOrMeta']
      const result = getHotkeyPermutations(hotkey)
      expect(result).toContainEqual(['Shift', 'Control'])
      expect(result).toContainEqual(['Control', 'Shift'])
      expect(result).toContainEqual(['Shift', 'Meta'])
      expect(result).toContainEqual(['Meta', 'Shift'])
    })

    it('should handle single key hotkey with no modifiers', () => {
      const hotkey: Array<KeyboardKey> = ['A']
      const result = getHotkeyPermutations(hotkey)
      expect(result).toEqual([['A']])
    })

    it('should not have duplicate permutations', () => {
      const hotkey: Array<KeyboardKey> = ['Shift', 'Alt', 'A']
      const result = getHotkeyPermutations(hotkey)
      const stringified = result.map((combo) => JSON.stringify(combo))
      const unique = new Set(stringified)
      expect(unique.size).toBe(stringified.length)
    })
  })

  describe('isHotkeyCombinationPressed', () => {
    it('should match exact key combination', () => {
      expect(isHotkeyCombinationPressed(['Shift', 'A'], ['Shift', 'A'])).toBe(
        true,
      )
    })

    it('should be case-insensitive', () => {
      expect(isHotkeyCombinationPressed(['shift', 'a'], ['Shift', 'A'])).toBe(
        true,
      )
    })

    it('should match regardless of modifier order', () => {
      expect(
        isHotkeyCombinationPressed(
          ['A', 'Control', 'Shift'],
          ['Shift', 'Control', 'A'],
        ),
      ).toBe(true)
    })

    it('should handle CtrlOrMeta with Control', () => {
      expect(
        isHotkeyCombinationPressed(
          ['Shift', 'Control'],
          ['Shift', 'CtrlOrMeta'],
        ),
      ).toBe(true)
    })

    it('should handle CtrlOrMeta with Meta', () => {
      expect(
        isHotkeyCombinationPressed(['Shift', 'Meta'], ['Shift', 'CtrlOrMeta']),
      ).toBe(true)
    })

    it('should reject incomplete key combinations', () => {
      expect(isHotkeyCombinationPressed(['Shift'], ['Shift', 'A'])).toBe(false)
    })

    it('should reject extra keys', () => {
      expect(
        isHotkeyCombinationPressed(['Shift', 'A', 'B'], ['Shift', 'A']),
      ).toBe(false)
    })

    it('should handle single key hotkey', () => {
      expect(isHotkeyCombinationPressed(['A'], ['A'])).toBe(true)
    })
  })
})
