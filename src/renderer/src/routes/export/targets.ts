import type { ExportTarget } from '@shared/ipc'

export interface TargetOption {
  id: ExportTarget
  label: string
  hint: string
}

export const DOCUMENT_TARGETS: TargetOption[] = [
  { id: 'msel_pdf', label: 'MSEL', hint: 'Landscape events table, grouped by phase' },
  { id: 'deck_pdf', label: 'Master Inject Deck', hint: 'One inject per page with its media' },
  {
    id: 'handbook_pdf',
    label: 'Controller / Evaluator Handbook',
    hint: 'Rubric, hot wash, SimCell scripts',
  },
  {
    id: 'briefing_pdf',
    label: 'Player Briefing Packet',
    hint: 'With blank ICS 201 and ICS 203 forms',
  },
  { id: 'exercise_plan_pdf', label: 'Exercise Plan', hint: 'Cover page plus all four documents' },
]

export const FILE_TARGETS: TargetOption[] = [
  { id: 'media', label: 'Media files', hint: 'PNG, PDF, WAV + MP3, MP4 named S<n>-I<id>-<type>' },
  { id: 'json', label: 'scenario.json', hint: 'Full scenario with injects inlined' },
  { id: 'markdown', label: 'scenario.md', hint: 'Readable copy with media checksums' },
  { id: 'docx', label: 'Word documents', hint: 'Handbook and Player Briefing as .docx' },
  {
    id: 'zip',
    label: 'Distribution ZIP',
    hint: 'facilitator/ (everything) and players/ (briefing + forms)',
  },
]

export const ALL_TARGETS: ExportTarget[] = [...DOCUMENT_TARGETS, ...FILE_TARGETS].map((t) => t.id)

/** Everything except the optional Word files. */
export const DEFAULT_TARGETS: ExportTarget[] = ALL_TARGETS.filter((t) => t !== 'docx')

export type PreviewDoc = 'msel' | 'deck' | 'handbook' | 'briefing' | 'exercise_plan'

export const PREVIEW_DOCS: { id: PreviewDoc; label: string }[] = [
  { id: 'msel', label: 'MSEL' },
  { id: 'deck', label: 'Inject Deck' },
  { id: 'handbook', label: 'Handbook' },
  { id: 'briefing', label: 'Briefing' },
  { id: 'exercise_plan', label: 'Exercise Plan' },
]

/** Toggle one target, keeping the canonical order. */
export function toggleTarget(selected: ExportTarget[], id: ExportTarget): ExportTarget[] {
  const set = new Set(selected)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  return ALL_TARGETS.filter((t) => set.has(t))
}

const OUT_DIR_KEY = 'ttx.export.outDir'

export function rememberedOutDir(): string {
  try {
    return localStorage.getItem(OUT_DIR_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberOutDir(dir: string): void {
  try {
    localStorage.setItem(OUT_DIR_KEY, dir)
  } catch {
    // Storage unavailable: the folder is simply not remembered.
  }
}

export interface ExportJobResult {
  folder: string
  zipPath?: string
  files: string[]
  warnings: string[]
}

export function asExportResult(value: unknown): ExportJobResult | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<ExportJobResult>
  if (typeof v.folder !== 'string' || !Array.isArray(v.files)) return null
  return {
    folder: v.folder,
    ...(typeof v.zipPath === 'string' ? { zipPath: v.zipPath } : {}),
    files: v.files.filter((f): f is string => typeof f === 'string'),
    warnings: Array.isArray(v.warnings) ? v.warnings.map(String) : [],
  }
}
