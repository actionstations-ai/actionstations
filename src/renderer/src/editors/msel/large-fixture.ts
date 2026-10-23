// Test-only: a scenario with many MSEL rows (render-count and virtualization tests, #201).
import type { MselRow, Scenario } from '@shared/schemas/scenario'
import { formatExerciseTime } from '@shared/schemas/common'

/** `base` with `count` rows spread evenly over its phases (ids R-001…, times in window). */
export function largeScenario(base: Scenario, count: number): Scenario {
  const phases = [...base.phases].sort((a, b) => a.index - b.index)
  const template = base.msel.find((r) => r.purposeTag !== 'STARTEX') ?? base.msel[0]!
  const perPhase = Math.ceil(count / phases.length)
  const msel: MselRow[] = Array.from({ length: count }, (_, i) => {
    const phase = phases[Math.floor(i / perPhase)]!
    const minute = phase.index * 60 + Math.floor(((i % perPhase) * 60) / perPhase)
    const { injectId: _inject, ...rest } = template
    return {
      ...rest,
      id: `R-${String(i + 1).padStart(3, '0')}`,
      phaseId: phase.id,
      time: formatExerciseTime(minute),
      event: `Event ${i + 1}`,
      citations: [],
      locked: false,
    }
  })
  return { ...base, msel }
}

/**
 * Give happy-dom a layout for windowed lists: elements matching `scroller` are `viewport` px
 * tall and every windowed row (it carries `data-index`) is `rowHeight` px. Returns the restore.
 */
export function stubListLayout(scroller: string, viewport = 600, rowHeight = 50): () => void {
  const html = HTMLElement.prototype
  const client = Object.getOwnPropertyDescriptor(html, 'clientHeight')
  const offset = Object.getOwnPropertyDescriptor(html, 'offsetHeight')
  Object.defineProperty(html, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.matches(scroller) ? viewport : 0
    },
  })
  Object.defineProperty(html, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-index') ? rowHeight : 0
    },
  })
  return () => {
    if (client) Object.defineProperty(html, 'clientHeight', client)
    if (offset) Object.defineProperty(html, 'offsetHeight', offset)
  }
}
