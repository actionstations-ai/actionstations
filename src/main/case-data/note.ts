// The note the generation prompts carry when a scenario has case data (spec 0448 FR-8): what
// the datasets are, that historical data is history and not current, and that simulated data is
// invented. Pure and capped; angle brackets are removed so a value can never close the data block.
import type { CaseManifest } from '@shared/schemas/case-data'
import { originLabel } from './resolve'

export const NOTE_MAX_CHARS = 3000

const clean = (s: string): string => s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()

export function caseDataNote(manifest: CaseManifest | undefined): string {
  if (!manifest?.datasets.length) return ''
  const lines = manifest.datasets.map((d) => {
    const when = d.range ? `, ${d.range.start.slice(0, 16)} to ${d.range.end.slice(0, 16)} UTC` : ''
    const where = d.area?.label ? `, ${clean(d.area.label)}` : ''
    return `- ${clean(d.label)} (${d.kind}): ${clean(originLabel(d))}${when}${where}`
  })
  return lines.join('\n').slice(0, NOTE_MAX_CHARS)
}
