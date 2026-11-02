/** @jsxImportSource solid-js */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'solid-js/web'
import { ThemeContextProvider } from '@tanstack/devtools-ui'
import { AllyProvider, createAllyContext } from '../src/core/contexts/allyContext'
import { Shell } from '../src/core/components/Shell'
import { SEVERITY_LABELS, clearHighlights } from '../src/core/utils/ui.utils'
import type { JSX } from 'solid-js'
import type {
  A11yAuditOptions,
  A11yAuditResult,
  A11yIssue,
  A11ySummary,
  SeverityThreshold,
} from '../src/core/types/types'

type AllyContext = ReturnType<typeof createAllyContext>

// Mock the audit utilities so the suite controls `runAudit` and avoids loading
// axe-core in jsdom. `filterIssuesAboveThreshold` and `IMPACTS` are reimplemented
// to match the real implementations the components import.
const { mockRunAudit } = vi.hoisted(() => ({
  mockRunAudit: vi.fn<
    (options?: A11yAuditOptions) => Promise<A11yAuditResult>
  >(),
}))

vi.mock('../src/core/utils/ally-audit.utils', () => {
  const SEVERITY_ORDER: Record<SeverityThreshold, number> = {
    critical: 4,
    serious: 3,
    moderate: 2,
    minor: 1,
  }
  return {
    runAudit: mockRunAudit,
    filterIssuesAboveThreshold: (
      issues: Array<A11yIssue>,
      threshold: SeverityThreshold,
    ) =>
      issues.filter(
        (issue) => SEVERITY_ORDER[issue.impact] >= SEVERITY_ORDER[threshold],
      ),
    IMPACTS: ['critical', 'serious', 'moderate', 'minor'] as const,
  }
})

// Build a fixed audit: 2 critical / 1 serious / 3 moderate / 2 minor = 8 issues.
function makeIssue(
  id: string,
  impact: SeverityThreshold,
  ruleId: string,
): A11yIssue {
  return {
    id,
    ruleId,
    impact,
    message: `${impact} issue ${id}`,
    help: 'Help',
    helpUrl: 'https://example.test/help',
    wcagTags: ['wcag2a'],
    nodes: [
      {
        selector: `#${id}`,
        html: `<div id="${id}"></div>`,
        failureSummary: 'Fix',
      },
    ],
    meetsThreshold: true,
    timestamp: 1,
  }
}

const MOCK_ISSUES: Array<A11yIssue> = [
  makeIssue('c1', 'critical', 'image-alt'),
  makeIssue('c2', 'critical', 'button-name'),
  makeIssue('s1', 'serious', 'color-contrast'),
  makeIssue('m1', 'moderate', 'heading-order'),
  makeIssue('m2', 'moderate', 'heading-order'),
  makeIssue('m3', 'moderate', 'landmark-main'),
  makeIssue('mi1', 'minor', 'document-title'),
  makeIssue('mi2', 'minor', 'meta-viewport'),
]

function buildAudit(issues: Array<A11yIssue> = MOCK_ISSUES): A11yAuditResult {
  const summary: A11ySummary = {
    total: issues.length,
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    passes: 0,
    incomplete: 0,
  }
  for (const issue of issues) {
    summary[issue.impact]++
  }
  return {
    issues,
    summary,
    timestamp: 1,
    url: '',
    context: 'document',
    duration: 1,
  }
}

const ORDER: Array<SeverityThreshold> = [
  'critical',
  'serious',
  'moderate',
  'minor',
]

let host: HTMLDivElement
let dispose: (() => void) | undefined
let ally: AllyContext

function ContextProbe(): JSX.Element {
  ally = createAllyContext()
  return null
}

// `child` is a thunk so the inner component is constructed inside the
// ThemeContextProvider/AllyProvider tree (Solid captures the reactive owner
// at createComponent-call time).
function mount(child: () => JSX.Element) {
  host = document.body.appendChild(document.createElement('div'))
  dispose = render(
    () => (
      <ThemeContextProvider theme="dark">
        <AllyProvider>
          <ContextProbe />
          {child()}
        </AllyProvider>
      </ThemeContextProvider>
    ),
    host,
  )
}

// Summary buttons are the only buttons in the panel with exactly two child
// divs where the first child's text is a bare count number. This reliably
// separates them from header buttons and issue-card buttons.
function textOf(el: Node | null | undefined): string {
  return el?.textContent ?? ''
}

function getSummaryButtons(): Array<HTMLButtonElement> {
  return [...host.querySelectorAll('button')].filter((btn) => {
    const first = btn.children[0]
    return (
      btn.children.length === 2 &&
      first?.tagName === 'DIV' &&
      /^\d+$/.test(textOf(first))
    )
  })
}

function getSummaryCounts(): Array<number> {
  return getSummaryButtons().map((btn) => Number(textOf(btn.children[0]) || '0'))
}

