import { afterEach, describe, expect, test, vi } from 'vitest'
import { generateConsolePipeCode } from './virtual-console'
import type { ConsoleLevel } from './types'

const TEST_VITE_URL = 'http://localhost:5173'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete (window as any).__TSD_CONSOLE_PIPE_INITIALIZED__
  delete (globalThis as any).__TSD_SERVER_CONSOLE_PIPE_INITIALIZED__
})

function setupWarnConsolePipe() {
  const originalWarn = console.warn
  const originalWarnMock = vi.fn()
  const fetchMock = vi.fn().mockResolvedValue(undefined)
  const eventSourceUrls: Array<string> = []

  class MockEventSource {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null

    constructor(url: string) {
      eventSourceUrls.push(url)
    }
  }

  console.warn = originalWarnMock
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('EventSource', MockEventSource)

  const code = generateConsolePipeCode(['warn'], TEST_VITE_URL)
  new Function(code)()

  return {
    eventSourceUrls,
    fetchMock,
    originalWarnMock,
    restore: () => {
      console.warn = originalWarn
    },
  }
}

function getFirstFetchBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0]!
  return JSON.parse(init.body)
}

function getFetchBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((call) => {
    const [, init] = call as [unknown, { body: string }]
    return JSON.parse(init.body)
  })
}

/**
 * Installs the console pipe in the *server* realm (where `typeof window ===
 * 'undefined'`). The generated IIFE POSTs server logs to
 * `${VITE_SERVER_URL}/__tsd/console-pipe/server` with `source: 'server'`.
 */
function setupServerPipe(levels: Array<ConsoleLevel> = ['error']) {
  const originals: Record<string, unknown> = {}
  const captures: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const level of levels) {
    originals[level] = (console as any)[level]
    captures[level] = vi.fn()
    ;(console as any)[level] = captures[level]
  }

  const fetchMock = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('fetch', fetchMock)

  // Simulate the server/SSR realm so the IIFE's `typeof window === 'undefined'`
  // branch runs (matching how the pipe executes in the Vite dev-server process).
  const savedWindow = (globalThis as any).window
  delete (globalThis as any).window
  delete (globalThis as any).__TSD_SERVER_CONSOLE_PIPE_INITIALIZED__

  const code = generateConsolePipeCode(levels, TEST_VITE_URL)
  new Function(code)()

  return {
    fetchMock,
    captures,
    restore: () => {
      for (const level of levels) {
        ;(console as any)[level] = originals[level]
      }
      ;(globalThis as any).window = savedWindow
    },
  }
}

/**
 * Installs the console pipe in the *client* realm for the given levels. Like
 * `setupWarnConsolePipe` but configurable so the Vite-guard tests can use
 * arbitrary levels (e.g. 'error').
 */
function setupClientPipe(levels: Array<ConsoleLevel> = ['error']) {
  const originals: Record<string, unknown> = {}
  const captures: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const level of levels) {
    originals[level] = (console as any)[level]
    captures[level] = vi.fn()
    ;(console as any)[level] = captures[level]
  }

  const fetchMock = vi.fn().mockResolvedValue(undefined)

  class MockEventSource {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    constructor(_url: string) {}
  }

  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('EventSource', MockEventSource)

  delete (window as any).__TSD_CONSOLE_PIPE_INITIALIZED__

  const code = generateConsolePipeCode(levels, TEST_VITE_URL)
  new Function(code)()

  return {
    fetchMock,
    captures,
    MockEventSource,
    restore: () => {
      for (const level of levels) {
        ;(console as any)[level] = originals[level]
      }
    },
  }
}

