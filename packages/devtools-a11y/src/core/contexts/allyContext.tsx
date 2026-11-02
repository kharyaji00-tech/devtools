/** @jsxImportSource solid-js */

import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  useContext as getContext,
} from 'solid-js'
import { createStore } from 'solid-js/store'
import { createTheme } from '@tanstack/devtools-ui'
import { filterIssuesAboveThreshold, runAudit } from '../utils/ally-audit.utils'
import { mergeConfig, saveConfig } from '../utils/config.utils'
import { clearHighlights, highlightAllIssues } from '../utils/ui.utils'

// types
import type {
  A11yAuditResult,
  A11yPluginOptions,
  SeverityThreshold,
} from '../types/types'
import type { ParentComponent } from 'solid-js'

//
// context state
//

function createAllyValue() {
  const { theme } = createTheme()
  const [config, setConfig] =
    createStore<Required<A11yPluginOptions>>(mergeConfig())

  const [allyResult, setAllyResult] = createStore<{
    audit?: A11yAuditResult
    state: 'init' | 'scanning' | 'done'
  }>({ state: 'init' })

  const [impactKey, setImpactKey] = createSignal<SeverityThreshold | 'all'>(
    'all',
  )

  const triggerAllyScan = async () => {
    setAllyResult('state', 'scanning')
    setAllyResult({ audit: await runAudit(config), state: 'done' })
  }

  // threshold + disabledRules only — summary counts and the header total
  // read from this so they don't collapse under an active impactKey filter
  const unfilteredByImpact = createMemo(() => {
    if (allyResult.state !== 'done' || !allyResult.audit?.issues) return []
    let results = allyResult.audit.issues

    results = filterIssuesAboveThreshold(results, config.threshold)

    // removes excluded rules
    if (config.disabledRules.length > 0) {
      results = results.filter(
        (issue) => !config.disabledRules.includes(issue.ruleId),
      )
    }

    return results
  })

  // filteredIssues additionally applies the active impactKey severity filter
  // (consumed by the rendered list and overlay highlights, NOT the summary)
  const filteredIssues = createMemo(() =>
    impactKey() === 'all'
      ? unfilteredByImpact()
      : unfilteredByImpact().filter((val) => val.impact === impactKey()),
  )

  createEffect(() => {
    if (config.showOverlays === false) {
      clearHighlights()
      return
    }

    if (allyResult.state === 'done')
      highlightAllIssues(filteredIssues(), theme())
  })

  createEffect(() => {
    saveConfig(config)
  })

  return {
    impactKey,
    setImpactKey,

    filteredIssues,
    unfilteredByImpact,

    triggerAllyScan,

    setConfig,
    config,

    allyResult,
    theme,
  }
}

type ContextType = ReturnType<typeof createAllyValue>

//
// context
//

const AllyContext = createContext<ContextType | null>(null)

type AllyProviderProps = {}

export const AllyProvider: ParentComponent<AllyProviderProps> = (props) => {
  const value = createAllyValue()

  return (
    <AllyContext.Provider value={value}>{props.children}</AllyContext.Provider>
  )
}

export function createAllyContext() {
  const context = getContext(AllyContext)

  if (context === null) {
    throw new Error('createAllyContext must be used within an AllyProvider')
  }

  return context
}
