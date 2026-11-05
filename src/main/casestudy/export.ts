// Education documents as PDFs (spec 0452 FR-13, FR-16): the fields come from documents.ts, the
// page from the clinical care templates, the file goes to the project's exports folder.
import { join } from 'node:path'
import type { CaseStudyRun } from '@shared/schemas'
import { ensureDir, writeFileAtomic } from '../lib/fs'
import { AppError } from '../lib/errors'
import { composeDocument } from '../render/compose'
import { exportFolder } from '../redline/export'
import { listEducationRecords } from './education'
import {
  debriefFields,
  facilitationFields,
  facilitatorSummaryFields,
  feedbackFields,
  learnerReportFields,
  prebriefFields,
  programRecordFields,
} from './documents'
import { getCaseStudy, getRun, listRuns } from './store'

export const EDUCATION_DOCUMENTS = [
  'prebrief',
  'facilitation',
  'debrief',
  'feedback',
  'learner',
  'facilitator',
  'program',
] as const
export type EducationDocument = (typeof EDUCATION_DOCUMENTS)[number]

const TEMPLATE: Record<EducationDocument, string> = {
  prebrief: 'simulation_prebrief',
  facilitation: 'facilitation_guide',
  debrief: 'debrief_guide',
  feedback: 'learner_feedback_form',
  learner: 'learner_report',
  facilitator: 'facilitator_summary',
  program: 'program_record',
}

export interface ExportRequest {
  kind: EducationDocument
  caseId?: string
  runId?: string
  program?: string
}

/** The template type and fields of a document. */
export async function buildDocument(
  root: string,
  req: ExportRequest,
): Promise<{ type: string; fields: Record<string, unknown>; title: string }> {
  const need = (v: string | undefined, what: string): string => {
    if (!v) throw new AppError('VALIDATION', `${what} is needed for this document`)
    return v
  }
  const type = TEMPLATE[req.kind]
  if (req.kind === 'program') {
    const fields = programRecordFields(
      await listEducationRecords(root),
      req.program?.trim() || 'Nursing program',
    )
    return { type, fields, title: 'Simulation program record' }
  }
  if (req.kind === 'learner') {
    const run: CaseStudyRun = await getRun(root, need(req.runId, 'A run'))
    const study = await getCaseStudy(root, run.caseId)
    return {
      type,
      fields: learnerReportFields(study, run),
      title: `Learner report: ${study.title}`,
    }
  }
  const study = await getCaseStudy(root, need(req.caseId, 'A case study'))
  const fields =
    req.kind === 'prebrief'
      ? prebriefFields(study)
      : req.kind === 'facilitation'
        ? facilitationFields(study)
        : req.kind === 'debrief'
          ? debriefFields(study)
          : req.kind === 'feedback'
            ? feedbackFields(study)
            : facilitatorSummaryFields(study, await listRuns(root, study.id))
  return { type, fields, title: `${study.title}` }
}

export async function exportDocument(root: string, req: ExportRequest): Promise<{ path: string }> {
  const { type, fields, title } = await buildDocument(root, req)
  const html = composeDocument({ type, fields, projectRoot: root, title }).html
  const { htmlToPdf } = await import('../export/pdf')
  const dir = exportFolder(root, '')
  await ensureDir(dir)
  const name = `${type}-${(req.runId ?? req.caseId ?? 'all').slice(-8)}.pdf`
  const path = join(dir, name)
  await writeFileAtomic(path, await htmlToPdf(html, 'Education document PDF'))
  return { path }
}
