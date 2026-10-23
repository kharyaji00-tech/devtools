import { createAngularPanel } from '@tanstack/devtools-utils/angular'
import { A11yDevtoolsCore } from '../../core'

// type
import type { DevtoolsPanelProps } from '@tanstack/devtools-utils/angular'
import type { A11yPluginOptions } from '../../core/types/types'

export interface A11yDevtoolsAngularInit extends DevtoolsPanelProps {
  options?: A11yPluginOptions
}

const [A11yDevtoolsPanel] = createAngularPanel(A11yDevtoolsCore)

export { A11yDevtoolsPanel }
