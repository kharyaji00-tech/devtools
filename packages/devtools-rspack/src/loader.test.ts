import { beforeEach, describe, expect, it } from 'vitest'
import { setDevtoolsConnection } from '@tanstack/devtools-bundler-core'
import tanstackDevtoolsLoader, { runPipeline } from './loader'

const dev = (over = {}) => ({
  mode: 'development' as const,
  config: {
    injectSource: { enabled: true },
    enhancedLogs: { enabled: true },
    consolePiping: { enabled: true },
    removeDevtoolsOnBuild: true,
  },
  connection: { port: 4206, host: 'localhost', protocol: 'http' as const },
  target: 'web',
  ...over,
})

describe('runPipeline', () => {
  it('injects data-tsd-source into JSX in dev', () => {
    const out = runPipeline(
      'const A = () => <div>hi</div>',
      '/proj/src/a.tsx',
      dev(),
    )
    expect(out).toContain('data-tsd-source')
  })

  it('enhances console.* calls in dev', () => {
    const out = runPipeline('console.log("x")', '/proj/src/b.ts', dev())
    expect(out).not.toBe('console.log("x")') // enhanced with source location
  })

  it('replaces connection placeholders', () => {
    const code =
      'const p = __TANSTACK_DEVTOOLS_PORT__; const h = __TANSTACK_DEVTOOLS_HOST__'
    const out = runPipeline(
      code,
      '/proj/node_modules/@tanstack/devtools/x.js',
      dev({ connection: { port: 9000, host: 'localhost', protocol: 'http' } }),
    )
    expect(out).toContain('9000')
    expect(out).toContain('"localhost"')
  })

  it('strips devtools code in production builds', () => {
    const code =
      'import { TanStackDevtools } from "@tanstack/react-devtools"\nconst App = () => <TanStackDevtools />'
    const out = runPipeline(code, '/proj/src/main.tsx', {
      ...dev(),
      mode: 'production',
    })
    expect(out).not.toContain('TanStackDevtools')
    expect(out).not.toContain('@tanstack/react-devtools')
  })

  it('leaves node_modules untouched for source injection', () => {
    const code = 'const A = () => <div>hi</div>'
    const out = runPipeline(code, '/proj/node_modules/pkg/a.tsx', dev())
    expect(out).not.toContain('data-tsd-source')
  })

  // Port-routing regression tests: the `/__tsd/*` endpoints are mounted on the
  // DEV SERVER, so enhanced-log / console-pipe URLs must target the dev-server
  // origin, while the `__TANSTACK_DEVTOOLS_*` placeholders must use the
  // event-bus connection. These must fail if the two ports were ever crossed.
  it('enhanced-log URL uses the dev-server port, not the event-bus port', () => {
    const out = runPipeline(
      'console.log("x")',
      '/proj/src/b.ts',
      dev({
        devServer: { port: 8080, host: 'localhost', protocol: 'http' },
        connection: { port: 4206, host: 'localhost', protocol: 'http' },
      }),
    )
    expect(out).toContain('localhost:8080')
    expect(out).not.toContain('localhost:4206')
  })

  it('console-pipe SSR target uses the dev-server origin, not the event bus', () => {
    const out = runPipeline(
      'createRoot(document.getElementById("root"))',
      '/proj/src/main.tsx',
      dev({
        devServer: { port: 8080, host: 'localhost', protocol: 'http' },
        connection: { port: 4206, host: 'localhost', protocol: 'http' },
      }),
    )
    expect(out).toContain('localhost:8080')
    expect(out).not.toContain(':4206')
  })

  it('connection placeholders use the event-bus connection, not the dev-server origin', () => {
    const out = runPipeline(
      'const p = __TANSTACK_DEVTOOLS_PORT__',
      '/proj/node_modules/@tanstack/devtools/x.js',
      dev({
        devServer: { port: 8080, host: 'localhost', protocol: 'http' },
        connection: { port: 4206, host: 'localhost', protocol: 'http' },
      }),
    )
    expect(out).toContain('4206')
    expect(out).not.toContain('8080')
  })
})

// Source used to exercise the loader entry — the rspack `mode` fallback lives
// here (not in runPipeline).
const DEVTOOLS_JSX =
  'import { TanStackDevtools } from "@tanstack/react-devtools"\nconst App = () => <TanStackDevtools />'

/**
 * Build a fake rspack loader context. By default neither `this.mode` nor
 * `compiler.options.mode` is set, reproducing the production-defaulted build
 * (rspack JS-API with no `mode` in the config) that triggered the bug — rspack
 * leaves both `undefined` while still applying production-like optimization.
 */
function loaderCtx(
  over: {
    mode?: string
    compilerMode?: string
  } = {},
): any {
  const ctx: any = {
    getOptions: () => ({}),
    _compiler: {
      options: {
        mode: over.compilerMode,
        target: 'web',
        module: { rules: [] },
        devServer: {},
      },
    },
    resourcePath: '/proj/src/app.tsx',
  }
  // Only set `this.mode` when explicitly provided; rspack leaves it `undefined`
  // on production-defaulted builds.
  if (over.mode !== undefined) ctx.mode = over.mode
  return ctx
}

describe('tanstackDevtoolsLoader (rspack mode resolution)', () => {
  // Reset the shared connection so the loader entry reads a deterministic
  // event-bus origin regardless of test ordering.
  beforeEach(() => {
    setDevtoolsConnection({ port: 4206, host: 'localhost', protocol: 'http' })
  })

  it('treats an unset loader AND compiler mode as production (regression: rspack omits mode)', () => {
    const ctx = loaderCtx({ compilerMode: undefined }) // no mode anywhere
    const out = tanstackDevtoolsLoader.call(ctx, DEVTOOLS_JSX)
    // Dev-only instrumentation must NOT be injected into a production build
    // (step 1, the source-attr transform, is gated on `isDev`).
    expect(out).not.toContain('data-tsd-source')
    // Devtools MUST be stripped (step 7 runs only under `mode === 'production'`).
    expect(out).not.toContain('TanStackDevtools')
    expect(out).not.toContain('@tanstack/react-devtools')
  })

  it('prefers the loader-context mode over the compiler option (development wins)', () => {
    const ctx = loaderCtx({ mode: 'development', compilerMode: 'production' })
    const out = tanstackDevtoolsLoader.call(ctx, DEVTOOLS_JSX)
    expect(out).toContain('data-tsd-source')
  })

  it('falls back to compiler.options.mode when loader-context mode is unset', () => {
    const ctx = loaderCtx({ mode: undefined, compilerMode: 'development' })
    const out = tanstackDevtoolsLoader.call(ctx, DEVTOOLS_JSX)
    expect(out).toContain('data-tsd-source')
  })

  it('prefers the loader-context mode over the compiler option (production wins)', () => {
    const ctx = loaderCtx({ mode: 'production', compilerMode: 'development' })
    const out = tanstackDevtoolsLoader.call(ctx, DEVTOOLS_JSX)
    expect(out).not.toContain('data-tsd-source')
    expect(out).not.toContain('TanStackDevtools')
  })
})
