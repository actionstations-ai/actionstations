import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'

export const EXPORT_TARGETS = [
  'msel_pdf',
  'deck_pdf',
  'handbook_pdf',
  'briefing_pdf',
  'exercise_plan_pdf',
  'media',
  'json',
  'markdown',
  'docx',
  'zip',
] as const
export const ExportTarget = z.enum(EXPORT_TARGETS)
export type ExportTarget = z.infer<typeof ExportTarget>

export const exportChannels = {
  'export:run': channel(
    z.object({
      projectPath: z.string(),
      scenarioId: SafeId,
      outDir: z.string(),
      targets: z.array(ExportTarget).min(1),
    }),
    z.object({ jobId: SafeId }),
  ),
  'export:preview-html': channel(
    z.object({
      projectPath: z.string(),
      scenarioId: SafeId,
      doc: z.enum(['msel', 'deck', 'handbook', 'briefing', 'exercise_plan']),
    }),
    z.object({ html: z.string() }),
  ),
}
