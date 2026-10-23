import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientEventBus } from '../src/client/client'

// Stub BroadcastChannel since it's not available in the test environment.
// Unlike a naive inert stub, this one models the real spec behavior that the
// bug hinges on: a message posted on one channel is delivered to every OTHER
// same-name channel in the document. That delivery is what lets a stale,
// un-closed channel keep re-dispatching events after an unmount, so tests can
// actually observe the duplicate the fix prevents.
const broadcastChannelInstances = new Map<string, Set<any>>()

vi.stubGlobal(
  'BroadcastChannel',
  class MockBroadcastChannel {
    name: string
    onmessage: ((e: { data: any }) => void) | null = null
    closed = false
    postMessage = (data: any) => {
      const peers = broadcastChannelInstances.get(this.name)
      if (!peers) {
        return
      }
      for (const peer of peers) {
        if (peer === this || peer.closed) {
          continue
        }
        const handler = peer.onmessage
        if (typeof handler === 'function') {
          handler({ data })
        }
      }
    }
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    close = () => {
      this.closed = true
      this.onmessage = null
      broadcastChannelInstances.get(this.name)?.delete(this)
    }
    constructor(name: string) {
      this.name = name
      if (!broadcastChannelInstances.has(name)) {
        broadcastChannelInstances.set(name, new Set())
      }
      broadcastChannelInstances.get(name)!.add(this)
    }
  },
)

// Track WebSocket and EventSource constructor calls
const mockWebSocketInstances: Array<any> = []
const mockEventSourceInstances: Array<any> = []

function createMockWebSocketClass() {
  const cls = class MockWebSocket {
    static OPEN = 1
    static CLOSED = 3
    url: string
    readyState = 1
    onmessage: any = null
    onclose: any = null
    onerror: any = null
    send = vi.fn()
    close = vi.fn()
    constructor(url: string) {
      this.url = url
      mockWebSocketInstances.push(this)
    }
  }
  return cls
}

function createMockEventSourceClass() {
  return class MockEventSource {
    url: string
    onmessage: any = null
    close = vi.fn()
    constructor(url: string) {
      this.url = url
      mockEventSourceInstances.push(this)
    }
  }
}

function createConnectingWebSocketClass() {
  // Starts in CONNECTING state; tests flip readyState and fire onopen manually.
  return class ConnectingWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 3
    url: string
    readyState = 0 // CONNECTING
    onopen: any = null
    onmessage: any = null
    onclose: any = null
    onerror: any = null
    send = vi.fn()
    close = vi.fn()
    constructor(url: string) {
      this.url = url
      mockWebSocketInstances.push(this)
    }
  }
}

function createThrowingWebSocketClass() {
  return class ThrowingWebSocket {
    static OPEN = 1
    static CLOSED = 3
    constructor() {
      throw new Error('WS not available')
    }
  }
}

