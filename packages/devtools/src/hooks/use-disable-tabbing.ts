import { createEffect } from 'solid-js'
import { TANSTACK_DEVTOOLS } from '../utils/storage'

const originalTabIndex = new WeakMap<Element, string | null>()

const recursivelyChangeTabIndex = (
  node: Element | HTMLElement,
  remove = true,
) => {
  if (remove) {
    if (!originalTabIndex.has(node)) {
      originalTabIndex.set(node, node.getAttribute('tabIndex'))
    }
    node.setAttribute('tabIndex', '-1')
  } else {
    const original = originalTabIndex.get(node)
    if (original === undefined) return
    if (original === null) {
      node.removeAttribute('tabIndex')
    } else {
      node.setAttribute('tabIndex', original)
    }
  }
  for (const child of node.children) {
    recursivelyChangeTabIndex(child, remove)
  }
}
/**
 * @param isOpen A function that returns whether the devtools are open or not.
 * This is used to disable tabbing over the main devtools container while
 * the devtools are closed.
 */
export const createDisableTabbing = (isOpen: () => boolean) => {
  createEffect(() => {
    const el = document.getElementById(TANSTACK_DEVTOOLS)
    if (!el) return
    recursivelyChangeTabIndex(el, !isOpen())
  })
}
