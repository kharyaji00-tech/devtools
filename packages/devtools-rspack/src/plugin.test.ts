import { getDevServerOrigin } from '@tanstack/devtools-bundler-core'
import { devtoolsEventClient } from '@tanstack/devtools-client/production'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TanStackDevtoolsRspackPlugin } from './plugin'

function mockCompiler(mode: 'development' | 'production') {
  return {
    options: {
      mode,
      module: { rules: [] as Array<any> },
      devServer: {} as any,
      target: 'web',
    },
    hooks: {
      watchRun: { tapPromise: vi.fn() },
      done: { tap: vi.fn() },
    },
  }
}

describe('TanStackDevtoolsRspackPlugin', () => {
  it('injects the loader rule for js/ts/jsx/tsx', () => {
    const c = mockCompiler('development')
    new TanStackDevtoolsRspackPlugin().apply(c as any)
    // The task-specified rule test is `/\.[cm]?[jt]sx?$/`; assert it functionally
    // matches every extension rather than relying on a brittle string include.
    const rule = c.options.module.rules.find(
      (r: any) => r.test instanceof RegExp && r.test.test('foo.jsx'),
    )
    expect(rule).toBeTruthy()
    expect(rule.test.test('foo.js')).toBe(true)
    expect(rule.test.test('foo.ts')).toBe(true)
    expect(rule.test.test('foo.tsx')).toBe(true)
    expect(String(rule.use?.[0]?.loader ?? rule.loader)).toContain('loader')
  })

  it('also injects a node_modules-scoped rule for @tanstack/devtools|event-bus packages', () => {
    const c = mockCompiler('development')
    new TanStackDevtoolsRspackPlugin().apply(c as any)

    expect(c.options.module.rules).toHaveLength(2)

    // Exactly one rule has no `exclude` and a narrow `include` matching only
    // @tanstack/devtools*/@tanstack/event-bus* packages under node_modules
    // (covering both a flat node_modules layout and pnpm's nested
    // `.pnpm/<pkg>/node_modules/<pkg>` virtual-store layout).
    const scopedRules = c.options.module.rules.filter(
      (r: any) => r.exclude === undefined && r.include instanceof RegExp,
    )
    expect(scopedRules).toHaveLength(1)
    const scopedRule = scopedRules[0]

    const nodeModulesSample =
      '/repo/node_modules/@tanstack/devtools-event-bus/dist/client/client.js'
    const pnpmNestedSample =
      '/repo/node_modules/.pnpm/@tanstack+devtools-event-bus@1.0.0/node_modules/@tanstack/devtools-event-bus/dist/client/client.js'
    expect(scopedRule.include.test(nodeModulesSample)).toBe(true)
    expect(scopedRule.include.test(pnpmNestedSample)).toBe(true)
    expect(String(scopedRule.use?.[0]?.loader ?? scopedRule.loader)).toContain(
      'loader',
    )

    // The general rule (the other one) still excludes ordinary node_modules
    // code and processes ordinary app source.
    const generalRule = c.options.module.rules.find(
      (r: any) => r !== scopedRule,
    )
    expect(generalRule.exclude.test('/repo/node_modules/react/index.js')).toBe(
      true,
    )
    expect(generalRule.exclude.test('/repo/src/app.tsx')).toBe(false)
  })

  it('wraps devServer.setupMiddlewares in development', () => {
    const c = mockCompiler('development')
    new TanStackDevtoolsRspackPlugin().apply(c as any)
    expect(typeof c.options.devServer.setupMiddlewares).toBe('function')
  })

  it('does not wrap setupMiddlewares in production', () => {
    const c = mockCompiler('production')
    new TanStackDevtoolsRspackPlugin().apply(c as any)
    expect(c.options.devServer.setupMiddlewares).toBeUndefined()
  })

  it('records the dev-server origin from options.devServer.port', () => {
    const c = mockCompiler('development')
    c.options.devServer.port = 3100
    new TanStackDevtoolsRspackPlugin().apply(c as any)
    expect(getDevServerOrigin()?.port).toBe(3100)
  })
})

