import { ChangeDetectionStrategy, Component, input } from '@angular/core'

@Component({
  selector: `demo-panel`,
  template: ` <div data-testid="demo-plugin">demo plugin content</div> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DemoPanel {
  // Automatically added by the devtools host
  readonly theme = input<string>()

  constructor() {
    // Test instrumentation: count how many DemoPanel instances the host mounts.
    // The devtools core re-invokes `render` on theme/open-state changes; the
    // adapter must reuse the existing mount, so this counter must stay at 1
    // across toggles. A growing counter means a new component (and its
    // change-detector/listeners) leaked into the ApplicationRef each re-render.
    ;(globalThis as any).__demoPanelMounts = ((globalThis as any).__demoPanelMounts ?? 0) + 1
  }
}
