import { defineComponent, h, onMounted, onUnmounted, ref } from 'vue'
import type { TanStackDevtoolsPluginProps } from '@tanstack/devtools'
import type { DefineComponent } from 'vue'

export interface DevtoolsPanelProps extends TanStackDevtoolsPluginProps {}

export function createVuePanel<
  TComponentProps extends DevtoolsPanelProps,
  TCoreDevtoolsClass extends {
    mount: (el: HTMLElement, props?: TanStackDevtoolsPluginProps) => void
    unmount: () => void
  },
>(CoreClass: new (props: TComponentProps) => TCoreDevtoolsClass) {
  const props = {
    props: {
      type: Object as () => DevtoolsPanelProps,
    },
    devtoolsProps: {
      type: Object as () => TComponentProps,
    },
  }

  const Panel = defineComponent({
    props,
    setup(config) {
      const devToolRef = ref<HTMLElement | null>(null)
      let instance: TCoreDevtoolsClass | null = null
      let el: HTMLElement | null = null

      onMounted(() => {
        instance = new CoreClass(config.devtoolsProps as TComponentProps)
        el = devToolRef.value
        if (el) {
          instance.mount(el, config.props)
        }
      })

      onUnmounted(() => {
        if (el) {
          instance?.unmount()
        }
        instance = null
        el = null
      })

      return () => {
        return h('div', {
          style: { height: '100%' },
          ref: devToolRef,
        })
      }
    },
  })

  const NoOpPanel = defineComponent({
    props,
    setup() {
      return () => null
    },
  })

  return [Panel, NoOpPanel] as unknown as [
    DefineComponent<{
      theme?: DevtoolsPanelProps['theme']
      devtoolsProps: TComponentProps
    }>,
    DefineComponent<{
      theme?: DevtoolsPanelProps['theme']
      devtoolsProps: TComponentProps
    }>,
  ]
}
