import { describe, expectTypeOf, it } from 'vitest'

// types
import type { CollapsiblePaths } from '../src/utils/deep-keys'

type WithDeeplyNestedObject = {
  a: {
    b: {
      c: {
        d: {
          e: {
            f: {
              g: {
                h: {
                  i: {
                    j: number
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

type _DeeplyNestedObject = CollapsiblePaths<WithDeeplyNestedObject>

type WithAny = {
  errors?: any
}

type _Any = CollapsiblePaths<WithAny>

type ArrayRecursion = { arr: Array<Array<Array<Array<[]>>>> }

type _ArrayRecursion = CollapsiblePaths<ArrayRecursion>

type WithUndefined = {
  status?: {
    valid: boolean
    error?: {
      message: string
    }
  }
}

type _WithUndefined = CollapsiblePaths<WithUndefined>

type WithUnknown = {
  payload: unknown
}

type _WithUnknown = CollapsiblePaths<WithUnknown>

type WithRealisticState = {
  canSubmit?: boolean
  isSubmitting?: boolean
  errors?: Array<any>
  errorMap?: Record<string, any>
}

type _WithRealisticState = CollapsiblePaths<WithRealisticState>

type WithGeneric<TData> = {
  generic: TData
}

type _WithGeneric = CollapsiblePaths<WithGeneric<{ a: { b: string } }>>

// Self-referential (cyclic) types previously caused TS2589 because the
// mapped-type recursion in `CollapsibleKeys` had no base case. The depth
// cap must turn these into a finite path union instead of a compile error.
type TreeNode = { name: string; children: Array<TreeNode> }

type _TreeNode = CollapsiblePaths<TreeNode>

type LinkedList = { value: number; next?: LinkedList }

type _LinkedList = CollapsiblePaths<LinkedList>

describe('deep-keys', () => {
  it('should type deeply nested keys', () => {
    expectTypeOf<_DeeplyNestedObject>().toEqualTypeOf<
      | ''
      | 'a'
      | 'a.b'
      | 'a.b.c'
      | 'a.b.c.d'
      | 'a.b.c.d.e'
      | 'a.b.c.d.e.f'
      | 'a.b.c.d.e.f.g'
      | 'a.b.c.d.e.f.g.h'
      | 'a.b.c.d.e.f.g.h.i'
    >()
  })

  it('should handle any', () => {
    expectTypeOf<_Any>().toEqualTypeOf<'' | 'errors'>()
  })

  it('should handle array recursion', () => {
    expectTypeOf<_ArrayRecursion>().toEqualTypeOf<
      | ''
      | 'arr'
      | `arr[${number}]`
      | `arr[${number}][${number}]`
      | `arr[${number}][${number}][${number}]`
      | `arr[${number}][${number}][${number}][${number}]`
    >()
  })

  it('should handle undefined', () => {
    expectTypeOf<_WithUndefined>().toEqualTypeOf<
      '' | 'status' | 'status.error'
    >()
  })

  it('should handle unknown', () => {
    expectTypeOf<_WithUnknown>().toEqualTypeOf<''>()
  })

  it('should handle realistic state', () => {
    expectTypeOf<_WithRealisticState>().toEqualTypeOf<
      '' | 'errors' | 'errorMap' | `errors[${number}]` | `errorMap.${string}`
    >()
  })

  it('should handle generics', () => {
    expectTypeOf<_WithGeneric>().toEqualTypeOf<'' | 'generic' | 'generic.a'>()
  })

  it('should handle self-referential tree types without TS2589', () => {
    expectTypeOf<_TreeNode>().toEqualTypeOf<
      | ''
      | 'children'
      | `children[${number}]`
      | `children[${number}].children`
      | `children[${number}].children[${number}]`
      | `children[${number}].children[${number}].children`
      | `children[${number}].children[${number}].children[${number}]`
      | `children[${number}].children[${number}].children[${number}].children`
      | `children[${number}].children[${number}].children[${number}].children[${number}]`
      | `children[${number}].children[${number}].children[${number}].children[${number}].children`
    >()
  })

  it('should handle self-referential linked-list types without TS2589', () => {
    expectTypeOf<_LinkedList>().toEqualTypeOf<
      | ''
      | 'next'
      | 'next.next'
      | 'next.next.next'
      | 'next.next.next.next'
      | 'next.next.next.next.next'
      | 'next.next.next.next.next.next'
      | 'next.next.next.next.next.next.next'
      | 'next.next.next.next.next.next.next.next'
      | 'next.next.next.next.next.next.next.next.next'
    >()
  })
})
