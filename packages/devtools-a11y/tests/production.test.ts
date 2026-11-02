import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  createReactPanel,
  createSolidPanel,
  createAngularPanel,
  createReactPlugin,
  createSolidPlugin,
  createAngularPlugin,
  capturedReactCores,
  capturedSolidCores,
  capturedAngularCores,
} = vi.hoisted(() => {
  const capturedReactCores: Array<
    new () => {
      mount: (el: HTMLElement, props: unknown) => void
      unmount: () => void
    }
  > = []
  const capturedSolidCores: Array<
    new () => {
      mount: (el: HTMLElement, props: unknown) => void
      unmount: () => void
    }
  > = []
  const capturedAngularCores: Array<
    new () => {
      mount: (el: HTMLElement, props: unknown) => void
      unmount: () => void
    }
  > = []

  type CoreClass = new () => {
    mount: (el: HTMLElement, props: unknown) => void
    unmount: () => void
  }

  function panelStub() {
    return [() => null, () => null] as const
  }

  function pluginStub({ name }: { name: string }) {
    const plugin = () => ({ name, render: () => null })
    return [plugin, plugin] as const
  }

  return {
    capturedReactCores,
    capturedSolidCores,
    capturedAngularCores,
    createReactPanel: (CoreClass: CoreClass) => {
      capturedReactCores.push(CoreClass)
      return panelStub()
    },
    createSolidPanel: (CoreClass: CoreClass) => {
      capturedSolidCores.push(CoreClass)
      return panelStub()
    },
    createAngularPanel: (CoreClass: CoreClass) => {
      capturedAngularCores.push(CoreClass)
      return panelStub()
    },
    createReactPlugin: pluginStub,
    createSolidPlugin: pluginStub,
    createAngularPlugin: pluginStub,
  }
})

vi.mock('@tanstack/devtools-utils/react', () => ({
  createReactPanel,
  createReactPlugin,
}))

vi.mock('@tanstack/devtools-utils/angular', () => ({
  createAngularPanel,
  createAngularPlugin,
}))

// `src/core/core.tsx` imports `constructCoreClass` from the solid util to build
// the real + NoOp core classes. Preserve that real export via `importOriginal`
// while capturing the CoreClass handed to `createSolidPanel`. `Object.assign`
// is used instead of a spread (`...actual`) because the module namespace type
// is not spreadable under this tsconfig.
vi.mock('@tanstack/devtools-utils/solid', async (importOriginal) => {
  const actual = await importOriginal()
  return Object.assign({}, actual, {
    createSolidPanel,
    createSolidPlugin,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  capturedReactCores.length = 0
  capturedSolidCores.length = 0
  capturedAngularCores.length = 0
})

// Static, per-framework import helpers so the bundler can resolve the dynamic
// imports ahead of time. Each returns the captured-core bucket for that framework.
const PRODUCTION_ENTRIES = {
  react: () => import('../src/react/production'),
  solid: () => import('../src/solid/production'),
  angular: () => import('../src/angular/production'),
} as const

const DEV_WRAPPERS = {
  react: () => import('../src/react/A11yDevtools'),
  solid: () => import('../src/solid/A11yDevtools'),
  angular: () => import('../src/angular/A11yDevtools'),
} as const

const CAPTURES = {
  react: capturedReactCores,
  solid: capturedSolidCores,
  angular: capturedAngularCores,
} as const

describe.each(['react', 'solid', 'angular'] as const)(
  '%s/production always wires the real A11yDevtoolsCore',
  (framework) => {
    it.each(['production', 'development'] as const)(
      'under NODE_ENV=%s',
      async (nodeEnv) => {
        vi.stubEnv('NODE_ENV', nodeEnv)
        vi.resetModules()

        const core = await import('../src/core/core')
        await PRODUCTION_ENTRIES[framework]()

        const captured = CAPTURES[framework]
        expect(captured).toHaveLength(1)
        const capturedCore = captured[0]!
        expect(capturedCore).toBe(core.A11yDevtoolsCore)
        expect(capturedCore).not.toBe(core.A11yDevtoolsCoreNoOp)
        // Behavioral: the real core throws when unmount is called before mount,
        // whereas the NoOp core's unmount is a silent no-op.
        expect(() => new capturedCore().unmount()).toThrow(
          'Devtools is not mounted',
        )
      },
    )
  },
)

it('core/production always re-exports the real A11yDevtoolsCore (regression guard)', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.resetModules()

  const coreCore = await import('../src/core/core')
  const coreProduction = await import('../src/core/production')

  expect(coreProduction.A11yDevtoolsCore).toBe(coreCore.A11yDevtoolsCore)
  expect(coreProduction.A11yDevtoolsCore).not.toBe(
    coreCore.A11yDevtoolsCoreNoOp,
  )
  expect(() => new coreProduction.A11yDevtoolsCore().unmount()).toThrow(
    'Devtools is not mounted',
  )
})

describe.each(['react', 'solid', 'angular'] as const)(
  '%s dev wrapper still respects the conditional core barrel',
  (framework) => {
    it('wires the NoOp core under NODE_ENV=production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.resetModules()

      const core = await import('../src/core/core')
      await DEV_WRAPPERS[framework]()

      const captured = CAPTURES[framework]
      expect(captured).toHaveLength(1)
      const capturedCore = captured[0]!
      expect(capturedCore).toBe(core.A11yDevtoolsCoreNoOp)
      expect(capturedCore).not.toBe(core.A11yDevtoolsCore)
      expect(() => new capturedCore().unmount()).not.toThrow()
    })

    it('wires the real core under NODE_ENV=development', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.resetModules()

      const core = await import('../src/core/core')
      await DEV_WRAPPERS[framework]()

      const captured = CAPTURES[framework]
      expect(captured).toHaveLength(1)
      const capturedCore = captured[0]!
      expect(capturedCore).toBe(core.A11yDevtoolsCore)
      expect(() => new capturedCore().unmount()).toThrow(
        'Devtools is not mounted',
      )
    })
  },
)
