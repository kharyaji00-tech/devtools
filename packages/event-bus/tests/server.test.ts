import http from 'node:http'
import { WebSocket } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerEventBus } from '../src/server/server'

// Clear globalThis between tests to avoid cross-test contamination
function clearGlobals() {
  globalThis.__TANSTACK_DEVTOOLS_SERVER__ = null
  globalThis.__TANSTACK_DEVTOOLS_WSS_SERVER__ = null
  globalThis.__TANSTACK_EVENT_TARGET__ = null
}

describe('ServerEventBus', () => {
  let bus: ServerEventBus
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

  describe('WebSocket message handling - malformed frames', () => {
    function connectWs(port: number): Promise<WebSocket> {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/__devtools/ws`)
        ws.on('open', () => resolve(ws))
        ws.on('error', reject)
      })
    }

    // Marker-shaped object with a non-numeric value used to crash the host
    // process via BigInt(value.value) throwing inside the unguarded ws handler.
    const badBigIntMarker = JSON.stringify({
      __type: 'bigint',
      value: 'abc',
    })

    it('should not crash when receiving a non-numeric BigInt marker frame', async () => {
      bus = new ServerEventBus({ port: 0, host: '127.0.0.1', debug: true })
      const port = await bus.start()

      const ws = await connectWs(port)
      try {
        // Send the malformed payload that previously crashed the process.
        await new Promise<void>((resolve) => {
          ws.send(badBigIntMarker, () => resolve())
        })
        // Allow the server time to (attempt to) process the frame.
        await new Promise((resolve) => setTimeout(resolve, 100))

        // The server must still be alive: a subsequent valid event should be
        // dispatched to registered listeners on the global event target.
        const handler = vi.fn()
        globalThis.__TANSTACK_EVENT_TARGET__?.addEventListener(
          'valid:after-bad',
          handler,
        )
        const validEvent = JSON.stringify({
          type: 'valid:after-bad',
          payload: { ok: true },
        })
        await new Promise<void>((resolve) => {
          ws.send(validEvent, () => resolve())
        })
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(handler).toHaveBeenCalledTimes(1)
        globalThis.__TANSTACK_EVENT_TARGET__?.removeEventListener(
          'valid:after-bad',
          handler,
        )
      } finally {
        ws.close()
      }
    })

    it('should not crash when receiving plain invalid JSON over WebSocket', async () => {
      bus = new ServerEventBus({ port: 0, host: '127.0.0.1' })
      const port = await bus.start()

      const ws = await connectWs(port)
      try {
        await new Promise<void>((resolve) => {
          ws.send('not json', () => resolve())
        })
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Server still alive: send a valid event and confirm dispatch.
        const handler = vi.fn()
        globalThis.__TANSTACK_EVENT_TARGET__?.addEventListener(
          'valid:after-invalid',
          handler,
        )
        await new Promise<void>((resolve) => {
          ws.send(
            JSON.stringify({ type: 'valid:after-invalid', payload: {} }),
            () => resolve(),
          )
        })
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(handler).toHaveBeenCalledTimes(1)
        globalThis.__TANSTACK_EVENT_TARGET__?.removeEventListener(
          'valid:after-invalid',
          handler,
        )
      } finally {
        ws.close()
      }
    })

    it('should still dispatch valid BigInt marker frames as BigInts over WebSocket', async () => {
      bus = new ServerEventBus({ port: 0, host: '127.0.0.1' })
      const port = await bus.start()

      const ws = await connectWs(port)
      try {
        const handler = vi.fn()
        globalThis.__TANSTACK_EVENT_TARGET__?.addEventListener(
          'bigint:event',
          (e: Event) => {
            handler((e as CustomEvent).detail)
          },
        )
        await new Promise<void>((resolve) => {
          ws.send(
            JSON.stringify({
              type: 'bigint:event',
              payload: { id: { __type: 'bigint', value: '123' } },
            }),
            () => resolve(),
          )
        })
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(handler).toHaveBeenCalledTimes(1)
        const detail = handler.mock.calls[0]![0]
        expect(detail.payload.id).toBe(BigInt(123))
        globalThis.__TANSTACK_EVENT_TARGET__?.removeEventListener(
          'bigint:event',
          handler,
        )
      } finally {
        ws.close()
      }
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

  describe('stop()', () => {
    it('should close standalone server on stop', async () => {
      bus = new ServerEventBus({ port: 0 })
      await bus.start()
      expect(globalThis.__TANSTACK_DEVTOOLS_SERVER__).not.toBeNull()

      bus.stop()
      await new Promise((resolve) => setTimeout(resolve, 100))
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
