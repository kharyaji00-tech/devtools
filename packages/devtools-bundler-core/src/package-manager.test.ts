import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { emitOutdatedDeps } from './package-manager'

// `devtoolsEventClient` is a singleton imported at module load; capture emits
// on a spy. vi.hoisted ensures the spy exists before `vi.mock` runs.
const { emitSpy } = vi.hoisted(() => ({ emitSpy: vi.fn() }))

// `exec` is the only seam that performs I/O. For a CommonJS builtin such as
// `node:child_process`, vitest resolves named imports through the `default`
// export, so the mock must expose `exec` on `default` (and as a named export
// for good measure). The same hoisted `execMock` instance is shared by the
// mock module and the tests, so `mockImplementation` updates the function
// that `package-manager.ts` actually calls.
const { execMock } = vi.hoisted(() => ({ execMock: vi.fn() }))

vi.mock('@tanstack/devtools-client', () => ({
  devtoolsEventClient: { emit: emitSpy },
}))

vi.mock('node:child_process', () => ({
  default: { exec: execMock },
  exec: execMock,
}))

/**
 * Drives the mocked `exec` to invoke its callback synchronously with the given
 * (err, stdout, stderr). This mirrors how node's `exec` invokes the callback,
 * while keeping each test fully synchronous and deterministic.
 */
const stubExec = (
  err: Error | null,
  stdout: string,
  stderr = '',
): void => {
  execMock.mockImplementation(((_cmd: string, cb: any) => {
    cb(err, stdout, stderr)
    return undefined
  }) as any)
}

/**
 * Rejects with a timeout error if `promise` does not settle within `ms`.
 * Used to prove the promise from `emitOutdatedDeps()` always settles — the
 * core guarantee of the fix (the buggy code left the promise pending forever
 * on several branches, which would hang this race).
 */
const expectSettles = <T>(promise: Promise<T>, ms = 1000): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Promise did not settle within ${ms}ms`)),
        ms,
      ),
    ),
  ])

describe('emitOutdatedDeps', () => {
  beforeEach(() => {
    emitSpy.mockClear()
    execMock.mockReset()
  })

  afterEach(() => {
    execMock.mockReset()
  })

  it('resolves with the parsed object and emits it when stdout is valid JSON', async () => {
    const outdatedDeps = {
      'react': {
        current: '18.0.0',
        wanted: '18.3.1',
        latest: '19.0.0',
        dependent: 'app',
        location: 'node_modules/react',
      },
    }
    stubExec(null, JSON.stringify(outdatedDeps))

    const result = await expectSettles(emitOutdatedDeps())

    expect(result).toEqual(outdatedDeps)
    expect(emitSpy).toHaveBeenCalledTimes(1)
    expect(emitSpy).toHaveBeenCalledWith('outdated-deps-read', {
      outdatedDeps,
    })
  })

  it('emits and resolves the data even when exec reports an error but stdout is valid JSON (pnpm exits 1 with JSON)', async () => {
    // `pnpm outdated --format json` exits with code 1 when packages are
    // outdated yet still prints valid JSON. The error arg must NOT gate the
    // parse — otherwise pnpm users would lose their outdated-deps data.
    const outdatedDeps = {
      'solid-js': {
        current: '1.8.0',
        wanted: '1.8.22',
        latest: '1.9.0',
        dependent: 'app',
        location: 'node_modules/solid-js',
      },
    }
    stubExec(
      new Error('Command failed with exit code 1'),
      JSON.stringify(outdatedDeps),
    )

    const result = await expectSettles(emitOutdatedDeps())

    expect(result).toEqual(outdatedDeps)
    expect(emitSpy).toHaveBeenCalledWith('outdated-deps-read', { outdatedDeps })
  })

  it('resolves with null and emits null when stdout is empty (yarn nothing outdated)', async () => {
    stubExec(null, '')

    const result = await expectSettles(emitOutdatedDeps())

    expect(result).toBeNull()
    expect(emitSpy).toHaveBeenCalledTimes(1)
    expect(emitSpy).toHaveBeenCalledWith('outdated-deps-read', {
      outdatedDeps: null,
    })
  })

  it('resolves with null and emits null on exec error with empty stdout (command not found / missing lockfile)', async () => {
    stubExec(new Error('pnpm: not found'), '')

    const result = await expectSettles(emitOutdatedDeps())

    expect(result).toBeNull()
    expect(emitSpy).toHaveBeenCalledWith('outdated-deps-read', {
      outdatedDeps: null,
    })
  })

  it('resolves with null and emits null when stdout is non-JSON (yarn v1 newline-delimited output)', async () => {
    stubExec(null, '{"type":"table"}\n{"type":"table"}\n')

    const result = await expectSettles(emitOutdatedDeps())

    expect(result).toBeNull()
    expect(emitSpy).toHaveBeenCalledWith('outdated-deps-read', {
      outdatedDeps: null,
    })
  })

  it('still resolves with {} for npm "nothing outdated" which prints {}', async () => {
    stubExec(null, '{}')

    const result = await expectSettles(emitOutdatedDeps())

    expect(result).toEqual({})
    expect(emitSpy).toHaveBeenCalledWith('outdated-deps-read', {
      outdatedDeps: {},
    })
  })

  it('always runs the outdated command once per call', async () => {
    stubExec(null, '{}')

    await expectSettles(emitOutdatedDeps())

    expect(execMock).toHaveBeenCalledTimes(1)
    const command = execMock.mock.calls[0]?.[0]
    expect(typeof command).toBe('string')
    expect(command).toContain('outdated')
  })

  it('emits exactly one outdated-deps-read event per call across every branch', async () => {
    // failure branches previously emitted zero events (and never resolved);
    // they must now emit exactly once with null.
    for (const [err, stdout] of [
      [null, ''],
      [new Error('not found'), ''],
      [null, 'not json'],
      [null, '{}'],
    ] as Array<[Error | null, string]>) {
      emitSpy.mockClear()
      stubExec(err, stdout)
      await expectSettles(emitOutdatedDeps())
      expect(emitSpy).toHaveBeenCalledTimes(1)
    }
  })
})
