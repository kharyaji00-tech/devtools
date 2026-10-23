import picomatch from 'picomatch'

export const matcher = (
  patterns: Array<string | RegExp>,
  str: string,
): boolean => {
  if (patterns.length === 0) {
    return false
  }
  const matchers = patterns.map((pattern) => {
    if (typeof pattern === 'string') {
      return picomatch(pattern)
    } else {
      const re = /[gy]/.test(pattern.flags)
        ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''))
        : pattern
      return (s: string) => re.test(s)
    }
  })

  return matchers.some((isMatch) => isMatch(str))
}
