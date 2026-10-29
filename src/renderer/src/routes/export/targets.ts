import type { ExportTarget, PREVIEW_DOC_IDS } from '@shared/ipc'

export interface TargetOption {
  id: ExportTarget
  label: string
  hint: string
}

/** The HSEEP document set (#420): what an accreditation or grant package expects. */
export const HSEEP_TARGETS: TargetOption[] = [
  {
    id: 'explan_pdf',
    label: 'Exercise Plan (ExPlan)',
    hint: 'Objectives, roles, logistics and rules; safe to give players',
  },
  {
    id: 'sitman_pdf',
    label: 'Situation Manual (SitMan)',
    hint: 'One module per phase with discussion questions',
  },
  {
    id: 'handbook_hseep_pdf',
    label: 'C/E Handbook (HSEEP layout)',
    hint: 'Controller and evaluator instructions in HSEEP order',
  },
  { id: 'msel_xlsx', label: 'MSEL workbook (Excel)', hint: 'Sortable MSEL in HSEEP columns' },
]

/** The classroom set: the five documents the exercise has always exported. */
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
  {
    id: 'exercise_plan_pdf',
    label: 'Exercise Plan bundle',
    hint: 'Cover page, ExPlan, SitMan, handbook, MSEL, deck and briefing in one PDF',
  },
  {
    id: 'surveys_pdf',
    label: 'Survey forms',
    hint: 'A printable form for every survey marked ready',
  },
  {
    id: 'survey_results_pdf',
    label: 'Survey results',
    hint: 'Summary of the responses so far (facilitator only)',
  },
  {
    id: 'eeg_pdf',
    label: 'Exercise Evaluation Guides',
    hint: 'One EEG per Core Capability, critical tasks with plan citations and rating boxes',
  },
  {
    id: 'aar_pdf',
    label: 'After-Action Report / Improvement Plan',
    hint: 'HSEEP AAR/IP with the Improvement Plan tracker sheet; needs a draft from Facilitate',
  },
]

export const FILE_TARGETS: TargetOption[] = [
  { id: 'media', label: 'Media files', hint: 'PNG, PDF, WAV + MP3, MP4 named S<n>-I<id>-<type>' },
  { id: 'json', label: 'scenario.json', hint: 'Full scenario with injects inlined' },
  { id: 'markdown', label: 'scenario.md', hint: 'Readable copy with media checksums' },
  {
    id: 'docx',
    label: 'Word documents',
    hint: 'Handbooks, Player Briefing, ExPlan, SitMan, EEGs and the AAR/IP as .docx',
  },
  {
    id: 'zip',
    label: 'Distribution ZIP',
    hint: 'facilitator/ (everything) and players/ (briefing, forms, ExPlan, participant surveys)',
  },
]

export const ALL_TARGETS: ExportTarget[] = [
  ...HSEEP_TARGETS,
  ...DOCUMENT_TARGETS,
  ...FILE_TARGETS,
].map((t) => t.id)

/** Everything except the optional Word files. */
export const DEFAULT_TARGETS: ExportTarget[] = ALL_TARGETS.filter((t) => t !== 'docx')

export type PreviewDoc = (typeof PREVIEW_DOC_IDS)[number]

export const PREVIEW_DOCS: { id: PreviewDoc; label: string }[] = [
  { id: 'msel', label: 'MSEL' },
  { id: 'deck', label: 'Inject Deck' },
  { id: 'handbook', label: 'Handbook' },
  { id: 'briefing', label: 'Briefing' },
  { id: 'explan', label: 'ExPlan' },
  { id: 'sitman', label: 'SitMan' },
  { id: 'sitman_player', label: 'SitMan (players)' },
  { id: 'handbook_hseep', label: 'C/E Handbook (HSEEP)' },
  { id: 'eeg', label: 'EEGs' },
  { id: 'aar', label: 'AAR/IP' },
  { id: 'exercise_plan', label: 'Bundle' },
]

/** Toggle one target, keeping the canonical order. */
export function toggleTarget(selected: ExportTarget[], id: ExportTarget): ExportTarget[] {
  const set = new Set(selected)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  return ALL_TARGETS.filter((t) => set.has(t))
}

const OUT_DIR_KEY = 'ttx.export.outDir'

/** <project>/exports, created by main on the first export there (#238). */
export function defaultOutDir(projectPath: string): string {
  const sep = projectPath.includes('\\') && !projectPath.includes('/') ? '\\' : '/'
  return `${projectPath.replace(/[\\/]+$/, '')}${sep}exports`
}

/** The folder last chosen for this project, else <project>/exports. */
export function rememberedOutDir(projectPath: string): string {
  try {
    return localStorage.getItem(`${OUT_DIR_KEY}:${projectPath}`) || defaultOutDir(projectPath)
  } catch {
    return defaultOutDir(projectPath)
  }
}

export function rememberOutDir(projectPath: string, dir: string): void {
  try {
    localStorage.setItem(`${OUT_DIR_KEY}:${projectPath}`, dir)
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
