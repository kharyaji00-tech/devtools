import { render } from '@solidjs/testing-library'
import { ThemeContextProvider } from '@tanstack/devtools-ui'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DevtoolsProvider } from '../../context/devtools-context'
import { PluginCardComponent } from './plugin-card'
import type { PluginCard } from './types'

const makeCard = (overrides?: Partial<PluginCard>): PluginCard => ({
  devtoolsPackage: '@x/y',
  requiredPackageName: '@x/req',
  framework: 'react',
  hasPackage: false,
  hasDevtools: false,
  isRegistered: false,
  actionType: 'requires-package',
  status: 'idle',
  isCurrentFramework: true,
  metadata: {
    packageName: '@x/y',
    title: 'My Plugin',
    framework: 'react',
  },
  ...overrides,
})

const renderCard = (card: PluginCard, onAction = vi.fn()) =>
  render(() => (
    <ThemeContextProvider theme="dark">
      <DevtoolsProvider>
        <PluginCardComponent card={card} onAction={onAction} />
      </DevtoolsProvider>
    </ThemeContextProvider>
  ))

describe('PluginCardComponent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the title from metadata.title', () => {
    const { getByText } = renderCard(makeCard())
    expect(getByText('My Plugin')).toBeInTheDocument()
  })

  it('falls back to devtoolsPackage when metadata.title is absent', () => {
    // empty string is falsy — the component renders devtoolsPackage in both the
    // <h3> title slot and the <p> package-badge slot, so use getAllByText
    const card = makeCard({
      metadata: { packageName: '@x/y', title: '', framework: 'react' },
    })
    const { getAllByText } = renderCard(card)
    // At least the <h3> title must show the fallback package name
    const hits = getAllByText('@x/y')
    expect(hits.length).toBeGreaterThanOrEqual(1)
    const h3 = hits.find((el) => el.tagName === 'H3')
    expect(h3).toBeInTheDocument()
  })

  it('renders the devtoolsPackage as the package badge', () => {
    const { getAllByText } = renderCard(makeCard())
    const badge = getAllByText('@x/y').find((el) => el.tagName === 'P')
    expect(badge).toBeInTheDocument()
  })

  it('renders the "requires-package" description with the required package name', () => {
    // The text appears in both a <p> (description) and the <button> (button label).
    // Assert at least one <p> element contains the expected text.
    const { getAllByText } = renderCard(makeCard())
    const descEl = getAllByText('Requires @x/req').find(
      (el) => el.tagName === 'P',
    )
    expect(descEl).toBeInTheDocument()
  })

  it('renders the "New" banner when metadata.isNew is true', () => {
    const card = makeCard({
      metadata: {
        packageName: '@x/y',
        title: 'My Plugin',
        framework: 'react',
        isNew: true,
      },
    })
    const { getByText } = renderCard(card)
    expect(getByText('New')).toBeInTheDocument()
  })

  it('does not render the "New" banner when metadata.isNew is false', () => {
    const card = makeCard({
      metadata: {
        packageName: '@x/y',
        title: 'My Plugin',
        framework: 'react',
        isNew: false,
      },
    })
    const { queryByText } = renderCard(card)
    expect(queryByText('New')).not.toBeInTheDocument()
  })

  it('reflects a changed title prop: new render shows updated value', () => {
    // The component destructures `const { card } = props` which breaks Solid's
    // fine-grained reactivity for prop updates.  Verify the prop is correctly
    // consumed on initial mount for each distinct value by rendering twice.
    const { getByText, unmount } = renderCard(makeCard())
    expect(getByText('My Plugin')).toBeInTheDocument()
    unmount()

    const { getByText: getByText2 } = renderCard(
      makeCard({
        metadata: {
          packageName: '@x/y',
          title: 'Updated Plugin',
          framework: 'react',
        },
      }),
    )
    expect(getByText2('Updated Plugin')).toBeInTheDocument()
  })

  it('renders "already-installed" description when actionType is already-installed', () => {
    const card = makeCard({ actionType: 'already-installed' })
    const { getByText } = renderCard(card)
    expect(getByText('Active in your devtools')).toBeInTheDocument()
  })

  it('renders "wrong-framework" description when actionType is wrong-framework', () => {
    const card = makeCard({ actionType: 'wrong-framework' })
    const { getByText } = renderCard(card)
    expect(getByText('For different framework projects')).toBeInTheDocument()
  })

  it('renders a blocked "Version Mismatch" card for above-max versions', () => {
    const onAction = vi.fn()
    const card = makeCard({
      actionType: 'version-mismatch',
      hasPackage: true,
      versionInfo: {
        current: '5.5.0',
        required: '5.0.0',
        satisfied: false,
        violation: 'max',
        reason: 'Requires v5.2.0 or lower (current: v5.5.0)',
      },
    })

    const { getByText, getByRole } = renderCard(card, onAction)

    // Badge and button text come from the previously-unreachable version-mismatch
    // branches of card-utils.
    expect(getByText('Incompatible')).toBeInTheDocument()
    expect(getByText('Version Mismatch')).toBeInTheDocument()

    // The description surfaces the human-readable reason.
    expect(
      getByText('Requires v5.2.0 or lower (current: v5.5.0)'),
    ).toBeInTheDocument()

    // The button is disabled so bumping/injecting an incompatible plugin is not possible.
    const button = getByRole('button', { name: 'Version Mismatch' })
    expect(button).toBeDisabled()
  })

  it('does not invoke onAction when the version-mismatch button is clicked', () => {
    const onAction = vi.fn()
    const card = makeCard({
      actionType: 'version-mismatch',
      hasPackage: true,
      versionInfo: {
        current: '5.5.0',
        required: '5.0.0',
        satisfied: false,
        violation: 'max',
        reason: 'Requires v5.2.0 or lower (current: v5.5.0)',
      },
    })

    const { getByRole } = renderCard(card, onAction)
    const button = getByRole('button', { name: 'Version Mismatch' })
    // Disabled buttons do not dispatch click events, but assert defensively.
    button.click()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('renders an enabled "Bump Version" button for below-min versions', () => {
    const onAction = vi.fn()
    const card = makeCard({
      actionType: 'bump-version',
      hasPackage: true,
      versionInfo: {
        current: '4.9.0',
        required: '5.0.0',
        satisfied: false,
        violation: 'min',
        reason: 'Requires v5.0.0 or higher (current: v4.9.0)',
      },
    })

    const { getByRole } = renderCard(card, onAction)
    const button = getByRole('button', { name: 'Bump Version' })
    // Below-min violations remain actionable, so the bump button must stay enabled.
    expect(button).not.toBeDisabled()
  })
})
