// How far a scenario is from being runnable (#227): which MSEL rows have an inject, which
// injects are rendered, whether lint reports errors. Drives the scenario status badge, the
// next-action bar and the project Overview checklist, so they all tell the same story.
import type { Inject } from '@shared/schemas/inject'
import type { LintWarning, Scenario } from '@shared/schemas/scenario'
import { GROUNDING_UNSUPPORTED } from '@shared/schemas/grounding'
import { deckEntries } from '../../editors/inject/deck-model'

export type ReadinessStatus = 'draft' | 'injects-written' | 'media-rendered' | 'ready' | 'archived'

/** 'evaluation': the scenario is ready but has no evaluation guides yet (#421, FR-12). */
export type NextAction =
  'msel' | 'write-injects' | 'render-media' | 'fix-errors' | 'evaluation' | 'run'

/** The scenario can be exported and facilitated (the guides are an addition, not a gate). */
export const isReadyNext = (next: NextAction): boolean => next === 'run' || next === 'evaluation'

export interface Readiness {
  /** MSEL rows (each becomes one inject, control cards included). */
  rows: number
  written: number
  rendered: number
  errors: number
  warnings: number
  /** Items the source check found unsupported (#423): mentioned, never blocking. */
  unsupported: number
  status: ReadinessStatus
  next: NextAction
}

export const STATUS_LABEL: Record<ReadinessStatus, string> = {
  draft: 'Draft',
  'injects-written': 'Injects written',
  'media-rendered': 'Media rendered',
  ready: 'Ready',
  archived: 'Archived',
}

export const STATUS_TONE = {
  draft: 'neutral',
  'injects-written': 'warn',
  'media-rendered': 'warn',
  ready: 'ok',
  archived: 'neutral',
} as const

export function readiness(
  scenario: Scenario,
  injects: readonly Inject[],
  lint: readonly LintWarning[] | undefined,
): Readiness {
  const entries = deckEntries(scenario, [...injects])
  const rows = entries.length
  const written = entries.filter((e) => e.inject).length
  const rendered = entries.filter((e) => e.inject && e.thumbnail).length
  const list = lint ?? scenario.warnings
  const errors = list.filter((w) => w.severity === 'error').length
  const warnings = list.filter((w) => w.severity === 'warning').length
  const unsupported = list.filter((w) => w.code === GROUNDING_UNSUPPORTED).length
  const next: NextAction = !rows
    ? 'msel'
    : written < rows
      ? 'write-injects'
      : rendered < rows
        ? 'render-media'
        : errors
          ? 'fix-errors'
          : !(scenario.evaluation?.eegs.length ?? 0)
            ? 'evaluation'
            : 'run'
  return {
    rows,
    written,
    rendered,
    errors,
    warnings,
    unsupported,
    next,
    status: statusOf(scenario, next),
  }
}

function statusOf(scenario: Scenario, next: NextAction): ReadinessStatus {
  if (scenario.status === 'archived') return 'archived'
  if (isReadyNext(next)) return 'ready'
  if (next === 'fix-errors') return 'media-rendered'
  if (next === 'render-media') return 'injects-written'
  return 'draft'
}
