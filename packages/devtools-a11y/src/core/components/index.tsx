/** @jsxImportSource solid-js */
import { ThemeContextProvider } from '@tanstack/devtools-ui'
import { AllyProvider } from '../contexts/allyContext'
import { Shell } from './Shell'

import type { TanStackDevtoolsTheme } from '@tanstack/devtools-ui'
import type { A11yPluginOptions } from '../types/types'

interface DevtoolsProps {
  theme: TanStackDevtoolsTheme
  options?: A11yPluginOptions
}

export default function Devtools(props: DevtoolsProps) {
  return (
    <ThemeContextProvider theme={props.theme}>
      <AllyProvider options={props.options}>
        <Shell />
      </AllyProvider>
    </ThemeContextProvider>
  )
}
