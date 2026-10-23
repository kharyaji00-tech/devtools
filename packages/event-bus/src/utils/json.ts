/**
 * Safely stringify data that may contain BigInt values
 * BigInt values are converted to objects with a special marker
 */
export function stringifyWithBigInt(data: any): string {
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === 'bigint') {
      return {
        __type: 'bigint',
        value: value.toString(),
      }
    }
    return value
  })
}

/**
 * Parse JSON and restore BigInt values
 * Objects with __type: 'bigint' are converted back to BigInt
 */
export function parseWithBigInt(json: string): any {
  return JSON.parse(json, (_key, value) => {
    if (
      value &&
      typeof value === 'object' &&
      value.__type === 'bigint' &&
      typeof value.value === 'string'
    ) {
      try {
        return BigInt(value.value)
      } catch {
        // The marker shape matched but the value is not a valid BigInt string
        // (e.g. a non-numeric string). Leave the value unchanged instead of
        // throwing, so malformed payloads cannot crash the host process.
        return value
      }
    }
    return value
  })
}
