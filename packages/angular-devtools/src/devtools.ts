import { PLUGIN_CONTAINER_ID, TanStackDevtoolsCore } from '@tanstack/devtools'
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  Injector,
  Type,
  afterNextRender,
  computed,
  createComponent,
  effect,
  inject,
  input,
  isSignal,
  reflectComponentType,
  runInInjectionContext,
  signal,
} from '@angular/core'
import type { Signal, WritableSignal } from '@angular/core'
import type { TanStackDevtoolsPlugin } from '@tanstack/devtools'
import type {
  TanStackDevtoolsAngularFunctionalComponent,
  TanStackDevtoolsAngularInit,
  TanStackDevtoolsAngularPlugin,
  TanStackDevtoolsAngularPluginInputProps,
  TanStackDevtoolsAngularPluginRender,
  TanStackDevtoolsAngularPluginRenderFn,
} from './types'

@Component({
  standalone: true,
  template: '<ng-content></ng-content>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TanStackPluginView {}

@Component({
  selector: 'tanstack-devtools',
  standalone: true,
  template: '<ng-content/>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TanStackDevtools {
  readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef)

  readonly plugins = input<TanStackDevtoolsAngularInit['plugins']>([])
  readonly config = input<TanStackDevtoolsAngularInit['config']>()
  readonly eventBusConfig =
    input<TanStackDevtoolsAngularInit['eventBusConfig']>()

  readonly devtools = signal<TanStackDevtoolsCore | null>(null)
  #mountedByContainer = new Map<
    HTMLElement,
    {
      ref: ComponentRef<any> | null
      inputs: WritableSignal<Record<string, unknown>>
      cancelled: boolean
    }
  >()

  readonly #appRef = inject(ApplicationRef)
  readonly #injector = inject(EnvironmentInjector)
  readonly #viewInjector = inject(Injector)
  readonly #destroyRef = inject(DestroyRef)

  constructor() {
    afterNextRender(() => {
      const hostEl = this.elementRef.nativeElement

      const pluginsMap = this.getPluginsMap()

      const devtoolsCore = new TanStackDevtoolsCore({
        config: this.config(),
        eventBusConfig: this.eventBusConfig(),
        plugins: pluginsMap,
      })

      this.devtools.set(devtoolsCore)

      devtoolsCore.mount(hostEl)
    })

    effect(() => {
      const devtools = this.devtools()
      if (!devtools) {
        return
      }

      const plugins = this.plugins()
      const config = this.config()
      const eventBusConfig = this.eventBusConfig()

      this.#destroyAllComponents()

      devtools.setConfig({
        config,
        eventBusConfig,
        plugins: plugins?.map((p) => this.convertPlugin(p)) ?? [],
      })
    })

    this.#destroyRef.onDestroy(() => {
      this.#destroyAllComponents()
      const devtools = this.devtools()
      if (devtools) {
        devtools.unmount()
        this.devtools.set(null)
      }
    })
  }

  private getPluginsMap(): Array<TanStackDevtoolsPlugin> {
    const plugins = this.plugins()
    if (!plugins) return []

    return plugins.map((plugin) => this.convertPlugin(plugin))
  }

  private convertPlugin(
    plugin: TanStackDevtoolsAngularPlugin,
  ): TanStackDevtoolsPlugin {
    return {
      id: plugin.id,
      defaultOpen: plugin.defaultOpen,
      name:
        typeof plugin.name === 'string'
          ? plugin.name
          : (e, theme) => {
              this.renderComponent(plugin.name as Type<any>, e, {
                theme,
                ...(plugin.inputs ?? {}),
              })
            },
      render: (e, props) => {
        if (!plugin.render) {
          return
        }

        runInInjectionContext(this.#viewInjector, () => {
          if (isClassConstructor<unknown>(plugin.render)) {
            this.renderComponent(plugin.render, e, {
              ...props,
              ...(plugin.inputs ?? {}),
            })
          } else {
            this.#renderComponentFunction(
              plugin.render as Exclude<
                TanStackDevtoolsAngularPluginRender,
                Type<any> | null
              >,
              e,
              {
                ...props,
                ...(plugin.inputs ?? {}),
              },
            )
          }
        })
      },
      destroy: (pluginId) => {
        this.#destroyComponentsInContainer(`${PLUGIN_CONTAINER_ID}-${pluginId}`)
      },
    }
  }

  #normalizeInputs<TInputs extends Record<string, any>>(
    inputs: Signal<TInputs> | (() => TInputs) | TInputs,
  ): () => TInputs {
    return isSignal(inputs)
      ? inputs
      : computed(() => (typeof inputs === 'function' ? inputs() : inputs))
  }

  async #renderComponentFunction(
    renderFn: Exclude<TanStackDevtoolsAngularPluginRender, Type<any> | null>,
    container: HTMLElement,
    inputs:
      | (() => TanStackDevtoolsAngularPluginInputProps)
      | TanStackDevtoolsAngularPluginInputProps,
  ) {
    const desired = this.#resolveInputs(inputs)

    // The core re-invokes `render` whenever the theme or the panel's open state
    // changes, reusing the same mount node. If a mount already lives (or is in
    // flight) for this container, just feed it the new inputs — never start a
    // second mount — matching the Svelte/Vue/React adapters' keyed replace-in-
    // place contract.
    const existing = this.#mountedByContainer.get(container)
    if (existing) {
      existing.inputs.set(desired)
      return
    }

    // Reserve the slot synchronously, before the awaited dynamic import, so a
    // concurrent re-render (the core fires them in quick succession) updates
    // this signal instead of racing into a second mount.
    const entry: {
      ref: ComponentRef<any> | null
      inputs: WritableSignal<Record<string, unknown>>
      cancelled: boolean
    } = { ref: null, inputs: signal(desired), cancelled: false }
    this.#mountedByContainer.set(container, entry)

    let result: TanStackDevtoolsAngularPluginRenderFn
    try {
      result = await renderFn()
    } catch (error) {
      this.#dropIfEntry(container, entry)
      throw error
    }
    if (!result) {
      this.#dropIfEntry(container, entry)
      return
    }

    // Torn down while the import was in flight (e.g. the host's `plugins`
    // input changed); nothing to attach.
    if (entry.cancelled) return

    const accessor = () => entry.inputs()

    if (isClassConstructor(result) || 'default' in result) {
      const instance = 'default' in result ? result.default : result
      if (!instance) {
        this.#dropIfEntry(container, entry)
        return
      }
      const componentRef = createComponent(instance, {
        environmentInjector: this.#injector,
        hostElement: container,
      })
      this.#attachComponentRef(componentRef, accessor)
      entry.ref = componentRef
    } else {
      const componentRef = createComponent(TanStackPluginView, {
        hostElement: container,
        environmentInjector: this.#injector,
        elementInjector: this.#viewInjector,
      })
      this.#attachComponentRef(componentRef, accessor)
      entry.ref = componentRef
      const fn = result as TanStackDevtoolsAngularFunctionalComponent
      const unmount = runInInjectionContext(this.#injector, () =>
        fn(
          accessor as () => TanStackDevtoolsAngularPluginInputProps,
          componentRef.location.nativeElement,
        ),
      )
      componentRef.onDestroy(() => unmount())
    }
  }

  private renderComponent(
    component: Type<any>,
    container: HTMLElement,
    inputs: (() => Record<string, unknown>) | Record<string, unknown>,
  ) {
    const desired = this.#resolveInputs(inputs)

    // See `#renderComponentFunction`: reuse the existing mount for the
    // container and update its inputs, instead of stacking a new one.
    const existing = this.#mountedByContainer.get(container)
    if (existing) {
      existing.inputs.set(desired)
      return
    }

    const entry: {
      ref: ComponentRef<any> | null
      inputs: WritableSignal<Record<string, unknown>>
      cancelled: boolean
    } = { ref: null, inputs: signal(desired), cancelled: false }
    const componentRef = createComponent(component, {
      environmentInjector: this.#injector,
      elementInjector: this.#viewInjector,
      hostElement: container,
    })
    this.#attachComponentRef(componentRef, () => entry.inputs())
    entry.ref = componentRef
    this.#mountedByContainer.set(container, entry)
  }

  #resolveInputs(
    inputs: Signal<Record<string, unknown>> | (() => Record<string, unknown>) | Record<string, unknown>,
  ): Record<string, unknown> {
    return this.#normalizeInputs(inputs)()
  }

  #attachComponentRef(
    componentRef: ComponentRef<any>,
    inputs: () => Record<string, unknown>,
  ) {
    const mirror = reflectComponentType(componentRef.componentType)
    if (!mirror) {
      throw new Error(
        `[@tanstack-devtools/angular] The provided type is not a component`,
      )
    }

    effect(
      () => {
        const latestInputs = inputs()
        for (const input of mirror.inputs) {
          if (input.propName in latestInputs) {
            componentRef.setInput(input.propName, latestInputs[input.propName])
          }
        }
      },
      { injector: componentRef.injector },
    )

    this.#appRef.attachView(componentRef.hostView)
    componentRef.changeDetectorRef.detectChanges()
  }

  // Drop a reserved/in-flight entry only if it still owns the slot, so a later
  // mount for the same container is not clobbered by a stale async resolution.
  #dropIfEntry(container: HTMLElement, entry: { ref: ComponentRef<any> | null }) {
    if (this.#mountedByContainer.get(container) === entry) {
      this.#mountedByContainer.delete(container)
    }
  }

  #destroyComponentRef(componentRef: ComponentRef<any> | null | undefined) {
    if (!componentRef) return
    this.#appRef.detachView(componentRef.hostView)
    componentRef.destroy()
  }

  #destroyComponentsInContainer(containerId: string) {
    for (const [container, entry] of this.#mountedByContainer) {
      if (container.id === containerId) {
        entry.cancelled = true
        this.#destroyComponentRef(entry.ref)
        this.#mountedByContainer.delete(container)
      }
    }
  }

  #destroyAllComponents() {
    for (const entry of this.#mountedByContainer.values()) {
      entry.cancelled = true
      this.#destroyComponentRef(entry.ref)
    }
    this.#mountedByContainer.clear()
  }
}

function isClassConstructor<T>(
  o: unknown,
): o is new (...args: Array<any>) => T {
  return typeof o === 'function' && !!o.prototype && !!o.prototype.constructor
}