describe('ClientEventBus', () => {
  beforeEach(() => {
    mockWebSocketInstances.length = 0
    mockEventSourceInstances.length = 0
    broadcastChannelInstances.clear()
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    vi.stubGlobal('EventSource', createMockEventSourceClass())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor defaults', () => {
    it('should initialize with default values', () => {
      const bus = new ClientEventBus()
      bus.start()
      // Default does not connect to server bus, so no WS/SSE created
      expect(mockWebSocketInstances.length).toBe(0)
      expect(mockEventSourceInstances.length).toBe(0)
      bus.stop()
    })

    it('should prefer explicit config over bundler-injected defaults', () => {
      Object.assign(globalThis, {
        __TANSTACK_DEVTOOLS_PORT__: 4206,
        __TANSTACK_DEVTOOLS_HOST__: 'localhost',
        __TANSTACK_DEVTOOLS_PROTOCOL__: 'http',
      })

      let bus: ClientEventBus | undefined
      try {
        bus = new ClientEventBus({
          connectToServerBus: true,
          port: 443,
          host: 'devtools.example.com',
          protocol: 'https',
        })
        bus.start()

        expect(mockWebSocketInstances[0].url).toBe(
          'wss://devtools.example.com:443/__devtools/ws',
        )
      } finally {
        bus?.stop()
        Reflect.deleteProperty(globalThis, '__TANSTACK_DEVTOOLS_PORT__')
        Reflect.deleteProperty(globalThis, '__TANSTACK_DEVTOOLS_HOST__')
        Reflect.deleteProperty(globalThis, '__TANSTACK_DEVTOOLS_PROTOCOL__')
      }
    })
  })

  describe('connectWebSocket with protocol', () => {
    it('should use ws:// when protocol is http (default)', () => {
      const bus = new ClientEventBus({
        connectToServerBus: true,
        port: 4206,
        host: 'localhost',
        protocol: 'http',
      })
      bus.start()

      expect(mockWebSocketInstances.length).toBe(1)
      expect(mockWebSocketInstances[0].url).toBe(
        'ws://localhost:4206/__devtools/ws',
      )
      bus.stop()
    })

    it('should use wss:// when protocol is https', () => {
      const bus = new ClientEventBus({
        connectToServerBus: true,
        port: 4206,
        host: 'localhost',
        protocol: 'https',
      })
      bus.start()

      expect(mockWebSocketInstances.length).toBe(1)
      expect(mockWebSocketInstances[0].url).toBe(
        'wss://localhost:4206/__devtools/ws',
      )
      bus.stop()
    })

    it('should use custom host in WebSocket URL', () => {
      const bus = new ClientEventBus({
        connectToServerBus: true,
        port: 9999,
        host: 'myhost.local',
        protocol: 'http',
      })
      bus.start()

      expect(mockWebSocketInstances[0].url).toBe(
        'ws://myhost.local:9999/__devtools/ws',
      )
      bus.stop()
    })

    it('should use custom host and https in WebSocket URL', () => {
      const bus = new ClientEventBus({
        connectToServerBus: true,
        port: 443,
        host: 'secure.example.com',
        protocol: 'https',
      })
      bus.start()

      expect(mockWebSocketInstances[0].url).toBe(
        'wss://secure.example.com:443/__devtools/ws',
      )
      bus.stop()
    })
  })

  describe('connectSSE with protocol', () => {
    it('should use http:// when protocol is http', () => {
      // Make WebSocket constructor throw to force SSE fallback
      vi.stubGlobal('WebSocket', createThrowingWebSocketClass())

      const bus = new ClientEventBus({
        connectToServerBus: true,
        port: 4206,
        host: 'localhost',
        protocol: 'http',
      })
      bus.start()

      expect(mockEventSourceInstances.length).toBe(1)
      expect(mockEventSourceInstances[0].url).toBe(
        'http://localhost:4206/__devtools/sse',
      )
      bus.stop()
    })

    it('should use https:// when protocol is https', () => {
      vi.stubGlobal('WebSocket', createThrowingWebSocketClass())

      const bus = new ClientEventBus({
        connectToServerBus: true,
        port: 4206,
        host: 'localhost',
        protocol: 'https',
      })
      bus.start()

      expect(mockEventSourceInstances.length).toBe(1)
      expect(mockEventSourceInstances[0].url).toBe(
        'https://localhost:4206/__devtools/sse',
      )
      bus.stop()
    })

    it('should use custom host in SSE URL', () => {
      vi.stubGlobal('WebSocket', createThrowingWebSocketClass())

      const bus = new ClientEventBus({
        connectToServerBus: true,
        port: 8080,
        host: 'dev.example.com',
        protocol: 'https',
      })
      bus.start()

      expect(mockEventSourceInstances[0].url).toBe(
        'https://dev.example.com:8080/__devtools/sse',
      )
      bus.stop()
    })
  })

  describe('emitToServer with protocol and host', () => {
    it('should use correct protocol and host in fetch URL when using SSE fallback', () => {
      // Make WebSocket constructor throw to force SSE fallback
      vi.stubGlobal('WebSocket', createThrowingWebSocketClass())

      const bus = new ClientEventBus({
        connectToServerBus: true,
        port: 9999,
        host: 'myhost',
        protocol: 'https',
      })
      bus.start()

      // Dispatch an event to trigger emitToServer
      window.dispatchEvent(
        new CustomEvent('tanstack-dispatch-event', {
          detail: {
            type: 'test-event',
            payload: { foo: 'bar' },
          },
        }),
      )

      expect(fetch).toHaveBeenCalledWith(
        'https://myhost:9999/__devtools/send',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      bus.stop()
    })

    it('should use http://localhost by default in fetch URL', () => {
      vi.stubGlobal('WebSocket', createThrowingWebSocketClass())

      const bus = new ClientEventBus({
        connectToServerBus: true,
      })
      bus.start()

      window.dispatchEvent(
        new CustomEvent('tanstack-dispatch-event', {
          detail: {
            type: 'test-event',
            payload: {},
          },
        }),
      )

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:4206/__devtools/send',
        expect.objectContaining({
          method: 'POST',
        }),
      )
      bus.stop()
    })
  })

  describe('emitToServer while WebSocket is connecting', () => {
    it('should queue events while connecting and flush them once the socket opens', () => {
      vi.stubGlobal('WebSocket', createConnectingWebSocketClass())

      const bus = new ClientEventBus({ connectToServerBus: true })
      bus.start()

      const socket = mockWebSocketInstances[0]
      expect(socket.readyState).toBe(0) // CONNECTING

      // Events emitted while connecting must not be sent yet...
      window.dispatchEvent(
        new CustomEvent('tanstack-dispatch-event', {
          detail: { type: 'queued:event', payload: { n: 1 } },
        }),
      )
      window.dispatchEvent(
        new CustomEvent('tanstack-dispatch-event', {
          detail: { type: 'queued:event', payload: { n: 2 } },
        }),
      )
      expect(socket.send).not.toHaveBeenCalled()

      // ...but flushed in order as soon as the connection opens.
      socket.readyState = 1 // OPEN
      socket.onopen?.()

      expect(socket.send).toHaveBeenCalledTimes(2)
      expect(socket.send.mock.calls[0][0]).toContain('"n":1')
      expect(socket.send.mock.calls[1][0]).toContain('"n":2')
      bus.stop()
    })

    it('should send immediately once the socket is open', () => {
      vi.stubGlobal('WebSocket', createConnectingWebSocketClass())

      const bus = new ClientEventBus({ connectToServerBus: true })
      bus.start()

      const socket = mockWebSocketInstances[0]
      socket.readyState = 1 // OPEN
      socket.onopen?.()

      window.dispatchEvent(
        new CustomEvent('tanstack-dispatch-event', {
          detail: { type: 'live:event', payload: {} },
        }),
      )

      expect(socket.send).toHaveBeenCalledTimes(1)
      bus.stop()
    })

    it('should drop queued events if the socket closes before opening', () => {
      vi.stubGlobal('WebSocket', createConnectingWebSocketClass())

      const bus = new ClientEventBus({ connectToServerBus: true })
      bus.start()

      const socket = mockWebSocketInstances[0]
      window.dispatchEvent(
        new CustomEvent('tanstack-dispatch-event', {
          detail: { type: 'queued:event', payload: {} },
        }),
      )

      // Connection fails before ever opening.
      socket.readyState = 3 // CLOSED
      socket.onclose?.()

      // Re-flushing (e.g. a late open) must not send the dropped events.
      socket.onopen?.()
      expect(socket.send).not.toHaveBeenCalled()
      bus.stop()
    })
  })

  describe('event dispatching', () => {
    it('should emit events to a subscribed listener', () => {
      const bus = new ClientEventBus()
      bus.start()
      const handler = vi.fn()
      window.addEventListener('test:event', handler)

      window.dispatchEvent(
        new CustomEvent('tanstack-dispatch-event', {
          detail: {
            type: 'test:event',
            payload: { foo: 'bar' },
          },
        }),
      )
      expect(handler).toHaveBeenCalled()
      window.removeEventListener('test:event', handler)
      bus.stop()
    })

    it('should emit events to global listeners', () => {
      const bus = new ClientEventBus()
      bus.start()
      const handler = vi.fn()
      window.addEventListener('tanstack-devtools-global', handler)

      window.dispatchEvent(
        new CustomEvent('tanstack-dispatch-event', {
          detail: {
            type: 'test:event',
            payload: { foo: 'bar' },
          },
        }),
      )
      expect(handler).toHaveBeenCalled()
      window.removeEventListener('tanstack-devtools-global', handler)
      bus.stop()
    })
  })

  describe('debug logging', () => {
    it('should log when debug is enabled', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const bus = new ClientEventBus({ debug: true })
      bus.start()

      expect(logSpy).toHaveBeenCalledWith(
        '🌴 [tanstack-devtools:client-bus]',
        'Initializing client event bus',
      )
      bus.stop()
    })

    it('should not log when debug is disabled', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const bus = new ClientEventBus({ debug: false })
      bus.start()

      expect(logSpy).not.toHaveBeenCalled()
      bus.stop()
    })
  })

  describe('stop()', () => {
    it('should clean up event listeners on stop', () => {
      const bus = new ClientEventBus()
      bus.start()

      const handler = vi.fn()
      window.addEventListener('test:cleanup', handler)

      bus.stop()

      // After stop, dispatching should not trigger the bus dispatcher
      // (but the direct listener on window still works)
      window.removeEventListener('test:cleanup', handler)
    })

    it('should close WebSocket on stop', () => {
      const bus = new ClientEventBus({ connectToServerBus: true })
      bus.start()

      expect(mockWebSocketInstances.length).toBe(1)
      bus.stop()

      expect(mockWebSocketInstances[0].close).toHaveBeenCalled()
    })

    it('should close EventSource on stop', () => {
      vi.stubGlobal('WebSocket', createThrowingWebSocketClass())

      const bus = new ClientEventBus({ connectToServerBus: true })
      bus.start()

      expect(mockEventSourceInstances.length).toBe(1)
      bus.stop()

      expect(mockEventSourceInstances[0].close).toHaveBeenCalled()
    })

    it('should close the BroadcastChannel and detach its onmessage handler', () => {
      const bus = new ClientEventBus()
      bus.start()

      const liveChannels = broadcastChannelInstances.get('tanstack-devtools')
      expect(liveChannels?.size).toBe(1)
      const channel = [...liveChannels!][0]

      // The constructor wires the relay handler that re-dispatches onto
      // window; it must be live while the bus is running.
      expect(channel.onmessage).not.toBeNull()

      bus.stop()

      // stop() must detach the relay handler and close the channel so it
      // stops receiving cross-channel messages and is removed from the
      // document (preventing an unbounded channel-per-mount leak).
      expect(channel.onmessage).toBeNull()
      expect(channel.closed).toBe(true)
      expect(
        broadcastChannelInstances.get('tanstack-devtools')?.size ?? 0,
      ).toBe(0)
    })

    it('should be safe to call stop() multiple times', () => {
      const bus = new ClientEventBus()
      bus.start()
      bus.stop()

      // A second stop() (e.g. a double unmount) must not throw now that the
      // broadcast channel field has been nulled.
      expect(() => bus.stop()).not.toThrow()
    })
  })

  describe('broadcast channel lifecycle (unmount -> remount)', () => {
    it('stop() prevents duplicate event delivery after an unmount->remount cycle', () => {
      // Simulates a devtools unmount -> remount: the stale bus is stopped
      // (its window listeners are removed), then a fresh bus is live.
      const stale = new ClientEventBus()
      stale.start()

      const fresh = new ClientEventBus()
      fresh.start()

      const specificHandler = vi.fn()
      const globalHandler = vi.fn()
      window.addEventListener('probe:once', specificHandler)
      window.addEventListener('tanstack-devtools-global', globalHandler)

      // "Unmount" the stale bus. Its dispatcher is removed, but without the
      // fix its BroadcastChannel stays open and keeps re-dispatching.
      stale.stop()

      // Emit an event purely through the fresh bus. The fresh bus posts to its
      // own channel; per the BroadcastChannel spec the message would also be
      // delivered to the stale bus's channel. With the fix that channel was
      // closed on stop, so only the fresh bus re-dispatches onto window.
      window.dispatchEvent(
        new CustomEvent('tanstack-dispatch-event', {
          detail: { type: 'probe:once', payload: { phase: 'after-stop' } },
        }),
      )

      expect(specificHandler).toHaveBeenCalledTimes(1)
      expect(globalHandler).toHaveBeenCalledTimes(1)
      // Only the fresh bus's channel survives unmount.
      expect(
        broadcastChannelInstances.get('tanstack-devtools')?.size ?? 0,
      ).toBe(1)

      window.removeEventListener('probe:once', specificHandler)
      window.removeEventListener('tanstack-devtools-global', globalHandler)
      fresh.stop()
    })
  })
})
