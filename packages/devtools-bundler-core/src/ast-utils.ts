import type { Node } from 'oxc-parser'

/**
 * Iterate over the direct child nodes of an AST node.
 *
 * Child keys are discovered per instance rather than cached per `node.type`:
 * oxc-parser instances of the same node type are *not* guaranteed to share a
 * shape — the same key can hold `null`, a primitive, or a child node across
 * instances (e.g. `Literal.value`, `PropertyDefinition.accessibility`), and
 * optional keys can be omitted entirely (e.g. `Identifier.typeAnnotation` in
 * JS vs. TS, `Literal.regex` only on regex literals). A module-global cache
 * keyed only by `node.type` would freeze the first-seen shape and either throw
 * on `'type' in <primitive>` or silently skip subtrees on later instances,
 * with that wrong shape shared across every file a worker parses. The
 * per-instance `for…in` scan is allocation-free, so caching buys nothing.
 */
export function forEachChild(node: Node, callback: (child: Node) => void) {
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end') continue
    const value = (node as any)[key]
    if (value === null || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && item !== null && 'type' in item) {
          callback(item)
        }
      }
    } else if ('type' in value) {
      callback(value as Node)
    }
  }
}

/**
 * Recursively walk AST nodes, calling `visitor` for each node with a `type`.
 */
export function walk(
  node: Node,
  visitor: (node: Node, parentNode?: Node) => void,
  parentNode?: Node,
) {
  visitor(node, parentNode)
  forEachChild(node, (child) => walk(child, visitor, node))
}
