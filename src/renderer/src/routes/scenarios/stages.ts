import type { StageRun } from '@shared/schemas/scenario'

const LABELS: Record<string, string> = {
  ideate: 'Ideas',
  scenario_overview: 'Scenario overview',
  objectives_roles: 'Objectives & roles',
  phase_plan: 'Phase plan',
  msel_phase: 'MSEL phase',
  inject_text: 'Inject text',
  inject_media_brief: 'Media brief',
  media_render: 'Media render',
  controller_handbook: 'Controller handbook',
  rubric: 'Rubric',
  eeg: 'Evaluation guides',
  player_briefing: 'Player briefing',
  hotwash: 'Hot wash',
  sitman: 'SitMan modules',
  critique: 'Critique',
}

export const stageLabel = (stage: string): string => LABELS[stage] ?? stage

/** Latest run per (stage, item), in the order stages first appeared. */
export function latestRuns(provenance: StageRun[]): StageRun[] {
  const byKey = new Map<string, StageRun>()
  for (const run of provenance) {
    const key = `${run.stage}:${run.itemId ?? ''}`
    const prev = byKey.get(key)
    if (!prev || prev.startedAt <= run.startedAt) byKey.set(key, run)
  }
  return [...byKey.values()]
}

export function runDuration(run: StageRun): string {
  if (!run.finishedAt) return '—'
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`
}

export function runTokens(run: StageRun): string {
  if (run.inputTokens === undefined && run.outputTokens === undefined) return '—'
  return `${(run.inputTokens ?? 0).toLocaleString()} in / ${(run.outputTokens ?? 0).toLocaleString()} out`
}

/** US dollars, with more digits below a cent ("$0.0042", "$1.25"). */
export function formatUsd(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

/**
 * What a run cost, for remote providers that report a price (#218). Local providers record
 * 0 and get no figure: '' means "show nothing".
 */
export function runCost(run: StageRun): string {
  return run.costUsd && run.costUsd > 0 ? formatUsd(run.costUsd) : ''
}

/** Sum of the runs' reported costs ('' when none reported one). */
export function totalCost(runs: StageRun[]): string {
  const sum = runs.reduce((n, r) => n + (r.costUsd && r.costUsd > 0 ? r.costUsd : 0), 0)
  return sum > 0 ? formatUsd(sum) : ''
}

/** Human label for a per-item stage run: "Phase 2: The Crisis" instead of the phase ULID. */
export function itemLabel(itemId: string | undefined, labels: Record<string, string> = {}): string {
  if (!itemId) return ''
  return labels[itemId] ?? itemId
}

/** Per-inject stages: one run per inject, shown as one collapsible group per stage. */
export const GROUPED_STAGES: ReadonlySet<string> = new Set([
  'inject_text',
  'inject_media_brief',
  'media_render',
])

export type StatusCounts = Partial<Record<StageRun['status'], number>>

export type TimelineEntry =
  | { kind: 'run'; run: StageRun }
  | { kind: 'group'; stage: StageRun['stage']; runs: StageRun[]; counts: StatusCounts }

export function countStatuses(runs: StageRun[]): StatusCounts {
  const counts: StatusCounts = {}
  for (const r of runs) counts[r.status] = (counts[r.status] ?? 0) + 1
  return counts
}

/**
 * Latest runs with the per-item runs of GROUPED_STAGES gathered into one group per stage, at
 * the position of the stage's first run. A stage with a single item stays a plain run.
 */
export function timelineEntries(runs: StageRun[]): TimelineEntry[] {
  const byStage = new Map<string, StageRun[]>()
  for (const r of runs) {
    if (!GROUPED_STAGES.has(r.stage) || !r.itemId) continue
    byStage.set(r.stage, [...(byStage.get(r.stage) ?? []), r])
  }
  const out: TimelineEntry[] = []
  const placed = new Set<string>()
  for (const run of runs) {
    const group = run.itemId ? byStage.get(run.stage) : undefined
    if (!group || group.length < 2) {
      out.push({ kind: 'run', run })
    } else if (!placed.has(run.stage)) {
      placed.add(run.stage)
      out.push({ kind: 'group', stage: run.stage, runs: group, counts: countStatuses(group) })
    }
  }
  return out
}
