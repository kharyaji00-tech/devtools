import { describe, expect, it } from 'vitest'
import { runPipeline } from './loader'

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

  // Regression coverage for the module ids the old id gate rejected. The
  // `__TANSTACK_DEVTOOLS_*` placeholders are baked into the published event-bus
  // client dist and appear nowhere else in user code, so their presence is the
  // ownership check. An id gate (`posixId.includes('@tanstack/...')`) silently
  // skipped these ids, leaving the placeholders unreplaced. The Windows case
  // also confirms no `\` -> `/` normalization (the removed `posixId`) is needed.
  it.each([
    ['a bundled shared chunk id', '/proj/node_modules/.cache/chunk-ABCD123.js'],
    [
      'a pnpm/yarn workspace realpath id',
      '/home/user/devtools/packages/event-bus/dist/esm/client/client.js',
    ],
    [
      'a Windows-style resourcePath with backslashes',
      'C:\\proj\\packages\\event-bus\\dist\\esm\\client\\client.js',
    ],
  ])('replaces placeholders for %s (no id gate)', (_label, id) => {
    const code =
      'function getDefaultPort(c){if(typeof __TANSTACK_DEVTOOLS_PORT__!=="undefined")return __TANSTACK_DEVTOOLS_PORT__;return c}'
    const out = runPipeline(
      code,
      id,
      dev({ connection: { port: 7777, host: 'bus.local', protocol: 'https' } }),
    )
    expect(out).not.toContain('__TANSTACK_DEVTOOLS_PORT__')
    expect(out).toContain('7777')
  })

  it('leaves code without placeholders untouched by the replacement step', () => {
    const out = runPipeline(
      'const p = 4206',
      '/proj/node_modules/some-other-pkg/index.js',
      dev(),
    )
    // No placeholders -> replacement step is a no-op; value is untouched.
    expect(out).toContain('4206')
  })
})
