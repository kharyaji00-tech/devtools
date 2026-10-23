import { createSolidPanel } from '@tanstack/devtools-utils/solid'
import { A11yDevtoolsCore } from '../../core'

import type { DevtoolsPanelProps } from '@tanstack/devtools-utils/solid'
import type { A11yPluginOptions } from '../../core/types/types'

export interface A11yDevtoolsSolidInit extends DevtoolsPanelProps {
  options?: A11yPluginOptions
}

const [A11yDevtoolsPanel] =
  createSolidPanel<A11yDevtoolsSolidInit>(A11yDevtoolsCore)

export { A11yDevtoolsPanel }