describe('virtual-console', () => {
  test('generates inline code with specified levels', () => {
    const code = generateConsolePipeCode(['log', 'error'], TEST_VITE_URL)

    expect(code).toContain('["log","error"]')
    expect(code).toContain('originalConsole')
    expect(code).toContain('__TSD_CONSOLE_PIPE_INITIALIZED__')
  })

  test('uses fetch to send client logs', () => {
    const code = generateConsolePipeCode(['log'], TEST_VITE_URL)

    expect(code).toContain('/__tsd/console-pipe')
    expect(code).toContain("method: 'POST'")
  })

  test('uses SSE to receive server logs', () => {
    const code = generateConsolePipeCode(['log'], TEST_VITE_URL)

    expect(code).toContain("new EventSource('/__tsd/console-pipe/sse')")
  })

  test('includes environment detection', () => {
    const code = generateConsolePipeCode(['log'], TEST_VITE_URL)

    expect(code).toContain("typeof window === 'undefined'")
    expect(code).toContain('isServer')
  })

  test('includes batcher configuration', () => {
    const code = generateConsolePipeCode(['log'], TEST_VITE_URL)

    expect(code).toContain('BATCH_WAIT')
    expect(code).toContain('BATCH_MAX_SIZE')
  })

  test('includes flush functionality', () => {
    const code = generateConsolePipeCode(['log'], TEST_VITE_URL)

    expect(code).toContain('flushBatch')
  })

  test('includes beforeunload listener for browser', () => {
    const code = generateConsolePipeCode(['log'], TEST_VITE_URL)

    expect(code).toContain('beforeunload')
  })

  test('wraps code in IIFE', () => {
    const code = generateConsolePipeCode(['log'], TEST_VITE_URL)

    expect(code).toContain('(function __tsdConsolePipe()')
    expect(code).toContain('})();')
  })

  test('has no external imports', () => {
    const code = generateConsolePipeCode(['log'], TEST_VITE_URL)

    expect(code).not.toContain('import ')
  })

  test('includes vite server URL for server piping', () => {
    const code = generateConsolePipeCode(['log'], TEST_VITE_URL)

    expect(code).toContain(TEST_VITE_URL)
    expect(code).toContain('/__tsd/console-pipe/server')
  })

  test('serializes DOM elements before sending logs', async () => {
    vi.useFakeTimers()

    const { eventSourceUrls, fetchMock, originalWarnMock, restore } =
      setupWarnConsolePipe()

    try {
      const button = document.createElement('button')
      button.id = 'save'
      button.className = 'primary'
      button.type = 'button'
      button.setAttribute('data-testid', 'save-button')

      console.warn('gesture warning', button)

      await vi.advanceTimersByTimeAsync(100)

      expect(originalWarnMock).toHaveBeenCalledWith('gesture warning', button)
      expect(eventSourceUrls).toEqual(['/__tsd/console-pipe/sse'])
      expect(fetchMock).toHaveBeenCalledTimes(1)

      const body = getFirstFetchBody(fetchMock)

      expect(body.entries[0]).toMatchObject({
        level: 'warn',
        source: 'client',
        args: [
          'gesture warning',
          '<button id="save" class="primary" type="button" data-testid="save-button">',
        ],
      })
    } finally {
      restore()
    }
  })

  test('serializes circular refs and Error objects before sending logs', async () => {
    vi.useFakeTimers()

    const { fetchMock, originalWarnMock, restore } = setupWarnConsolePipe()

    try {
      const circular: Record<string, unknown> = { name: 'root' }
      circular.self = circular
      const error = new Error('boom')

      console.warn('complex warning', circular, error)

      await vi.advanceTimersByTimeAsync(100)

      expect(originalWarnMock).toHaveBeenCalledWith(
        'complex warning',
        circular,
        error,
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)

      const body = getFirstFetchBody(fetchMock)

      expect(body.entries[0].args[1]).toEqual({
        name: 'root',
        self: '[Circular]',
      })
      expect(body.entries[0].args[2]).toMatchObject({
        name: 'Error',
        message: 'boom',
      })
      expect(typeof body.entries[0].args[2].stack).toBe('string')
    } finally {
      restore()
    }
  })

  test('limits large console payloads before sending logs', async () => {
    vi.useFakeTimers()

    const { fetchMock, restore } = setupWarnConsolePipe()

    try {
      const longArray = Array.from({ length: 101 }, (_, index) => index)
      const manyKeys: Record<string, number> = {}
      for (let index = 0; index < 101; index++) {
        manyKeys['key' + index] = index
      }
      const longString = 'x'.repeat(10001)
      const typedArray = new Uint8Array(1024)
      const deepObject = {
        a: {
          b: {
            c: {
              d: {
                e: {
                  f: {
                    g: 'too deep',
                  },
                },
              },
            },
          },
        },
      }

      console.warn(
        'large payload',
        longArray,
        manyKeys,
        longString,
        typedArray,
        deepObject,
      )

      await vi.advanceTimersByTimeAsync(100)

      const body = getFirstFetchBody(fetchMock)

      expect(body.entries[0].args[1]).toHaveLength(101)
      expect(body.entries[0].args[1][100]).toBe('... (1 more)')
      expect(Object.keys(body.entries[0].args[2])).toHaveLength(101)
      expect(body.entries[0].args[2]['...']).toBe('(1 more keys)')
      expect(body.entries[0].args[3].startsWith('x'.repeat(10000))).toBe(true)
      expect(body.entries[0].args[3]).toContain('... (1 more chars)')
      expect(body.entries[0].args[4]).toBe('[Uint8Array(1024)]')
      expect(body.entries[0].args[5].a.b.c.d.e.f).toBe('[MaxDepth]')
    } finally {
      restore()
    }
  })

  test('skips Vite-forwarded console logs on the server (echo loop fix)', async () => {
    vi.useFakeTimers()

    const { fetchMock, restore } = setupServerPipe(['error', 'warn'])

    try {
      // A genuine server-side app log must still be piped to the browser.
      console.error('real server boom')

      // Vite 8's server.forwardConsole prints forwarded client console calls
      // through the server logger as "<time> [vite] [console.<level>] …".
      // These must NOT be re-captured as server logs (that is the echo loop).
      console.error('10:00:00 AM [vite] [console.error] [Server] hello')
      console.warn('10:00:01 AM [vite] [console.warn] [Server] careful')

      await vi.advanceTimersByTimeAsync(50)

      expect(fetchMock).toHaveBeenCalledTimes(1)

      const bodies = getFetchBodies(fetchMock)
      const entries = bodies.flatMap((b) => b.entries)

      expect(entries).toHaveLength(1)
      expect(entries[0].args[0]).toBe('real server boom')
      expect(entries[0].level).toBe('error')
      expect(entries[0].source).toBe('server')
      expect(entries.some((e) => String(e.args[0]).includes('[vite]'))).toBe(
        false,
      )
      expect(entries.some((e) => String(e.args[0]).includes('[console.'))).toBe(
        false,
      )
    } finally {
      restore()
    }
  })

  test('skips Vite-forwarded logs even without the [vite] tag', async () => {
    vi.useFakeTimers()

    const { fetchMock, restore } = setupServerPipe(['error'])

    try {
      console.error('genuine server message')
      // Some Vite variants log forwarded console with a [console.<level>] tag
      // but no explicit [vite] tag — the guard must still recognize it.
      console.error('10:00:00 AM [console.error] forwarded without vite tag')

      await vi.advanceTimersByTimeAsync(50)

      const bodies = getFetchBodies(fetchMock)
      const entries = bodies.flatMap((b) => b.entries)

      expect(entries).toHaveLength(1)
      expect(entries[0].args[0]).toBe('genuine server message')
    } finally {
      restore()
    }
  })

  test('server guard only skips true string args', async () => {
    vi.useFakeTimers()

    const { fetchMock, restore } = setupServerPipe(['error'])

    try {
      // Non-string first args must not be affected by the guard.
      console.error(42, 'number first arg')
      console.error({ key: 'value' })

      await vi.advanceTimersByTimeAsync(50)

      const bodies = getFetchBodies(fetchMock)
      const entries = bodies.flatMap((b) => b.entries)

      expect(entries).toHaveLength(2)
      expect(entries[0].args[0]).toBe(42)
      expect(entries[1].args[0]).toMatchObject({ key: 'value' })
    } finally {
      restore()
    }
  })

  test('does not skip Vite-format logs on the client (guard is server-only)', async () => {
    vi.useFakeTimers()

    const { fetchMock, restore } = setupClientPipe(['error'])

    try {
      // On the client, the new guard must not fire: the loop only closes on the
      // server, and a browser log that merely contains "[vite]" is genuine
      // client output that must still be piped.
      console.error('something [vite] in my client log')
      console.error('another [console.error] client message')

      await vi.advanceTimersByTimeAsync(100)

      expect(fetchMock).toHaveBeenCalledTimes(1)

      const body = getFirstFetchBody(fetchMock)
      expect(body.entries).toHaveLength(2)
      expect(body.entries[0].args[0]).toBe('something [vite] in my client log')
      expect(body.entries[1].source).toBe('client')
    } finally {
      restore()
    }
  })

  test('breaks the client→terminal→server→client echo loop', async () => {
    vi.useFakeTimers()

    const { fetchMock, captures, restore } = setupServerPipe(['error'])

    try {
      // The genuine server error seeds the flow.
      console.error('boom')

      // Simulate several Vite-forwarded reprints that, before the fix, each
      // re-broadcasts to the browser, which re-prints through Vite's forwarder,
      // which re-captures on the server … nesting [Server] prefixes each hop.
      // Each of these lines matches the Vite logger format and must be skipped.
      console.error('10:00:00 AM [vite] [console.error] [Server] boom')
      console.error('10:00:00 AM [vite] [console.error] [Server] [Server] boom')
      console.error(
        '10:00:00 AM [vite] [console.error] [Server] [Server] [Server] boom',
      )

      await vi.advanceTimersByTimeAsync(50)

      const bodies = getFetchBodies(fetchMock)
      const entries = bodies.flatMap((b) => b.entries)

      // Bounded: only the single genuine server line is ever re-broadcast,
      // regardless of how many nested Vite reprints arrive. This is the
      // termination guarantee that was missing before the fix.
      expect(entries).toHaveLength(1)
      expect(entries[0].args[0]).toBe('boom')
      expect(entries.some((e) => String(e.args[0]).includes('[vite]'))).toBe(
        false,
      )

      // The genuine line still printed to the terminal exactly once, and each
      // Vite reprint still printed to the terminal (original.apply always runs)
      // — they are simply not re-broadcast to the browser.
      expect(captures.error).toHaveBeenCalledTimes(4)
    } finally {
      restore()
    }
  })
})
