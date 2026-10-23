import { describe, expect, test } from 'vitest'
import { parseSync } from 'oxc-parser'
import { removeDevtools } from './remove-devtools'

const removeEmptySpace = (str: string) => {
  return str.replace(/\s/g, '').trim()
}

describe('remove-devtools', () => {
  test('it removes devtools if Imported directly', () => {
    const output = removeEmptySpace(
      removeDevtools(
        `
      import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { TanStackDevtools } from '@tanstack/react-devtools'
 

 
export default function DevtoolsExample() {
  return (
    <>
      <TanStackDevtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: <ReactQueryDevtoolsPanel />,
          },
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel router={router} />,
          },
          /* {
            name: "The actual app",
            render: <iframe style={{ width: '100%', height: '100%' }} src="http://localhost:3005" />,
          } */
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}

        `,
        'test.jsx',
      )!.code,
    )
    expect(output).toBe(
      removeEmptySpace(`
          import {
            Link,
            Outlet,
            RouterProvider,
            createRootRoute,
            createRoute,
            createRouter,
          } from '@tanstack/react-router'

          export default function DevtoolsExample() {
            return (
              <>
                <RouterProvider router={router} />
              </>
            )
          }
        `),
    )
  })

  test("it removes devtools if Imported and renamed with 'as' ", () => {
    const output = removeEmptySpace(
      removeDevtools(
        `
      import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { TanStackDevtools as Devtools } from '@tanstack/react-devtools'



export default function DevtoolsExample() {
  return (
    <>
      <Devtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: <ReactQueryDevtoolsPanel />,
          },
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel router={router} />,
          },
          /* {
            name: "The actual app",
            render: <iframe style={{ width: '100%', height: '100%' }} src="http://localhost:3005" />,
          } */
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}

        `,
        'test.jsx',
      )!.code,
    )
    expect(output).toBe(
      removeEmptySpace(`
          import {
            Link,
            Outlet,
            RouterProvider,
            createRootRoute,
            createRoute,
            createRouter,
          } from '@tanstack/react-router'

          export default function DevtoolsExample() {
            return (
              <>
                <RouterProvider router={router} />
              </>
            )
          }
        `),
    )
  })

  test('it removes devtools if Imported as * then used as a subcomponent ', () => {
    const output = removeEmptySpace(
      removeDevtools(
        `
      import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import * as Tools from '@tanstack/react-devtools'



export default function DevtoolsExample() {
  return (
    <>
      <Tools.TanStackDevtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: <ReactQueryDevtoolsPanel />,
          },
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel router={router} />,
          },
          /* {
            name: "The actual app",
            render: <iframe style={{ width: '100%', height: '100%' }} src="http://localhost:3005" />,
          } */
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}

        `,
        'test.jsx',
      )!.code,
    )
    expect(output).toBe(
      removeEmptySpace(`
          import {
            Link,
            Outlet,
            RouterProvider,
            createRootRoute,
            createRoute,
            createRouter,
          } from '@tanstack/react-router'

          export default function DevtoolsExample() {
            return (
              <>
                <RouterProvider router={router} />
              </>
            )
          }
        `),
    )
  })

  test('it removes devtools and all possible variations of the plugins', () => {
    const output = removeEmptySpace(
      removeDevtools(
        ` 
      import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import * as Tools from '@tanstack/react-devtools'
 

 
export default function DevtoolsExample() {
  return (
    <>
      <Tools.TanStackDevtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: <ReactQueryDevtoolsPanel />,
          },
                 {
            name: 'TanStack Query',
            render: () => <ReactQueryDevtoolsPanel />,
          },
          {
            name: 'TanStack Router',
            render: TanStackRouterDevtoolsPanel,
          },
          some()
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}`,
        'test.jsx',
      )!.code,
    )

    expect(output).toBe(
      removeEmptySpace(`
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

export default function DevtoolsExample() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  )
}
          `),
    )
  })

  describe('removing plugin imports', () => {
    test('it removes the plugin import from the import array if multiple import identifiers exist', () => {
      const output = removeEmptySpace(
        removeDevtools(
          ` 
      import { ReactQueryDevtoolsPanel, test } from '@tanstack/react-query-devtools'
 
import * as Tools from '@tanstack/react-devtools'
 

 
export default function DevtoolsExample() {
  return (
    <>
      <Tools.TanStackDevtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: <ReactQueryDevtoolsPanel />,
          } 
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}`,
          'test.jsx',
        )!.code,
      )

      expect(output).toBe(
        removeEmptySpace(`
   import { test } from '@tanstack/react-query-devtools'

export default function DevtoolsExample() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  )
}
          `),
      )
    })

    test("it doesn't remove the whole import if imported with * as", () => {
      const output = removeEmptySpace(
        removeDevtools(
          ` 
      import * as Stuff from '@tanstack/react-query-devtools'
 
import * as Tools from '@tanstack/react-devtools'
 

 
export default function DevtoolsExample() {
  return (
    <>
      <Tools.TanStackDevtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: <Stuff.ReactQueryDevtoolsPanel />,
          } 
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}`,
          'test.jsx',
        )!.code,
      )

      expect(output).toBe(
        removeEmptySpace(`
   import * as Stuff from '@tanstack/react-query-devtools'

export default function DevtoolsExample() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  )
}
          `),
      )
    })

    test('it removes the import completely if nothing is left', () => {
      const output = removeEmptySpace(
        removeDevtools(
          ` 
      import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools' 
import * as Tools from '@tanstack/react-devtools' 
 
export default function DevtoolsExample() {
  return (
    <>
      <Tools.TanStackDevtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: <ReactQueryDevtoolsPanel />,
          } 
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}`,
          'test.jsx',
        )!.code,
      )

      expect(output).toBe(
        removeEmptySpace(`
export default function DevtoolsExample() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  )
}
          `),
      )
    })

    test('it removes the import completely even if used as a function instead of jsx', () => {
      const output = removeEmptySpace(
        removeDevtools(
          ` 
      import { plugin } from '@tanstack/react-query-devtools' 
import * as Tools from '@tanstack/react-devtools' 
 
export default function DevtoolsExample() {
  return (
    <>
      <Tools.TanStackDevtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: plugin()
          } 
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}`,
          'test.jsx',
        )!.code,
      )

      expect(output).toBe(
        removeEmptySpace(`
export default function DevtoolsExample() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  )
}
          `),
      )
    })

    test('it removes the import completely even if used as a function inside of render', () => {
      const output = removeEmptySpace(
        removeDevtools(
          ` 
      import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools' 
import * as Tools from '@tanstack/react-devtools' 
 
export default function DevtoolsExample() {
  return (
    <>
      <Tools.TanStackDevtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: () => <ReactQueryDevtoolsPanel />
          } 
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}`,
          'test.jsx',
        )!.code,
      )

      expect(output).toBe(
        removeEmptySpace(`
export default function DevtoolsExample() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  )
}
          `),
      )
    })

    test('it removes the import completely even if used as a reference inside of render', () => {
      const output = removeEmptySpace(
        removeDevtools(
          ` 
      import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools' 
import * as Tools from '@tanstack/react-devtools' 
 
export default function DevtoolsExample() {
  return (
    <>
      <Tools.TanStackDevtools
        eventBusConfig={{
          connectToServerBus: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: ReactQueryDevtoolsPanel
          } 
        ]}
      />
      <RouterProvider router={router} />
    </>
  )
}`,
          'test.jsx',
        )!.code,
      )

      expect(output).toBe(
        removeEmptySpace(`
export default function DevtoolsExample() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  )
}
          `),
      )
    })
  })

  describe('framework devtools package coverage', () => {
    test.each([
      ['@tanstack/preact-devtools'],
      ['@tanstack/vue-devtools'],
      ['@tanstack/svelte-devtools'],
      ['@tanstack/angular-devtools'],
    ])('strips imports + JSX from %s', (pkg) => {
      const output = removeDevtools(
        `
import { TanStackDevtools } from '${pkg}'

export default function App() {
  return <TanStackDevtools />
}
        `,
        'test.jsx',
      )

      expect(output).toBeDefined()
      expect(output!.code).not.toContain(pkg)
      expect(output!.code).not.toContain('TanStackDevtools')
    })
  })

  test('preserves valid syntax when removing parenthesized devtools return', () => {
    const output = removeEmptySpace(
      removeDevtools(
        `
import { TanStackDevtools } from '@tanstack/react-devtools'

export function DevtoolsProvider() {
  return (
    <TanStackDevtools />
  )
}
`,
        'test.tsx',
      )!.code,
    )

    expect(output).toBe(
      removeEmptySpace(`
export function DevtoolsProvider() {
  return (
    null
  )
}
`),
    )
  })

  test('replaces removed devtools expressions with null', () => {
    const output = removeEmptySpace(
      removeDevtools(
        `
import { TanStackDevtools } from '@tanstack/react-devtools'

function functionCall(value: unknown) {
  return value
}

export function DevtoolsProvider() {
  const devtools1 = <TanStackDevtools />
  const devtools2 = functionCall(<TanStackDevtools />)
  const devtools3 = true ? <TanStackDevtools /> : <>fallback</>
  const devtools4 = {
    devtools: <TanStackDevtools />
  }
  const devtools5 = (<div>
      {<TanStackDevtools plugins={[]} />}
  </div>)
  return { devtools1, devtools2, devtools3, devtools4, devtools5 }
}
`,
        'test.tsx',
      )!.code,
    )

    expect(output).toBe(
      removeEmptySpace(`
function functionCall(value: unknown) {
  return value
}

export function DevtoolsProvider() {
  const devtools1 = null
  const devtools2 = functionCall(null)
  const devtools3 = true ? null : <>fallback</>
  const devtools4 = {
    devtools: null
  }
  const devtools5 = (<div>
      {null}
  </div>)
  return { devtools1, devtools2, devtools3, devtools4, devtools5 }
}
`),
    )
  })

  test('removes devtools jsx children entirely', () => {
    const output = removeEmptySpace(
      removeDevtools(
        `
import { TanStackDevtools } from '@tanstack/react-devtools'

export function DevtoolsProvider() {
  return (
    <>
      <div>
        <div>before</div>
        <TanStackDevtools />
        <div>after</div>
      </div>
      <TanStackDevtools />
    </>
  )
}
`,
        'test.tsx',
      )!.code,
    )

    expect(output).toBe(
      removeEmptySpace(`
export function DevtoolsProvider() {
  return (
  <>
    <div>
      <div>before</div>
      <div>after</div>
    </div>
  </>
  )
}
`),
    )
  })

  describe('null-overwrite preserves valid syntax (whitespace-sensitive)', () => {
    // Re-parse the transformed output to assert it stays valid JavaScript/TSX.
    // The rest of this file compares through `removeEmptySpace`, which strips
    // whitespace from both sides and so cannot catch a swallowed newline.
    const assertParses = (code: string, id = 'test.tsx') => {
      const result = parseSync(id, code, {
        sourceType: 'module',
        lang: 'tsx',
      })
      expect(result.errors).toHaveLength(0)
    }

    test('keeps the newline between a null-overwritten declarator and the next statement', () => {
      const input = `import { TanStackDevtools } from '@tanstack/react-devtools'
const x = <TanStackDevtools />
const y = 1
`
      const out = removeDevtools(input, 'test.tsx')!

      // Whitespace-sensitive: the newline must survive so `null` is not glued to the next statement.
      expect(out.code).toBe(`const x = null
const y = 1
`)
      assertParses(out.code)
    })

    test('nested-in-JSX removal still collapses the devtools line (remove branch unchanged)', () => {
      const input = `import { TanStackDevtools } from '@tanstack/react-devtools'
export function App() {
  return (
    <>
      <TanStackDevtools />
      <div>after</div>
    </>
  )
}
`
      const out = removeDevtools(input, 'test.tsx')!

      // The remove branch must still consume the trailing newline so the devtools
      // element is gone and the following line moves up. (The element's leading
      // indentation is untouched by MagicString's remove, which is the pre-existing
      // behavior and unrelated to this fix.)
      expect(out.code).toBe(`export function App() {
  return (
    <>
            <div>after</div>
    </>
  )
}
`)
      expect(out.code).not.toContain('TanStackDevtools')
      assertParses(out.code)
    })
  })
})
