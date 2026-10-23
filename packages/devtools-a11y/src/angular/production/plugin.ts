import { createAngularPlugin } from '@tanstack/devtools-utils/angular'
import { A11yDevtoolsPanel } from './A11yDevtools'

import type { A11yPluginOptions } from '../../core/types/types'

export function a11yDevtoolsPlugin(options?: A11yPluginOptions) {
  return createAngularPlugin({
    name: 'TanStack A11y',
    render: () => (inputs, host) =>
      A11yDevtoolsPanel()(() => ({ ...inputs(), options }), host),
  })[0]()
}