describe('TanStackDevtoolsRspackPlugin event wiring under preset non-development NODE_ENV', () => {
  // Regression for the silent marketplace/event-bus disablement that occurred
  // because the plugin gated its dev features on `compiler.options.mode` while
  // the event client and `ServerEventBus` were gated on `process.env.NODE_ENV`.
  // Under vitest `NODE_ENV === 'test'`, the root `@tanstack/devtools-client`
  // export resolves to the no-op `EventClient`, so a plugin wired to the no-op
  // would never register a real listener. The plugin must use the always-real
  // client so its handlers are live whenever the compiler is in development mode.
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    globalThis.__TANSTACK_EVENT_TARGET__ = new EventTarget()
  })

  afterEach(() => {
    globalThis.__TANSTACK_EVENT_TARGET__ = null
    process.env.NODE_ENV = originalNodeEnv
  })

  it('registers real event listeners on the shared event target when mode is development and NODE_ENV is not development', () => {
    process.env.NODE_ENV = 'production'
    const target = globalThis.__TANSTACK_EVENT_TARGET__!
    const addSpy = vi.spyOn(target, 'addEventListener')

    const c = mockCompiler('development')
    new TanStackDevtoolsRspackPlugin().apply(c as any)

    // The no-op client's `on()` returns a cleanup but never calls
    // `addEventListener`; the real client registers a listener for every
    // event name the plugin wires. If the plugin were wired to the no-op
    // (the bug), none of these names would appear.
    expect(addSpy).toHaveBeenCalledWith(
      'tanstack-devtools-core:mounted',
      expect.any(Function),
    )
    expect(addSpy).toHaveBeenCalledWith(
      'tanstack-devtools-core:install-devtools',
      expect.any(Function),
    )
    expect(addSpy).toHaveBeenCalledWith(
      'tanstack-devtools-core:add-plugin-to-devtools',
      expect.any(Function),
    )
    expect(addSpy).toHaveBeenCalledWith(
      'tanstack-devtools-core:bump-package-version',
      expect.any(Function),
    )

    addSpy.mockRestore()
  })

  it('fires the mounted handler (and emits package-json-read) when the client mounts, even with NODE_ENV unset', async () => {
    // NODE_ENV unset is the other preset-non-development scenario from the bug
    // report (programmatic @rspack/core usage / docker images without a value).
    delete (process.env as any).NODE_ENV
    const target = globalThis.__TANSTACK_EVENT_TARGET__!

    // Mock `emit` so the singleton does not start its connect-loop `setInterval`
    // (which would otherwise leak across tests); we only assert the handler ran.
    const emitSpy = vi
      .spyOn(devtoolsEventClient, 'emit')
      .mockImplementation(() => {})

    const c = mockCompiler('development')
    new TanStackDevtoolsRspackPlugin().apply(c as any)

    // Simulate the browser-side devtools client announcing it has mounted, as
    // the ServerEventBus would forward it onto the shared event target.
    target.dispatchEvent(
      new CustomEvent('tanstack-devtools-core:mounted', {
        detail: { type: 'tanstack-devtools-core:mounted', payload: undefined },
      }),
    )

    // The mounted handler awaits `outdatedDeps` (a resolved promise primed in
    // wirePackageManager) then emits. Flush the microtask queue.
    await Promise.resolve()
    await Promise.resolve()

    expect(emitSpy).toHaveBeenCalledWith('package-json-read', {
      packageJson: null,
    })
    expect(emitSpy).toHaveBeenCalledWith('outdated-deps-read', {
      outdatedDeps: null,
    })

    emitSpy.mockRestore()
  })

  it('does not wire package-manager events when mode is production', () => {
    process.env.NODE_ENV = 'production'
    const target = globalThis.__TANSTACK_EVENT_TARGET__!
    const addSpy = vi.spyOn(target, 'addEventListener')

    const c = mockCompiler('production')
    new TanStackDevtoolsRspackPlugin().apply(c as any)

    expect(addSpy).not.toHaveBeenCalledWith(
      'tanstack-devtools-core:mounted',
      expect.any(Function),
    )
    addSpy.mockRestore()
  })
})