function getSummaryButton(impact: SeverityThreshold): HTMLButtonElement {
  const label = SEVERITY_LABELS[impact]
  return getSummaryButtons().find(
    (btn) => textOf(btn.children[1]) === label,
  ) as HTMLButtonElement
}

function getActiveImpact(): SeverityThreshold | null {
  const active = getSummaryButtons().find((btn) =>
    btn.hasAttribute('data-tsd-selected'),
  )
  if (!active) return null
  const label = textOf(active.children[1])
  return ORDER.find((impact) => SEVERITY_LABELS[impact] === label) ?? null
}

function getHeaderTotal(): string {
  for (const span of host.querySelectorAll('span')) {
    const text = textOf(span)
    if (/^\d+ issues?$/.test(text)) return text
  }
  return ''
}

function countIssueCards(): number {
  return host.querySelectorAll('article').length
}

function sectionTitles(): Array<string> {
  return [...host.querySelectorAll('h3')].map((h) => textOf(h))
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  dispose?.()
  clearHighlights()
  document.getElementById('tsd-a11y-highlight-styles')?.remove()
  document.body.replaceChildren()
  mockRunAudit.mockReset()
  localStorage.clear()
})

beforeEach(() => {
  mockRunAudit.mockResolvedValue(buildAudit())
})

describe('severity summary counts', () => {
  beforeEach(() => {
    mount(() => <Shell />)
    ally.setConfig('threshold', 'minor')
    ally.setConfig('showOverlays', false)
  })

  it('shows the full per-severity distribution and header total with no filter active', async () => {
    await ally.triggerAllyScan()
    await flush()

    expect(getSummaryCounts()).toEqual([2, 1, 3, 2])
    expect(getHeaderTotal()).toBe('8 issues')
    expect(getActiveImpact()).toBeNull()
    expect(countIssueCards()).toBe(8)
    expect(sectionTitles()).toEqual([
      'Critical (2)',
      'Serious (1)',
      'Moderate (3)',
      'Minor (2)',
    ])
  })

  it('keeps full per-severity counts and header total while the Serious filter is active', async () => {
    await ally.triggerAllyScan()
    await flush()

    getSummaryButton('serious').click()
    await flush()

    expect(getSummaryCounts()).toEqual([2, 1, 3, 2])
    expect(getHeaderTotal()).toBe('8 issues')
    expect(getActiveImpact()).toBe('serious')
    expect(countIssueCards()).toBe(1)
    expect(sectionTitles()).toEqual(['Serious (1)'])
  })

  it('keeps non-active severity counts visible when threshold changes while a filter is active', async () => {
    await ally.triggerAllyScan()
    await flush()

    getSummaryButton('moderate').click()
    await flush()

    // Raise threshold to serious: moderate/minor disappear from the list and
    // the active section, but the Critical/Serious summary counts must stay
    // visible (not collapse to 0 under the active moderate filter).
    ally.setConfig('threshold', 'serious')
    await flush()

    expect(getSummaryCounts()).toEqual([2, 1, 0, 0])
    expect(getHeaderTotal()).toBe('3 issues')
    expect(getActiveImpact()).toBe('moderate')
    expect(countIssueCards()).toBe(0)
    expect(sectionTitles()).toEqual(['Moderate (0)'])
  })

  it('keeps disabled-rule exclusion consistent while a severity filter is active', async () => {
    await ally.triggerAllyScan()
    await flush()

    getSummaryButton('critical').click()
    await flush()

    ally.setConfig('disabledRules', ['image-alt'])
    await flush()

    expect(getSummaryCounts()).toEqual([1, 1, 3, 2])
    expect(getHeaderTotal()).toBe('7 issues')
    expect(getActiveImpact()).toBe('critical')
    expect(countIssueCards()).toBe(1)
    expect(sectionTitles()).toEqual(['Critical (1)'])
  })

  it('renders the success state with no summary buttons or issue cards', async () => {
    mockRunAudit.mockResolvedValue(buildAudit([]))
    await ally.triggerAllyScan()
    await flush()

    expect(host.textContent).toContain('No accessibility issues found!')
    expect(getSummaryButtons()).toEqual([])
    expect(countIssueCards()).toBe(0)
  })

  it('injects overlay styles after a scan with a severity filter active', async () => {
    ally.setConfig('showOverlays', true)
    await ally.triggerAllyScan()
    await flush()

    getSummaryButton('serious').click()
    await flush()

    // The overlay effect still consumes filteredIssues (the filtered list);
    // selectors in the mock audit match no DOM, so only the style element is
    // injected. The summary counts must stay full regardless.
    expect(getSummaryCounts()).toEqual([2, 1, 3, 2])
    expect(document.getElementById('tsd-a11y-highlight-styles')).not.toBeNull()
  })
})
