import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPluginCards } from './plugin-utils'
import type { PluginMetadata } from '../plugin-registry'
import type { PackageJson } from '@tanstack/devtools-client'

// The shipped registry never declares `maxVersion`, so the above-max code path
// is only reachable once a third-party author follows the marketplace skill and
// declares one. Mock the registry so the version-mismatch assignment can be
// exercised without depending on (or mutating) the real registry contents.
const { registry } = vi.hoisted(() => ({
  registry: [] as Array<PluginMetadata>,
}))

vi.mock('../plugin-registry', () => ({
  getAllPluginMetadata: () => registry,
}))

const rangePlugin: PluginMetadata = {
  packageName: '@acme/base-devtools',
  title: 'Base Devtools',
  framework: 'react',
  requires: {
    packageName: '@acme/base',
    minVersion: '5.0.0',
    maxVersion: '5.2.0',
  },
}

const minOnlyPlugin: PluginMetadata = {
  packageName: '@acme/min-devtools',
  title: 'Min Devtools',
  framework: 'react',
  requires: {
    packageName: '@acme/min',
    minVersion: '2.0.0',
  },
}

describe('buildPluginCards version-range violations', () => {
  beforeEach(() => {
    registry.length = 0
  })

  it('assigns "version-mismatch" when the installed version is above maxVersion', () => {
    registry.push(rangePlugin)
    const pkg: PackageJson = {
      name: 'app',
      dependencies: { '@acme/base': '5.5.0' },
    }

    const cards = buildPluginCards(pkg, 'react', new Set(), [])
    const card = cards[0]!

    expect(card.actionType).toBe('version-mismatch')
    expect(card.versionInfo?.satisfied).toBe(false)
    expect(card.versionInfo?.violation).toBe('max')
    expect(card.versionInfo?.current).toBe('5.5.0')
    expect(card.versionInfo?.required).toBe('5.0.0')
    expect(card.versionInfo?.reason).toBe(
      'Requires v5.2.0 or lower (current: v5.5.0)',
    )
  })

  it('assigns "bump-version" when the installed version is below minVersion', () => {
    registry.push(rangePlugin)
    const pkg: PackageJson = {
      name: 'app',
      dependencies: { '@acme/base': '4.9.0' },
    }

    const cards = buildPluginCards(pkg, 'react', new Set(), [])
    const card = cards[0]!

    expect(card.actionType).toBe('bump-version')
    expect(card.versionInfo?.satisfied).toBe(false)
    expect(card.versionInfo?.violation).toBe('min')
  })

  it('does not block a version that satisfies the range', () => {
    registry.push(rangePlugin)
    const pkg: PackageJson = {
      name: 'app',
      dependencies: { '@acme/base': '5.1.0' },
    }

    const cards = buildPluginCards(pkg, 'react', new Set(), [])
    const card = cards[0]!

    expect(card.actionType).not.toBe('version-mismatch')
    expect(card.actionType).not.toBe('bump-version')
    expect(card.versionInfo?.satisfied).toBe(true)
    expect(card.versionInfo?.violation).toBeUndefined()
    // Base package present, devtools package absent → install-devtools
    expect(card.actionType).toBe('install-devtools')
  })

  it('blocks above-max even when the devtools package is already installed', () => {
    registry.push(rangePlugin)
    const pkg: PackageJson = {
      name: 'app',
      dependencies: {
        '@acme/base': '5.5.0',
        '@acme/base-devtools': '^1.0.0',
      },
    }

    const cards = buildPluginCards(pkg, 'react', new Set(), [])
    const card = cards[0]!

    // Before the fix this would have offered an enabled "Bump Version" button
    // that installs ^5.0.0 (still above maxVersion) and injects the plugin.
    expect(card.actionType).toBe('version-mismatch')
    expect(card.versionInfo?.violation).toBe('max')
    expect(card.hasDevtools).toBe(true)
  })

  it('blocks above-max even when the plugin is already registered', () => {
    registry.push(rangePlugin)
    const pkg: PackageJson = {
      name: 'app',
      dependencies: {
        '@acme/base': '5.5.0',
        '@acme/base-devtools': '^1.0.0',
      },
    }
    const registeredPlugins = new Set(['@acme/base-devtools'])

    const cards = buildPluginCards(pkg, 'react', registeredPlugins, [])
    const card = cards[0]!

    // The version check precedes the already-installed branch, so an
    // incompatible base version must still be blocked rather than shown as active.
    expect(card.actionType).toBe('version-mismatch')
    expect(card.isRegistered).toBe(true)
  })

  it('never produces "version-mismatch" for a plugin that only declares minVersion', () => {
    // Regression guard: minVersion-only entries (i.e. the entire shipped
    // registry) must still satisfy the range for any version >= min, so the
    // blocked "Incompatible" card is never shown for them.
    registry.push(minOnlyPlugin)
    const pkg: PackageJson = {
      name: 'app',
      dependencies: { '@acme/min': '10.0.0' },
    }

    const cards = buildPluginCards(pkg, 'react', new Set(), [])
    const card = cards[0]!

    expect(card.actionType).not.toBe('version-mismatch')
    expect(card.versionInfo?.satisfied).toBe(true)
    expect(card.versionInfo?.violation).toBeUndefined()
  })

  it('keeps offering "bump-version" for a below-min version even without a maxVersion', () => {
    registry.push(minOnlyPlugin)
    const pkg: PackageJson = {
      name: 'app',
      dependencies: { '@acme/min': '1.4.0' },
    }

    const cards = buildPluginCards(pkg, 'react', new Set(), [])
    const card = cards[0]!

    expect(card.actionType).toBe('bump-version')
    expect(card.versionInfo?.violation).toBe('min')
  })
})
