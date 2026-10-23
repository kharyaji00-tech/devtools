/** @jsxImportSource solid-js */

import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeContextProvider } from '@tanstack/devtools-ui'
import {
  AllyProvider,
  createAllyContext,
} from '../src/core/contexts/allyContext'

import type { A11yPluginOptions } from '../src/core/types/types'

const CONFIG_KEY = 'tanstack-devtools-a11y-config'

const Probe = () => {
  const ctx = createAllyContext()
  return (
    <span data-testid="probe">
      <span data-testid="threshold">{ctx.config.threshold}</span>
      <span data-testid="ruleset">{ctx.config.ruleSet}</span>
      <span data-testid="overlays">{String(ctx.config.showOverlays)}</span>
    </span>
  )
}

const mountProvider = (options?: A11yPluginOptions) => {
  const host = document.body.appendChild(document.createElement('div'))
  const dispose = render(
    () =>
      createComponent(ThemeContextProvider, {
        theme: 'dark',
        get children() {
          return createComponent(AllyProvider, {
            options,
            get children() {
              return createComponent(Probe, {})
            },
          })
        },
      }),
    host,
  )
  return { host, dispose }
}

afterEach(() => {
  localStorage.clear()
  document.body.replaceChildren()
})

describe('AllyProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initializes the config store from the provided options', () => {
    const { host, dispose } = mountProvider({
      threshold: 'critical',
      ruleSet: 'wcag2a',
    })
    expect(host.querySelector('[data-testid="threshold"]')).toHaveTextContent(
      'critical',
    )
    expect(host.querySelector('[data-testid="ruleset"]')).toHaveTextContent(
      'wcag2a',
    )
    expect(host.querySelector('[data-testid="overlays"]')).toHaveTextContent(
      'true',
    )
    dispose()
  })

  it('falls back to defaults when no options are provided', () => {
    const { host, dispose } = mountProvider()
    expect(host.querySelector('[data-testid="threshold"]')).toHaveTextContent(
      'serious',
    )
    expect(host.querySelector('[data-testid="ruleset"]')).toHaveTextContent(
      'wcag21aa',
    )
    dispose()
  })

  it('merges options over previously-saved settings while persisting is enabled', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ showOverlays: false, ruleSet: 'section508' }),
    )
    const { host, dispose } = mountProvider({ threshold: 'critical' })
    expect(host.querySelector('[data-testid="threshold"]')).toHaveTextContent(
      'critical',
    )
    // options did not set ruleSet, so the saved value wins over the default
    expect(host.querySelector('[data-testid="ruleset"]')).toHaveTextContent(
      'section508',
    )
    // saved showOverlays:false is preserved (options did not set it)
    expect(host.querySelector('[data-testid="overlays"]')).toHaveTextContent(
      'false',
    )
    dispose()
  })

  it('ignores previously-saved settings when persistSettings is false', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ showOverlays: false, ruleSet: 'section508' }),
    )
    const { host, dispose } = mountProvider({
      persistSettings: false,
      threshold: 'minor',
    })
    expect(host.querySelector('[data-testid="threshold"]')).toHaveTextContent(
      'minor',
    )
    expect(host.querySelector('[data-testid="ruleset"]')).toHaveTextContent(
      'wcag21aa',
    )
    expect(host.querySelector('[data-testid="overlays"]')).toHaveTextContent(
      'true',
    )
    dispose()
  })
})
