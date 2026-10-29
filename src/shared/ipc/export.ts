import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'

export const EXPORT_TARGETS = [
  'msel_pdf',
  'deck_pdf',
  'handbook_pdf',
  'briefing_pdf',
  'exercise_plan_pdf',
  'surveys_pdf',
  'survey_results_pdf',
  'eeg_pdf',
  'explan_pdf',
  'sitman_pdf',
  'handbook_hseep_pdf',
  'msel_xlsx',
  /** AAR/IP PDF plus the Improvement Plan tracker sheet (#419); only when a draft exists. */
  'aar_pdf',
  'media',
  'json',
  'markdown',
  'docx',
  'zip',
] as const
export const ExportTarget = z.enum(EXPORT_TARGETS)
export type ExportTarget = z.infer<typeof ExportTarget>

/** Documents the Export page can preview. */
export const PREVIEW_DOC_IDS = [
  'msel',
  'deck',
  'handbook',
  'briefing',
  'exercise_plan',
  'explan',
  'sitman',
  'sitman_player',
  'handbook_hseep',
  'eeg',
  'aar',
] as const

export const ExportOptions = z.object({
  /** Write the SitMan player edition and put it in players/ of the ZIP (#420). */
  sitmanPlayerEdition: z.boolean().optional(),
  /** msel_pdf (controller material only): add the source-check label column (#423). */
  sourceCheck: z.boolean().optional(),
})
export type ExportOptions = z.infer<typeof ExportOptions>

/** What the HSEEP document set will contain (#420): per document, what is still missing. */
export const CompletenessReport = z.object({
  documents: z.array(
    z.object({
      doc: z.string(),
      label: z.string(),
      ready: z.boolean(),
      missing: z.array(z.string()),
    }),
  ),
  /** Exercise details that are blank and print as fill-in lines. */
  detailsMissing: z.array(z.string()),
})
export type CompletenessReport = z.infer<typeof CompletenessReport>

export const exportChannels = {
  'export:run': channel(
    z.object({
      projectPath: z.string(),
      scenarioId: SafeId,
      outDir: z.string(),
      targets: z.array(ExportTarget).min(1),
      /** surveys_pdf: print only these surveys (any status but archived). */
      surveyIds: z.array(SafeId).max(50).optional(),
      options: ExportOptions.optional(),
    }),
    z.object({ jobId: SafeId }),
  ),
  'export:preview-html': channel(
    z.object({
      projectPath: z.string(),
      scenarioId: SafeId,
      doc: z.enum(PREVIEW_DOC_IDS),
    }),
    z.object({ html: z.string() }),
  ),
  'export:completeness': channel(
    z.object({ projectPath: z.string(), scenarioId: SafeId }),
    CompletenessReport,
  ),
}
