import { describe, expect, it } from 'vitest'
import { getAllPluginMetadata } from './plugin-registry'

const byPackage = (name: string) =>
  getAllPluginMetadata().find((metadata) => metadata.packageName === name)

describe('plugin-registry', () => {
  it('points the a11y plugin at the real exported factory on the react subpath', () => {
    const a11y = byPackage('@tanstack/devtools-a11y')
    expect(a11y).toBeDefined()
    expect(a11y!.pluginImport).toEqual({
      importName: 'a11yDevtoolsPlugin',
      type: 'function',
      // The bare package has no root export; the factory lives on /react.
      // packageName stays the bare package so the marketplace dependency check
      // still keys off the installed package, while importPath drives the
      // emitted import specifier.
      importPath: '@tanstack/devtools-a11y/react',
    })
    expect(a11y!.framework).toBe('react')
  })

  it('never references the non-existent createA11yPlugin symbol', () => {
    const offending = getAllPluginMetadata().filter(
      (metadata) => metadata.pluginImport?.importName === 'createA11yPlugin',
    )
    expect(
      offending,
      `registry entries still referencing the phantom createA11yPlugin: ${offending.map((m) => m.packageName).join(', ')}`,
    ).toEqual([])
  })

  it('emits an import specifier for a11y that resolves (not the bare, root-less package)', () => {
    const a11y = byPackage('@tanstack/devtools-a11y')!
    const specifier = a11y.pluginImport?.importPath ?? a11y.packageName
    expect(specifier).not.toBe(a11y.packageName)
    expect(specifier.startsWith(`${a11y.packageName}/`)).toBe(true)
  })
})
