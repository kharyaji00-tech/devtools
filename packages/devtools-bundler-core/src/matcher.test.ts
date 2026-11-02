import { describe, expect, it } from 'vitest'
import { matcher } from './matcher'

describe('matcher', () => {
  it('returns false when patterns is empty', () => {
    expect(matcher([], 'foo')).toBe(false)
  })

  it('matches string patterns against component names', () => {
    const patterns = ['Button', 'MyComponent']
    expect(matcher(patterns, 'Button')).toBe(true)
    expect(matcher(patterns, 'Other')).toBe(false)
  })

  it('matches regex patterns against component names', () => {
    const patterns = [/^Button$/, /Comp/]
    expect(matcher(patterns, 'Button')).toBe(true)
    expect(matcher(patterns, 'MyComp')).toBe(true)
    expect(matcher(patterns, 'NoMatch')).toBe(false)
  })

  it('matches file paths with glob patterns', () => {
    const patterns = ['**/ignored-file.jsx']
    expect(matcher(patterns, 'src/components/ignored-file.jsx')).toBe(true)
    expect(matcher(patterns, 'src/components/other.jsx')).toBe(false)
  })

  it('matches file paths with regex', () => {
    const patterns = [/ignored-file\.jsx$/]
    expect(matcher(patterns, 'src/components/ignored-file.jsx')).toBe(true)
    expect(matcher(patterns, 'src/components/other.jsx')).toBe(false)
  })

  // picomatch string patterns are anchored at the start of the input. This is
  // why callers must hand `matcher` a path with no leading slash: a relative
  // glob like `src/**/*.jsx` matches `src/...` but never `/src/...`. See
  // `inject-source.ts`, which strips the leading slash left by the cwd strip.
  it('does not match relative globs against a leading-slash path', () => {
    expect(matcher(['src/**/*.jsx'], 'src/components/ignored-file.jsx')).toBe(
      true,
    )
    expect(matcher(['src/**/*.jsx'], '/src/components/ignored-file.jsx')).toBe(
      false,
    )
    expect(
      matcher(
        ['src/components/ignored-file.jsx'],
        '/src/components/ignored-file.jsx',
      ),
    ).toBe(false)
  })
})
