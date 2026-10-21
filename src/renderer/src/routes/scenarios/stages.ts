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
  player_briefing: 'Player briefing',
  hotwash: 'Hot wash',
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
