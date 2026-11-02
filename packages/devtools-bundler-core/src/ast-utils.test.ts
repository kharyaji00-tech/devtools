import { describe, expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import { forEachChild, walk } from './ast-utils'
import type { Node } from 'oxc-parser'

describe('forEachChild', () => {
  it('visits only direct typed children, skipping null and non-type values', () => {
    const childA = { type: 'ChildA', start: 0, end: 1 }
    const childB = { type: 'ChildB', start: 1, end: 2 }
    const nested = { type: 'Nested', start: 2, end: 3 }
    const root = {
      type: 'ForEachRoot',
      start: 0,
      end: 10,
      // array-valued key holding two typed children
      items: [childA, childB],
      // object-valued typed child
      body: nested,
      // null field: skipped
      optional: null,
      // primitive string value: not a child (and excluded from child keys)
      name: 'hello',
      // primitive number value: not a child
      count: 5,
    } as unknown as Node

    const visited: Array<Node> = []
    forEachChild(root, (child) => visited.push(child))

    expect(visited).toEqual([childA, childB, nested])
    expect(visited).toHaveLength(3)
  })

  it('skips non-object array items and array items without a type', () => {
    const real = { type: 'RealItem', start: 0, end: 1 }
    const root = {
      type: 'ForEachArrayRoot',
      start: 0,
      end: 10,
      items: [real, null, 'string-item', 42, { noType: true }],
    } as unknown as Node

    const visited: Array<Node> = []
    forEachChild(root, (child) => visited.push(child))

    expect(visited).toEqual([real])
  })
})

describe('walk', () => {
  it('visits every node depth-first with the correct parentNode', () => {
    const grandchild = { type: 'WalkGrandchild', start: 4, end: 5 }
    const childA = {
      type: 'WalkChildA',
      start: 1,
      end: 6,
      inner: grandchild,
    }
    const childB = { type: 'WalkChildB', start: 6, end: 7 }
    const root = {
      type: 'WalkRoot',
      start: 0,
      end: 10,
      children: [childA, childB],
    } as unknown as Node

    const visits: Array<{ node: Node; parent: Node | undefined }> = []
    walk(root, (node, parentNode) => {
      visits.push({ node, parent: parentNode })
    })

    // Depth-first order: root, childA, grandchild, childB
    expect(visits.map((v) => v.node.type)).toEqual([
      'WalkRoot',
      'WalkChildA',
      'WalkGrandchild',
      'WalkChildB',
    ])

    // Correct parent for each node
    expect(visits[0]!.parent).toBeUndefined()
    expect(visits[1]!.parent).toBe(root)
    expect(visits[2]!.parent).toBe(childA)
    expect(visits[3]!.parent).toBe(root)
  })

  it('passes the provided parentNode through to the root visit', () => {
    const fakeParent = {
      type: 'WalkExternalParent',
      start: 0,
      end: 1,
    } as unknown as Node
    const root = {
      type: 'WalkRootWithParent',
      start: 1,
      end: 2,
    } as unknown as Node

    const visits: Array<{ node: Node; parent: Node | undefined }> = []
    walk(
      root,
      (node, parentNode) => visits.push({ node, parent: parentNode }),
      fakeParent,
    )

    expect(visits).toHaveLength(1)
    expect(visits[0]!.node).toBe(root)
    expect(visits[0]!.parent).toBe(fakeParent)
  })
})

function parseProgram(source: string, lang: 'tsx' | 'js' = 'tsx') {
  const result = parseSync(`input.${lang === 'js' ? 'js' : 'tsx'}`, source, {
    sourceType: 'module',
    lang,
  })
  if (result.errors.length > 0) {
    throw new Error(
      `unexpected parse errors: ${JSON.stringify(result.errors)}`,
    )
  }
  return result.program
}

function collectAllTypedNodes(root: Node): Set<Node> {
  const out = new Set<Node>()
  const stack: Array<any> = [root]
  while (stack.length > 0) {
    const value = stack.pop()
    if (value === null || typeof value !== 'object') continue
    if ('type' in value) out.add(value as Node)
    for (const key in value) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      const child = (value)[key]
      if (Array.isArray(child)) {
        for (const item of child) stack.push(item)
      } else if (child !== null && typeof child === 'object') {
        stack.push(child)
      }
    }
  }
  return out
}

function expectWalkVisitsAllNodes(program: Node): Array<Node> {
  const visited: Array<Node> = []
  walk(program, (node) => visited.push(node))
  const expected = collectAllTypedNodes(program)
  const visitedSet = new Set(visited)
  expect(visited).toHaveLength(expected.size)
  expect(visitedSet.size).toBe(expected.size)
  for (const node of expected) {
    expect(visitedSet.has(node)).toBe(true)
  }
  return visited
}

