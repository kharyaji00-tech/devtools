/** @jsxImportSource solid-js */

import { createSolidPlugin } from '@tanstack/devtools-utils/solid'
import { A11yDevtoolsPanel } from './A11yDevtools'

import type { A11yPluginOptions } from '../../core/types/types'
import type { DevtoolsPanelProps } from '@tanstack/devtools-utils/solid'

export function a11yDevtoolsPlugin(options?: A11yPluginOptions) {
  return createSolidPlugin({
    name: 'TanStack A11y',
    Component: (props: DevtoolsPanelProps) => (
      <A11yDevtoolsPanel {...props} options={options} />
    ),
  })[0]()
}
