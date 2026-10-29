// Pure rules of the Evaluation editor (#421): which plan sections a hand-written task may cite,
// and the next task id. Kept out of the component file so fast refresh keeps working.
import type { Citation } from '@shared/schemas/common'
import type { Eeg, Evaluation } from '@shared/schemas/evaluation'
import type { Scenario } from '@shared/schemas/scenario'

export const citationKey = (c: Citation): string => `${c.documentId}|${c.headingPath}`

/** "TIRP › Section 13 › 13.7 Checklist…" → "TIRP · 13.7 Checklist…" for a select option. */
export function citationOption(c: Citation): string {
  const parts = c.headingPath.split('›').map((p) => p.trim())
  return parts.length > 1 ? `${parts[0]} · ${parts[parts.length - 1]}` : c.headingPath
}

/** The plan sections the scenario cites anywhere: the sources a hand-written task can pick. */
export function knownCitations(s: Scenario, evaluation: Evaluation): Citation[] {
  const all = [
    ...(s.overview?.coreSectionsTested ?? []),
    ...s.msel.flatMap((r) => r.citations),
    ...evaluation.eegs.flatMap((e) => e.criticalTasks.map((t) => t.citation)),
  ]
  const seen = new Map<string, Citation>()
  for (const c of all)
    if (c.documentId && c.headingPath && !seen.has(citationKey(c))) seen.set(citationKey(c), c)
  return [...seen.values()]
}

/** The next free "T-nn" id across every guide. */
export function nextTaskId(eegs: Eeg[]): string {
  const taken = new Set(eegs.flatMap((e) => e.criticalTasks.map((t) => t.id)))
  for (let n = 1; ; n++) {
    const id = `T-${String(n).padStart(2, '0')}`
    if (!taken.has(id)) return id
  }
}
