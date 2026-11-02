import { render } from '@solidjs/testing-library'
import { createEffect } from 'solid-js'
import {
  DelegatedEvents,
  addEventListener as attachDelegatedHandler,
} from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PiPProvider, createPiPWindow } from './pip-context'

/**
 * The marker Solid stores on a document once it has installed the per-event,
 * document-level listener for delegation. Reading it (rather than dispatching)
 * is the direct way to ask "is this event delegated on this document?".
 */
const DELEGATE_KEY = '_$DX_DELEGATE'

const delegatedOn = (doc: Document): Set<string> => {
  const set = (doc as unknown as Record<string, Set<string> | undefined>)[
    DELEGATE_KEY
  ]
  return set ?? new Set<string>()
}

/**
 * jsdom blocks `window.open`, so a browser popup window has to be faked. The
 * real contract `requestPipWindow` depends on: an EventTarget with its own
 * `document` and a `close()` method. `document.implementation.createHTMLDocument`
 * yields a fully-formed detached Document (with `<head>`/`<body>`) that
 * supports `delegateEvents`, `createElement`, `getElementById`, etc.
 */
const createFakePipWindow = () => {
  const pipDocument =
    document.implementation.createHTMLDocument('TanStack Devtools')
  const win = new EventTarget() as unknown as Window &
    typeof globalThis & { document: Document }
  Object.assign(win, { document: pipDocument, close: vi.fn() })
  return { win, pipDocument }
}

const Harness = (props: {
  onContext: (pip: ReturnType<typeof createPiPWindow>) => void
}) => {
  // `createPiPWindow` must run during component setup (it calls `useContext`),
  // so the consumer is rendered inside the provider and hands the accessor out.
  const pip = createPiPWindow()
  createEffect(() => props.onContext(pip))
  return null
}

/**
 * Mount the provider and open a (faked) popup. Returns the captured context
 * accessor plus the popup document, wired so effects have flushed.
 */
const openPip = () => {
  const { win, pipDocument } = createFakePipWindow()
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(win)
  let pip: ReturnType<typeof createPiPWindow> | undefined
  const result = render(() => (
    <PiPProvider>
      <Harness onContext={(c) => (pip = c)} />
    </PiPProvider>
  ))
  // `requestPipWindow` is a no-op if a window is already open, but tests open
  // exactly one, so this always proceeds and installs delegation on the popup.
  pip!().requestPipWindow('width=400,height=400')
  return {
    pipDocument,
    pipWindow: win,
    context: () => pip!(),
    dispose: () => {
      result.unmount()
      openSpy.mockRestore()
    },
  }
}

describe('PiP document event delegation', () => {
  let dispose: (() => void) | undefined

  afterEach(() => {
    dispose?.()
    dispose = undefined
    vi.restoreAllMocks()
  })

  it('registers the full Solid DelegatedEvents set on the popup document', () => {
    const fixture = openPip()
    dispose = fixture.dispose

    const delegated = delegatedOn(fixture.pipDocument)
    expect(delegated).toBeInstanceOf(Set)
    // Every event Solid considers delegated must be delegated on the popup
    // document, mirroring what the runtime does on the main document by default.
    // Guards against regressing to a hand-picked, mode-specific list that leaves
    // delegated handlers (e.g. the splitter's `onDblClick`) dead in PiP mode.
    for (const name of DelegatedEvents) {
      expect(delegated.has(name)).toBe(true)
    }
  })

  it('fires a delegated dblclick handler rendered into the popup document', () => {
    const fixture = openPip()
    dispose = fixture.dispose

    const el = fixture.pipDocument.createElement('button')
    fixture.pipDocument.body.appendChild(el)
    const handler = vi.fn()
    // Attach the way the Solid compiler does for a delegated event: store the
    // handler on the node and rely on the document-level listener to fire it.
    attachDelegatedHandler(el, 'dblclick', handler, true)

    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
