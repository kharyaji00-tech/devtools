import { describe, expect, it } from 'vitest'
import { runCustomRules } from '../src/core/utils/custom-audit.utils'
import type { A11yIssue, CustomRulesConfig } from '../src/core/types/types'

function audit(html: string, config: CustomRulesConfig = {}): Array<A11yIssue> {
  const container = document.createElement('div')
  container.innerHTML = html
  return runCustomRules(container, config)
}

type RuleKey = keyof CustomRulesConfig

const only = (rule: RuleKey): CustomRulesConfig => ({
  clickHandlerOnNonInteractive: false,
  mouseOnlyEventHandlers: false,
  staticElementInteraction: false,
  [rule]: true,
})

const ruleIds = (issues: Array<A11yIssue>): Array<string> =>
  issues.map((issue) => issue.ruleId).sort()

describe('custom-audit: disabled interactive elements are exempt', () => {
  it('emits no issues for a disabled <button> with an onclick handler (bug repro)', () => {
    const issues = audit('<button disabled onclick="void 0">Click</button>')
    expect(issues).toEqual([])
  })

  it('emits no issues for a disabled <button> with a React-style onClick handler', () => {
    const container = document.createElement('div')
    const button = document.createElement('button')
    button.setAttribute('disabled', '')
    ;(button as unknown as Record<string, unknown>).__reactProps$test = {
      onClick: () => {},
    }
    container.appendChild(button)
    expect(runCustomRules(container)).toEqual([])
  })

  it('exempts a disabled <button role="button"> from the static-element-interaction rule', () => {
    expect(
      ruleIds(
        audit(
          '<button role="button" disabled onclick="void 0">x</button>',
          only('staticElementInteraction'),
        ),
      ),
    ).toEqual([])
  })

  it('emits no issues for a disabled <input tabindex="0"> with a click handler', () => {
    expect(audit('<input disabled tabindex="0" onclick="void 0">')).toEqual([])
  })
})

describe('custom-audit: no regressions for non-disabled / non-interactive elements', () => {
  it('still flags a <div onclick> as a serious click-handler-on-non-interactive issue', () => {
    const issues = audit(
      '<div onclick="void 0">bad div</div>',
      only('clickHandlerOnNonInteractive'),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.ruleId).toBe('click-handler-on-non-interactive')
    expect(issues[0]!.impact).toBe('serious')
  })

  it('still flags a <div onmouseover> as a serious mouse-only-event-handlers issue', () => {
    const issues = audit(
      '<div onmouseover="void 0">hover</div>',
      only('mouseOnlyEventHandlers'),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.ruleId).toBe('mouse-only-event-handlers')
    expect(issues[0]!.impact).toBe('serious')
  })

  it('does not flag a normal (non-disabled) <button onclick>', () => {
    expect(audit('<button onclick="void 0">ok</button>')).toEqual([])
  })
})

describe('custom-audit: isFocusable disabled handling is scoped to form controls', () => {
  it('keeps a <div disabled tabindex="0" onclick> focusable (moderate finding, not serious "no keyboard access")', () => {
    // `disabled` is not honored on a <div>, so it remains focusable via
    // tabindex and must get the moderate "tabindex but no keyboard handler"
    // finding rather than the serious "no keyboard access at all" finding.
    // This guards against broadening the disabled check beyond form controls.
    const issues = audit(
      '<div disabled tabindex="0" onclick="void 0">x</div>',
      only('clickHandlerOnNonInteractive'),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.impact).toBe('moderate')
  })
})
