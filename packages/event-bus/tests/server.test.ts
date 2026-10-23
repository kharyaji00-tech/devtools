import http from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { ServerEventBus } from '../src/server/server'

// Clear globalThis between tests to avoid cross-test contamination
function clearGlobals() {
  globalThis.__TANSTACK_DEVTOOLS_SERVER__ = null
  globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__ = null
  globalThis.__TANSTACK_EVENT_TARGET__ = null
}

// Create a listening HTTP server on an OS-assigned port
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, 'localhost', () => {
      server.removeListener('error', reject)
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })
}

function closeServer(server: http.Server): Promise<void> {
  // Idempotent: closing an already-closed server emits an 'error' event and
  // invokes the callback with an error, so swallow both.
  return new Promise((resolve) => {
    const done = () => resolve()
    server.once('error', done)
    try {
      server.close(done)
    } catch {
      done()
    }
  })
}

// GET an SSE endpoint and read the status + content-type
function getSSE(
  url: string,
  timeoutMs = 3000,
): Promise<{ status?: number; contentType?: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.destroy()
      resolve({
        status: res.statusCode,
        contentType: res.headers['content-type'],
      })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`GET ${url} timed out`))
    })
  })
}

// Open a WebSocket client connection; resolves true on 'open', false otherwise
function openWS(url: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    const timer = setTimeout(() => {
      ws.terminate()
      resolve(false)
    }, timeoutMs)
    ws.on('open', () => {
      clearTimeout(timer)
      ws.close()
      resolve(true)
    })
    ws.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    ws.on('unexpected-response', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

describe('ServerEventBus', () => {
  let bus: ServerEventBus | undefined
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    clearGlobals()
    process.env.NODE_ENV = 'development'
  })

  afterEach(async () => {
    bus?.stop()
    clearGlobals()
    process.env.NODE_ENV = originalNodeEnv
    // Small delay to let servers fully close
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  describe('constructor', () => {
    it('should initialize with default config', () => {
      bus = new ServerEventBus()
      expect(bus.port).toBe(4206)
    })

    it('should accept custom port', () => {
      bus = new ServerEventBus({ port: 9999 })
      expect(bus.port).toBe(9999)
    })

    it('should log when debug is enabled', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      bus = new ServerEventBus({ debug: true })
      expect(logSpy).toHaveBeenCalledWith(
        '🌴 [tanstack-devtools:server-bus] ',
        'Initializing server event bus',
      )
      logSpy.mockRestore()
    })

    it('should not log when debug is disabled', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      bus = new ServerEventBus({ debug: false })
      expect(logSpy).not.toHaveBeenCalled()
      logSpy.mockRestore()
    })
  })

  describe('start() - standalone mode', () => {
    it('should start and resolve with a port', async () => {
      bus = new ServerEventBus({ port: 0 }) // port 0 = OS-assigned
      const port = await bus.start()
      expect(port).toBeGreaterThan(0)
      expect(bus.port).toBe(port)
    })

    it('should create its own HTTP server in standalone mode', async () => {
      bus = new ServerEventBus({ port: 0 })
      await bus.start()
      expect(globalThis.__TANSTACK_DEVTOOLS_SERVER__).not.toBeNull()
    })

    it('should create a WebSocket server in standalone mode', async () => {
      bus = new ServerEventBus({ port: 0 })
      await bus.start()
      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).not.toBeNull()
    })

    it('should resolve immediately in non-development environment', async () => {
      process.env.NODE_ENV = 'production'
      bus = new ServerEventBus({ port: 5555 })
      const port = await bus.start()
      expect(port).toBe(5555)
      // No server should be created
      expect(globalThis.__TANSTACK_DEVTOOLS_SERVER__).toBeNull()
    })

    it('should resolve immediately if server is already running (HMR guard)', async () => {
      bus = new ServerEventBus({ port: 0 })
      await bus.start()
      // Create a new bus that picks up globalThis servers
      const bus2 = new ServerEventBus({ port: 0 })
      const port2 = await bus2.start()
      // Should resolve with the port without creating new server
      expect(port2).toBeGreaterThanOrEqual(0)
    })

    it('should handle EADDRINUSE by falling back to OS-assigned port', async () => {
      // Occupy a port on localhost first
      const blocker = http.createServer()
      const blockerPort = await new Promise<number>((resolve) => {
        blocker.listen(0, 'localhost', () => {
          const addr = blocker.address()
          if (typeof addr === 'object' && addr) resolve(addr.port)
        })
      })

      try {
        // Ensure globals are clean so the bus creates a fresh server
        clearGlobals()
        bus = new ServerEventBus({ port: blockerPort, host: 'localhost' })
        const port = await bus.start()
        // Should get a different port since the preferred one was in use
        expect(port).toBeGreaterThan(0)
        // The port should be different from the blocked port since EADDRINUSE triggers fallback
        expect(port).not.toBe(blockerPort)
      } finally {
        blocker.close()
      }
    })

    it('should pass host to server.listen', async () => {
      bus = new ServerEventBus({ port: 0, host: '127.0.0.1' })
      const port = await bus.start()
      expect(port).toBeGreaterThan(0)
    })
  })

  describe('start() - external httpServer mode', () => {
    let externalServer: http.Server

    beforeEach(async () => {
      externalServer = http.createServer()
      await new Promise<void>((resolve) => {
        externalServer.listen(0, () => resolve())
      })
    })

    afterEach(() => {
      externalServer.close()
    })

    it('should not create a standalone server when httpServer is provided', async () => {
      bus = new ServerEventBus({ httpServer: externalServer })
      await bus.start()
      // Should NOT have created its own server in globalThis
      expect(globalThis.__TANSTACK_DEVTOOLS_SERVER__).toBeNull()
    })

    it('should create a WebSocket server when httpServer is provided', async () => {
      bus = new ServerEventBus({ httpServer: externalServer })
      await bus.start()
      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).not.toBeNull()
    })

    it('should resolve port from external server address', async () => {
      bus = new ServerEventBus({ httpServer: externalServer })
      const port = await bus.start()
      const addr = externalServer.address()
      const expectedPort = typeof addr === 'object' && addr ? addr.port : 0
      expect(port).toBe(expectedPort)
    })

    it('should handle SSE requests on external server', async () => {
      bus = new ServerEventBus({ httpServer: externalServer })
      const port = await bus.start()

      // Make an SSE request
      const response = await new Promise<http.IncomingMessage>((resolve) => {
        http.get(`http://localhost:${port}/__devtools/sse`, (res) => {
          resolve(res)
        })
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toBe('text/event-stream')
      response.destroy()
    })

    it('should handle POST requests on external server', async () => {
      bus = new ServerEventBus({ httpServer: externalServer })
      const port = await bus.start()

      const response = await new Promise<http.IncomingMessage>((resolve) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port,
            path: '/__devtools/send',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => resolve(res),
        )
        req.write(
          JSON.stringify({ type: 'test-event', payload: { foo: 'bar' } }),
        )
        req.end()
      })

      expect(response.statusCode).toBe(200)
    })

    it('should remove listeners from external server on stop() without closing it', async () => {
      bus = new ServerEventBus({ httpServer: externalServer })
      await bus.start()

      const listenerCountBefore = externalServer.listenerCount('request')
      expect(listenerCountBefore).toBeGreaterThan(0)

      bus.stop()

      // Wait a tick for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50))

      // The external server should still be listening
      const addr = externalServer.address()
      expect(addr).not.toBeNull()

      // Our request listener should be removed
      const listenerCountAfter = externalServer.listenerCount('request')
      expect(listenerCountAfter).toBeLessThan(listenerCountBefore)
    })
  })

  describe('start() - external httpServer restart (stale global guard)', () => {
    // Cleanup registry so each test can use `const` locals (no nullable
    // top-level vars) while still guaranteeing teardown after the test.
    const cleanups: Array<() => Promise<void> | void> = []

    afterEach(async () => {
      while (cleanups.length) {
        const cleanup = cleanups.pop()
        if (cleanup) {
          try {
            await cleanup()
          } catch {
            // cleanup errors (e.g. closing an already-closed server) are fine
          }
        }
      }
      clearGlobals()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    function registerServer(server: http.Server) {
      cleanups.push(() => closeServer(server))
    }
    function registerBus(bus: ServerEventBus) {
      cleanups.push(() => bus.stop())
    }

    it('re-attaches request handlers to a new external server even with stale globals (no stop on old bus)', async () => {
      // First external server + bus (external mode)
      const serverA = http.createServer()
      registerServer(serverA)
      await listen(serverA)
      const bus1 = new ServerEventBus({ port: 4206, httpServer: serverA })
      registerBus(bus1)
      await bus1.start()

      // Simulate an in-process Vite restart: close serverA WITHOUT stopping
      // bus1, so the process-wide WSS global remains set (production code path
      // before the fix never cleared globals between restarts).
      await closeServer(serverA)
      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).not.toBeNull()

      // New external server + fresh bus adopts the stale global
      const serverB = http.createServer()
      registerServer(serverB)
      const portB = await listen(serverB)
      const bus2 = new ServerEventBus({ port: 4206, httpServer: serverB })
      registerBus(bus2)
      const resolvedPort = await bus2.start()

      // External mode must NOT short-circuit: it resolves the actual new
      // server port and attaches the SSE handler to it.
      expect(resolvedPort).toBe(portB)
      const res = await getSSE(`http://localhost:${portB}/__devtools/sse`)
      expect(res.status).toBe(200)
      expect(res.contentType).toBe('text/event-stream')
    })

    it('re-attaches WebSocket upgrade handler to a new external server even with stale globals', async () => {
      const serverA = http.createServer()
      registerServer(serverA)
      await listen(serverA)
      const bus1 = new ServerEventBus({ port: 4206, httpServer: serverA })
      registerBus(bus1)
      await bus1.start()

      await closeServer(serverA)
      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).not.toBeNull()

      const serverB = http.createServer()
      registerServer(serverB)
      const portB = await listen(serverB)
      const bus2 = new ServerEventBus({ port: 4206, httpServer: serverB })
      registerBus(bus2)
      await bus2.start()

      // A WebSocket client must be able to open a connection against the
      // new server's /__devtools/ws endpoint.
      const opened = await openWS(`ws://localhost:${portB}/__devtools/ws`)
      expect(opened).toBe(true)
    })

    it('end-to-end restart with stop(): cleanly re-attaches to the restarted server', async () => {
      // Mirrors the Vite plugin lifecycle: bus1 piggybacks on the HTTPS server,
      // the http server 'close' hook calls bus.stop() (clears globals), then
      // configureServer re-runs and creates bus2 on a new server.
      const serverA = http.createServer()
      registerServer(serverA)
      const portA = await listen(serverA)
      const bus1 = new ServerEventBus({ port: 4206, httpServer: serverA })
      registerBus(bus1)
      expect(await bus1.start()).toBe(portA)
      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).not.toBeNull()

      // Verify the first bus serves endpoints before restart
      const sseBefore = await getSSE(`http://localhost:${portA}/__devtools/sse`)
      expect(sseBefore.contentType).toBe('text/event-stream')

      // Simulate the close hook that the Vite plugin now registers
      await closeServer(serverA)
      bus1.stop()
      // stop() must clear the stale globals so the restart starts clean
      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).toBeNull()
      expect(globalThis.__TANSTACK_DEVTOOLS_SERVER__).toBeNull()

      const serverB = http.createServer()
      registerServer(serverB)
      const portB = await listen(serverB)
      const bus2 = new ServerEventBus({ port: 4206, httpServer: serverB })
      registerBus(bus2)
      expect(await bus2.start()).toBe(portB)

      // The restarted bus serves both SSE and WS on the new server
      const sseAfter = await getSSE(`http://localhost:${portB}/__devtools/sse`)
      expect(sseAfter.status).toBe(200)
      expect(sseAfter.contentType).toBe('text/event-stream')
      const opened = await openWS(`ws://localhost:${portB}/__devtools/ws`)
      expect(opened).toBe(true)

      // And the old (closed) server no longer accepts devtools connections
      let oldStatus: number | undefined
      try {
        oldStatus = (await getSSE(`http://localhost:${portA}/__devtools/sse`))
          .status
      } catch {
        // Connection refused/timeout is also "no longer accepts"
        oldStatus = undefined
      }
      expect(oldStatus).not.toBe(200)
    })
  })

  describe('stop()', () => {
    it('should close standalone server on stop', async () => {
      bus = new ServerEventBus({ port: 0 })
      await bus.start()
      expect(globalThis.__TANSTACK_DEVTOOLS_SERVER__).not.toBeNull()

      bus.stop()
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    it('clears the process-wide server globals on stop (standalone mode)', async () => {
      bus = new ServerEventBus({ port: 0 })
      await bus.start()
      expect(globalThis.__TANSTACK_DEVTOOLS_SERVER__).not.toBeNull()
      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).not.toBeNull()

      bus.stop()
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(globalThis.__TANSTACK_DEVTOOLS_SERVER__).toBeNull()
      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).toBeNull()
    })

    it('clears the process-wide WSS global on stop (external server mode)', async () => {
      const externalServer = http.createServer()
      await listen(externalServer)
      bus = new ServerEventBus({ httpServer: externalServer })
      await bus.start()
      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).not.toBeNull()

      bus.stop()
      await closeServer(externalServer)
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__).toBeNull()
      // The standalone server global was never set in external mode
      expect(globalThis.__TANSTACK_DEVTOOLS_SERVER__).toBeNull()
    })

    it('should clear all connections on stop', async () => {
      bus = new ServerEventBus({ port: 0 })
      await bus.start()

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      bus = new ServerEventBus({ port: 0, debug: true })
      await bus.start()
      bus.stop()

      expect(logSpy).toHaveBeenCalledWith(
        '🌴 [tanstack-devtools:server-bus] ',
        'Clearing all connections',
      )
      logSpy.mockRestore()
    })
  })
})
