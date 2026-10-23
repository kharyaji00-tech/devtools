import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DevtoolsEventClient,
  devtoolsEventClient,
} from '../src/production'

describe('@tanstack/devtools-client/production subpath', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    // Seed the shared in-process event target so the (Node-side) client binds
    // listeners to a target we control, exactly like the rspack plugin does
    // in `apply()`. Fake timers own the connect-loop `setInterval` that a real
    // `emit()` schedules so it never leaks across tests.
    globalThis.__TANSTACK_EVENT_TARGET__ = new EventTarget()
    vi.useFakeTimers()
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
    globalThis.__TANSTACK_EVENT_TARGET__ = null
    vi.clearAllTimers()
    vi.useRealTimers()
    process.env.NODE_ENV = originalNodeEnv
  })

  it('exposes the real DevtoolsEventClient singleton (not the no-op)', () => {
    process.env.NODE_ENV = 'production'
    // The no-op's `on()` returns a no-op cleanup and never touches the event
    // target; the real client's `on()` registers a real listener.
    const target = globalThis.__TANSTACK_EVENT_TARGET__!
    const addSpy = vi.spyOn(target, 'addEventListener')
    cleanups.push(devtoolsEventClient.on('mounted', () => {}))
    expect(addSpy).toHaveBeenCalledWith(
      'tanstack-devtools-core:mounted',
      expect.any(Function),
    )
    addSpy.mockRestore()
  })

  it('fires registered handlers when the matching event is dispatched under non-development NODE_ENV', () => {
    process.env.NODE_ENV = 'production'
    const target = globalThis.__TANSTACK_EVENT_TARGET__!
    const handler = vi.fn()
    cleanups.push(devtoolsEventClient.on('mounted', handler))

    target.dispatchEvent(
      new CustomEvent('tanstack-devtools-core:mounted', {
        detail: { type: 'tanstack-devtools-core:mounted', payload: undefined },
      }),
    )
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('emits to the shared target (dispatches the tanstack-connect handshake) under non-development NODE_ENV', () => {
    process.env.NODE_ENV = 'production'
    const target = globalThis.__TANSTACK_EVENT_TARGET__!
    const dispatchSpy = vi.spyOn(target, 'dispatchEvent')
    const client = new DevtoolsEventClient()
    // An emit while not connected triggers the handshake dispatch
    // (`tanstack-connect`) on the shared target — the no-op never dispatches.
    client.emit('mounted', undefined)
    const dispatchedTypes = dispatchSpy.mock.calls.map((call) => call[0].type)
    expect(dispatchedTypes).toContain('tanstack-connect')
    dispatchSpy.mockRestore()
  })

  it('stays real regardless of NODE_ENV (unset, test, production)', () => {
    for (const env of [undefined, 'test', 'production']) {
      process.env.NODE_ENV = env
      const target = globalThis.__TANSTACK_EVENT_TARGET__!
      const addSpy = vi.spyOn(target, 'addEventListener')
      const client = new DevtoolsEventClient()
      const off = client.on('mounted', () => {})
      expect(addSpy).toHaveBeenCalledWith(
        'tanstack-devtools-core:mounted',
        expect.any(Function),
      )
      addSpy.mockRestore()
      off()
    }
  })
})
