import { describe, expect, it } from 'vitest'
import { parseWithBigInt, stringifyWithBigInt } from './json'

describe('json utils', () => {
  describe('stringifyWithBigInt', () => {
    it('should handle regular JSON data', () => {
      const data = { name: 'test', count: 42, nested: { value: true } }
      const result = stringifyWithBigInt(data)
      expect(result).toBe(JSON.stringify(data))
    })

    it('should convert BigInt to object with marker', () => {
      const data = { id: BigInt(9007199254740991) }
      const result = stringifyWithBigInt(data)
      const parsed = JSON.parse(result)
      expect(parsed.id).toEqual({
        __type: 'bigint',
        value: '9007199254740991',
      })
    })

    it('should handle nested BigInt values', () => {
      const data = {
        user: { id: BigInt(123), balance: BigInt(456789) },
        timestamp: BigInt(1234567890),
      }
      const result = stringifyWithBigInt(data)
      const parsed = JSON.parse(result)
      expect(parsed.user.id).toEqual({ __type: 'bigint', value: '123' })
      expect(parsed.user.balance).toEqual({
        __type: 'bigint',
        value: '456789',
      })
      expect(parsed.timestamp).toEqual({
        __type: 'bigint',
        value: '1234567890',
      })
    })

    it('should handle arrays with BigInt', () => {
      const data = [BigInt(1), BigInt(2), BigInt(3)]
      const result = stringifyWithBigInt(data)
      const parsed = JSON.parse(result)
      expect(parsed).toEqual([
        { __type: 'bigint', value: '1' },
        { __type: 'bigint', value: '2' },
        { __type: 'bigint', value: '3' },
      ])
    })

    it('should handle mixed types with BigInt', () => {
      const data = {
        string: 'text',
        number: 42,
        bigint: BigInt(999),
        boolean: true,
        null: null,
        array: [1, BigInt(2), 'three'],
      }
      const result = stringifyWithBigInt(data)
      const parsed = JSON.parse(result)
      expect(parsed.bigint).toEqual({ __type: 'bigint', value: '999' })
      expect(parsed.array[1]).toEqual({ __type: 'bigint', value: '2' })
    })
  })

  describe('parseWithBigInt', () => {
    it('should handle regular JSON data', () => {
      const json = JSON.stringify({ name: 'test', count: 42 })
      const result = parseWithBigInt(json)
      expect(result).toEqual({ name: 'test', count: 42 })
    })

    it('should restore BigInt from marker object', () => {
      const json = JSON.stringify({ id: { __type: 'bigint', value: '123' } })
      const result = parseWithBigInt(json)
      expect(result.id).toBe(BigInt(123))
      expect(typeof result.id).toBe('bigint')
    })

    it('should handle nested BigInt restoration', () => {
      const json = JSON.stringify({
        user: {
          id: { __type: 'bigint', value: '9007199254740991' },
          balance: { __type: 'bigint', value: '456789' },
        },
        timestamp: { __type: 'bigint', value: '1234567890' },
      })
      const result = parseWithBigInt(json)
      expect(result.user.id).toBe(BigInt(9007199254740991))
      expect(result.user.balance).toBe(BigInt(456789))
      expect(result.timestamp).toBe(BigInt(1234567890))
    })

    it('should handle arrays with BigInt restoration', () => {
      const json = JSON.stringify([
        { __type: 'bigint', value: '1' },
        { __type: 'bigint', value: '2' },
        { __type: 'bigint', value: '3' },
      ])
      const result = parseWithBigInt(json)
      expect(result).toEqual([BigInt(1), BigInt(2), BigInt(3)])
    })

    it('should not convert objects that look like BigInt markers but are not', () => {
      const json = JSON.stringify({
        fake: { __type: 'bigint', value: 123 }, // value is not a string
        real: { __type: 'bigint', value: '456' },
      })
      const result = parseWithBigInt(json)
      expect(result.fake).toEqual({ __type: 'bigint', value: 123 })
      expect(result.real).toBe(BigInt(456))
    })

    it('should leave a marker with a non-numeric value string unchanged instead of throwing', () => {
      const json = JSON.stringify({
        bad: { __type: 'bigint', value: 'abc' },
      })
      expect(() => parseWithBigInt(json)).not.toThrow()
      const result = parseWithBigInt(json)
      expect(result.bad).toEqual({ __type: 'bigint', value: 'abc' })
    })

    it('should leave markers with various invalid value strings unchanged', () => {
      // These strings are all rejected by BigInt() and should be left as-is.
      const invalidValues = ['abc', '1.5', 'NaN', 'Infinity', '[]', 'undefined']
      for (const invalidValue of invalidValues) {
        const json = JSON.stringify({
          __type: 'bigint',
          value: invalidValue,
        })
        expect(() => parseWithBigInt(json)).not.toThrow()
        const result = parseWithBigInt(json)
        expect(result).toEqual({ __type: 'bigint', value: invalidValue })
      }
    })

    it('should convert empty/whitespace marker values (valid BigInt strings)', () => {
      // BigInt('') and BigInt('   ') both return 0n; this is existing JS
      // behavior and not a crash vector, so the marker should still convert.
      expect(
        parseWithBigInt(JSON.stringify({ __type: 'bigint', value: '' })),
      ).toBe(0n)
      expect(
        parseWithBigInt(JSON.stringify({ __type: 'bigint', value: '   ' })),
      ).toBe(0n)
    })

    it('should still convert valid numeric marker strings alongside invalid ones', () => {
      const json = JSON.stringify({
        good: { __type: 'bigint', value: '123' },
        bad: { __type: 'bigint', value: 'abc' },
        alsoGood: { __type: 'bigint', value: '9007199254740991' },
      })
      const result = parseWithBigInt(json)
      expect(result.good).toBe(BigInt(123))
      expect(result.bad).toEqual({ __type: 'bigint', value: 'abc' })
      expect(result.alsoGood).toBe(BigInt(9007199254740991))
    })

    it('should throw on invalid JSON (not silently swallow parse errors)', () => {
      expect(() => parseWithBigInt('not json')).toThrow(SyntaxError)
      expect(() => parseWithBigInt('{')).toThrow(SyntaxError)
    })
  })

  describe('round-trip', () => {
    it('should correctly round-trip BigInt values', () => {
      const original = {
        id: BigInt(9007199254740991),
        nested: {
          value: BigInt(123456789),
        },
        array: [BigInt(1), BigInt(2)],
      }
      const stringified = stringifyWithBigInt(original)
      const parsed = parseWithBigInt(stringified)
      expect(parsed.id).toBe(original.id)
      expect(parsed.nested.value).toBe(original.nested.value)
      expect(parsed.array[0]).toBe(original.array[0])
      expect(parsed.array[1]).toBe(original.array[1])
    })

    it('should handle very large BigInt values', () => {
      const original = {
        huge: BigInt('123456789012345678901234567890'),
      }
      const stringified = stringifyWithBigInt(original)
      const parsed = parseWithBigInt(stringified)
      expect(parsed.huge).toBe(original.huge)
    })
  })
})
