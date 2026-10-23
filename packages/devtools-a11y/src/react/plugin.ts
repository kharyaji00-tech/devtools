import { createElement } from 'react'
import { createReactPlugin } from '@tanstack/devtools-utils/react'
import { A11yDevtoolsPanel } from './A11yDevtools'

import type { A11yDevtoolsReactInit } from './A11yDevtools'
import type { A11yPluginOptions } from '../core/types/types'
import type { DevtoolsPanelProps } from '@tanstack/devtools-utils/react'

export function a11yDevtoolsPlugin(options?: A11yPluginOptions) {
  return createReactPlugin({
    name: 'TanStack A11y',
    Component: (props: DevtoolsPanelProps) =>
      createElement(A11yDevtoolsPanel, {
        ...props,
        options,
      } as A11yDevtoolsReactInit),
  })[0]()
}

export function a11yDevtoolsNoOpPlugin() {
  return createReactPlugin({
    name: 'TanStack A11y',
    Component: A11yDevtoolsPanel,
  })[1]()
}
