import { onCleanup, onMount } from 'solid-js'

type HeadChange =
  | { kind: 'added'; node: Node }
  | { kind: 'removed'; node: Node }
  | {
      kind: 'attr'
      target: Element
      name: string | null
      oldValue: string | null
    }
  | { kind: 'title'; title: string }

type UseHeadChangesOptions = {
  /**
   * Observe attribute changes on elements inside <head>
   * Default: true
   */
  attributes?: boolean
  /**
   * Observe added/removed nodes in <head>
   * Default: true
   */
  childList?: boolean
  /**
   * Observe descendants of <head>
   * Default: true
   */
  subtree?: boolean
  /**
   * Also observe <title> changes explicitly
   * Default: true
   */
  observeTitle?: boolean
}

/**
 * A `<style>` tag in `<head>` never carries SEO metadata, and CSS-in-JS
 * libraries write into one constantly — goober alone re-stamps its `nonce`
 * attribute and rewrites its text on every `css()` call. Reporting those as head
 * changes feeds a loop: the consumer re-renders, the re-render emits CSS, the
 * CSS mutates `<head>`, and the observer fires again. Stylesheets are filtered
 * out so only real metadata reaches the consumer.
 */
const isStyleNode = (node: Node): boolean => {
  const element =
    node.nodeType === 3 /* Node.TEXT_NODE */ ? node.parentNode : node
  return (element as Element | null)?.nodeName === 'STYLE'
}

export function createHeadChanges(
  onChange: (change: HeadChange, raw?: MutationRecord) => void,
  opts: UseHeadChangesOptions = {},
) {
  const {
    attributes = true,
    childList = true,
    subtree = true,
    observeTitle = true,
  } = opts

  onMount(() => {
    // Resolve the <title> (creating one only when missing) BEFORE starting the
    // head observer. The devtools must passively observe the host page's
    // <head>: appending a synthetic <title> after `observe()` is captured by
    // the observer we just armed and forwarded to consumers as a
    // self-triggered `added` head change. Tracking the element we created lets
    // us filter it out of `added`/`removed` events (mirroring `isStyleNode`)
    // and remove it again on cleanup if the app never adopted it — otherwise
    // the leftover empty <title> stays first in tree order and permanently
    // shadows a real <title> the host app adds later, since `document.title`
    // reads the first <title>.
    let syntheticTitle: HTMLTitleElement | undefined
    if (observeTitle && !document.head.querySelector('title')) {
      syntheticTitle = document.createElement('title')
      document.head.appendChild(syntheticTitle)
    }
    const titleEl = document.head.querySelector('title')

    const headObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (!isStyleNode(node) && node !== syntheticTitle)
              onChange({ kind: 'added', node }, m)
          })
          m.removedNodes.forEach((node) => {
            if (!isStyleNode(node) && node !== syntheticTitle)
              onChange({ kind: 'removed', node }, m)
          })
        } else if (m.type === 'attributes') {
          if (isStyleNode(m.target)) continue
          const el = m.target as Element
          onChange(
            {
              kind: 'attr',
              target: el,
              name: m.attributeName,
              oldValue: m.oldValue ?? null,
            },
            m,
          )
        } else {
          // If someone mutates a Text node inside <title>, surface it as a title change.
          const isInTitle =
            m.target.parentNode &&
            (m.target.parentNode as Element).tagName.toLowerCase() === 'title'
          if (isInTitle) onChange({ kind: 'title', title: document.title }, m)
        }
      }
    })

    headObserver.observe(document.head, {
      childList,
      attributes,
      subtree,
      attributeOldValue: attributes,
      characterData: true, // helps catch <title> text node edits
      characterDataOldValue: false,
    })

    // Extra explicit observer for <title>, since `document.title = "..."`
    // may not always bubble as a head mutation in all setups.
    let titleObserver: MutationObserver | undefined
    if (observeTitle && titleEl) {
      titleObserver = new MutationObserver(() => {
        onChange({ kind: 'title', title: document.title })
      })
      titleObserver.observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    }

    onCleanup(() => {
      headObserver.disconnect()
      titleObserver?.disconnect()
      // Remove the synthetic <title> only when it is still attached and still
      // empty, so the devtools never leaves a placeholder that shadows a real
      // <title> added after unmount. If the app populated it (e.g. via
      // `document.title = "..."`, which writes into the first <title>), it is
      // treated as adopted and left in place.
      if (
        syntheticTitle &&
        syntheticTitle.parentNode &&
        !syntheticTitle.textContent
      ) {
        syntheticTitle.parentNode.removeChild(syntheticTitle)
      }
    })
  })
}