describe('forEachChild — per-instance child keys (cache-regression)', () => {
  it('does not cache a node type\'s child keys across instances of the same type', () => {
    const child = { type: 'Value', start: 2, end: 3 } as unknown as Node
    const nullValue = { type: 'Box', start: 0, end: 4, value: null } as unknown as Node
    const nodeValue = { type: 'Box', start: 0, end: 4, value: child } as unknown as Node
    const primitiveValue = { type: 'Box', start: 0, end: 4, value: 'primitive' } as unknown as Node
    const numberValue = { type: 'Box', start: 0, end: 4, value: 0 } as unknown as Node

    const visitedNull: Array<Node> = []
    forEachChild(nullValue, (child) => visitedNull.push(child))
    const visitedNode: Array<Node> = []
    forEachChild(nodeValue, (child) => visitedNode.push(child))
    const visitedPrimitive: Array<Node> = []
    expect(() =>
      forEachChild(primitiveValue, (child) => visitedPrimitive.push(child)),
    ).not.toThrow()
    const visitedNumber: Array<Node> = []
    expect(() =>
      forEachChild(numberValue, (child) => visitedNumber.push(child)),
    ).not.toThrow()

    expect(visitedNull).toEqual([])
    expect(visitedNode).toEqual([child])
    expect(visitedPrimitive).toEqual([])
    expect(visitedNumber).toEqual([])
  })
})

describe('walk / forEachChild over real oxc-parser ASTs', () => {
  it('visits every node of a TS class with private/protected/readonly members (accessibility primitives)', () => {
    const program = parseProgram(
      `export class Service {\n  readonly x = 1\n  private y = 2\n  protected z = "three"\n  public static w: number = /re/g\n}\n`,
    )
    const visited: Array<Node> = []
    expect(() => {
      walk(program, (node) => visited.push(node))
    }).not.toThrow()
    const expected = collectAllTypedNodes(program)
    expect(new Set(visited).size).toBe(expected.size)
    for (const node of expected) {
      expect(new Set(visited).has(node)).toBe(true)
    }
  })

  it('does not crash or drop nodes when a null Literal is seen before primitive Literals', () => {
    const program = parseProgram(
      `function f() { return null }\nconst a = "x"\nconst b = 0\nconst c = true\nconst d = null\nconst e = /re/g\n`,
    )
    const visited: Array<Node> = []
    expect(() => {
      walk(program, (node) => visited.push(node))
    }).not.toThrow()
    const expected = collectAllTypedNodes(program)
    expect(new Set(visited).size).toBe(expected.size)
    for (const node of expected) {
      expect(new Set(visited).has(node)).toBe(true)
    }
  })

  it('visits every node of a plain JS module', () => {
    const program = parseProgram(
      `export function add(a, b) {\n  const sum = a + b\n  return sum\n}\nconst result = add(1, 2)\nconsole.log(result)\n`,
      'js',
    )
    expectWalkVisitsAllNodes(program)
  })

  it('visits every node of a TSX module including all TS type annotation subtrees', () => {
    const program = parseProgram(
      `const list: Array<number> = [1, 2, 3]\nfunction first<T extends unknown>(items: T[]): T | null {\n  return items[0] ?? null\n}\n`,
    )
    const visited = expectWalkVisitsAllNodes(program)
    const visitedTypes = new Set(visited.map((node) => node.type))
    expect(visitedTypes.has('TSTypeAnnotation')).toBe(true)
    expect(visitedTypes.has('TSTypeReference')).toBe(true)
    expect(visitedTypes.has('TSTypeParameterDeclaration')).toBe(true)
    expect(visitedTypes.has('TSTypeParameter')).toBe(true)
  })

  it('walks every node of a TSX file even after parsing a plain JS file in the same process (cross-language cache pollution)', () => {
    const jsProgram = parseProgram(
      `export function add(a, b) { return a + b }\n`,
      'js',
    )
    walk(jsProgram, () => {})

    const tsxProgram = parseProgram(
      `const x: Array<number> = [1, 2, 3]\nfunction id<T>(value: T): T { return value }\n`,
    )
    const visited = expectWalkVisitsAllNodes(tsxProgram)
    const visitedTypes = new Set(visited.map((node) => node.type))
    expect(visitedTypes.has('TSTypeAnnotation')).toBe(true)
    expect(visitedTypes.has('TSTypeReference')).toBe(true)
    expect(visitedTypes.has('TSTypeParameter')).toBe(true)
  })

  it('does not crash walking a plain JS file after a TSX file in the same process (reverse cross-language order)', () => {
    const tsxProgram = parseProgram(
      `const x: number = 0\nlet y = null\nconst m = "msg"\n`,
    )
    walk(tsxProgram, () => {})

    const jsProgram = parseProgram(
      `export function add(a, b) { return a + b }\nconst m = "msg"\n`,
      'js',
    )
    const visited: Array<Node> = []
    expect(() => {
      walk(jsProgram, (node) => visited.push(node))
    }).not.toThrow()
    const expected = collectAllTypedNodes(jsProgram)
    expect(new Set(visited).size).toBe(expected.size)
    for (const node of expected) {
      expect(new Set(visited).has(node)).toBe(true)
    }
  })
})
