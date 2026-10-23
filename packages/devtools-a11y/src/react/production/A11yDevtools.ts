import { createReactPanel } from '@tanstack/devtools-utils/react'
import { A11yDevtoolsCore } from '../../core'

// type
import type { DevtoolsPanelProps } from '@tanstack/devtools-utils/react'
import type { A11yPluginOptions } from '../../core/types/types'

export interface A11yDevtoolsReactInit extends DevtoolsPanelProps {
  options?: A11yPluginOptions
}

const [A11yDevtoolsPanel] = createReactPanel(A11yDevtoolsCore)

export { A11yDevtoolsPanel }
