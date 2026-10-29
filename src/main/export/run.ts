// export:run — one job that writes the selected targets into <outDir>/<Title>-S<n>-<tag>/ and,
// for 'zip', <outDir>/<Title>-S<n>-<tag>-distribution.zip (unique per scenario, #213). Each target is one progress step; the ZIP pulls
// in every artifact it needs (all PDFs, media, scenario.json/.md).
import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { ExportTarget } from '@shared/ipc'
import { AppError } from '../lib/errors'
import { ensureDir, writeFileAtomic } from '../lib/fs'
import type { JobContext } from '../jobs/manager'
import { renderPdf } from '../render/window'
import { buildDocumentHtml, EXPORT_DOC_LABELS, type ExportDoc } from './documents'
import { briefingDocx, handbookDocx } from './docx'
import { blankFormDocument } from './forms'
import { scenarioJson, scenarioMarkdown } from './manifest'
import { exportMedia, type ExportedFile } from './media'
import type { ExportModel } from './model'
import { documentFileNames, surveyFormName, type DocumentFileNames } from './naming'
import { htmlToPdf } from './pdf'
import {
  buildSurveyFormHtml,
  buildSurveyResultsHtml,
  isPlayerForm,
  printableSurveys,
} from './surveys'
import { distributionEntries, writeZip } from './zip'

/** Everything the ZIP's facilitator/ and players/ folders are built from. */
const ZIP_NEEDS: ExportTarget[] = [
  'msel_pdf',
  'deck_pdf',
  'handbook_pdf',
  'briefing_pdf',
  'exercise_plan_pdf',
  'surveys_pdf',
  'survey_results_pdf',
  'media',
  'json',
  'markdown',
]
/** Fixed execution order: media before markdown (checksums), ZIP last. */
const ORDER: ExportTarget[] = [
  'media',
  'msel_pdf',
  'deck_pdf',
  'handbook_pdf',
  'briefing_pdf',
  'exercise_plan_pdf',
  'surveys_pdf',
  'survey_results_pdf',
  'docx',
  'json',
  'markdown',
  'zip',
]

/** The targets that actually run, in order (ZIP pulls in its dependencies). */
export function planTargets(targets: ExportTarget[]): ExportTarget[] {
  const wanted = new Set(targets)
  if (wanted.has('zip')) ZIP_NEEDS.forEach((t) => wanted.add(t))
  if (wanted.has('markdown')) wanted.add('media')
  return ORDER.filter((t) => wanted.has(t))
}

const PDF_DOCS: Partial<Record<ExportTarget, { doc: ExportDoc; file: keyof DocumentFileNames }>> = {
  msel_pdf: { doc: 'msel', file: 'msel' },
  deck_pdf: { doc: 'deck', file: 'deck' },
  handbook_pdf: { doc: 'handbook', file: 'handbook' },
  briefing_pdf: { doc: 'briefing', file: 'briefing' },
  exercise_plan_pdf: { doc: 'exercise_plan', file: 'exercisePlan' },
}

export interface ExportResult {
  folder: string
  zipPath?: string
  files: string[]
  warnings: string[]
}

/** The output directory must be an existing absolute directory. */
export async function assertOutDir(outDir: string): Promise<string> {
  if (!isAbsolute(outDir)) throw new AppError('VALIDATION', 'Choose an absolute output folder')
  const stat = await fs.stat(outDir).catch(() => undefined)
  if (!stat?.isDirectory()) throw new AppError('NOT_FOUND', `Output folder not found: ${outDir}`)
  return outDir
}

/** Remove media this exporter wrote earlier (S<n>-… names) so renamed injects leave no strays. */
async function clearOldMedia(folder: string): Promise<void> {
  const dir = join(folder, 'media')
  const names = await fs.readdir(dir).catch(() => [] as string[])
  await Promise.all(
    names.filter((n) => /^S\d+-/.test(n)).map((n) => fs.rm(join(dir, n), { force: true })),
  )
}

interface RunState {
  model: ExportModel
  names: DocumentFileNames
  folder: string
  result: ExportResult
  media: ExportedFile[]
  /** surveys_pdf: only these surveys (else every survey marked ready). */
  surveyIds?: string[]
  /** Participant survey forms written by this run: the only survey files players/ may get. */
  playerSurveyForms: string[]
}

/** One printable form per survey in surveys/; participant forms are also allowed in players/. */
async function writeSurveyForms(state: RunState): Promise<void> {
  const surveys = printableSurveys(state.model.surveys, state.surveyIds)
  if (!surveys.length) {
    if (state.model.surveys.length)
      state.result.warnings.push('No survey is marked ready, so no survey forms were printed.')
    return
  }
  await ensureDir(join(state.folder, 'surveys'))
  for (const { survey } of surveys) {
    const name = surveyFormName(state.model.scenario.title, survey)
    const html = buildSurveyFormHtml(state.model, survey)
    await writeOut(state, join('surveys', name), await htmlToPdf(html, survey.title))
    if (isPlayerForm(survey)) state.playerSurveyForms.push(name)
  }
}

/** The results summary, facilitator/ only, when any survey has responses. */
async function writeSurveyResults(state: RunState): Promise<void> {
  const answered = state.model.surveys.filter((s) => s.summary.responses > 0)
  if (!answered.length) return
  const html = buildSurveyResultsHtml(state.model, answered)
  await writeOut(state, state.names.surveyResults, await htmlToPdf(html, 'Survey results'))
}

async function writeOut(state: RunState, name: string, data: string | Uint8Array): Promise<void> {
  await writeFileAtomic(join(state.folder, name), data)
  state.result.files.push(join(state.folder, name))
}

async function writeBlankForms(state: RunState): Promise<void> {
  const forms = [
    ['ics_201_prefill', state.names.ics201],
    ['ics_203_prefill', state.names.ics203],
  ] as const
  await ensureDir(join(state.folder, 'forms'))
  for (const [type, file] of forms) {
    await writeOut(state, join('forms', file), await renderPdf(blankFormDocument(type)))
  }
}

/** The scenario's handouts PDF, when it has any: player handouts with the briefing,
 *  controller materials with the handbook. */
async function writeHandouts(
  state: RunState,
  doc: 'handouts' | 'controller_handouts',
  file: 'handouts' | 'controllerHandouts',
): Promise<void> {
  if (!state.model.docs[doc].trim()) return
  const html = buildDocumentHtml(state.model, doc, 'pdf')
  await writeOut(
    state,
    state.names[file],
    await htmlToPdf(html, EXPORT_DOC_LABELS[doc], [state.model.root]),
  )
}

async function runTarget(state: RunState, target: ExportTarget, outDir: string): Promise<void> {
  const pdf = PDF_DOCS[target]
  if (pdf) {
    const html = buildDocumentHtml(state.model, pdf.doc, 'pdf')
    await writeOut(
      state,
      state.names[pdf.file],
      await htmlToPdf(html, EXPORT_DOC_LABELS[pdf.doc], [state.model.root]),
    )
    if (target === 'briefing_pdf') {
      await writeBlankForms(state)
      await writeHandouts(state, 'handouts', 'handouts')
    }
    if (target === 'handbook_pdf')
      await writeHandouts(state, 'controller_handouts', 'controllerHandouts')
    return
  }
  switch (target) {
    case 'media': {
      await clearOldMedia(state.folder)
      const media = await exportMedia(state.model, state.folder, (f) =>
        state.result.files.push(join(state.folder, f.file)),
      )
      state.media = media.files
      state.result.warnings.push(...media.warnings)
      return
    }
    case 'surveys_pdf':
      return writeSurveyForms(state)
    case 'survey_results_pdf':
      return writeSurveyResults(state)
    case 'json':
      return writeOut(state, 'scenario.json', scenarioJson(state.model))
    case 'markdown':
      return writeOut(state, 'scenario.md', scenarioMarkdown(state.model, state.media))
    case 'docx':
      await writeOut(state, state.names.handbookDocx, await handbookDocx(state.model))
      return writeOut(state, state.names.briefingDocx, await briefingDocx(state.model))
    case 'zip': {
      const zipPath = join(outDir, state.names.zip)
      await writeZip(
        zipPath,
        distributionEntries(state.folder, state.names, state.result.files, state.playerSurveyForms),
      )
      state.result.zipPath = zipPath
      state.result.files.push(zipPath)
      return
    }
  }
}

const TARGET_LABELS: Record<ExportTarget, string> = {
  msel_pdf: 'MSEL PDF',
  deck_pdf: 'Master Inject Deck PDF',
  handbook_pdf: 'Controller / Evaluator Handbook PDF',
  briefing_pdf: 'Player Briefing Packet PDF',
  exercise_plan_pdf: 'Exercise Plan PDF',
  surveys_pdf: 'survey forms',
  survey_results_pdf: 'survey results PDF',
  media: 'media files',
  json: 'scenario.json',
  markdown: 'scenario.md',
  docx: 'Word documents',
  zip: 'distribution ZIP',
}

/** Run an export job: every planned target in order, one progress step each. */
export async function runExport(
  model: ExportModel,
  outDir: string,
  targets: ExportTarget[],
  ctx: Pick<JobContext, 'progress' | 'log' | 'throwIfCancelled'>,
  opts: { surveyIds?: string[] } = {},
): Promise<ExportResult> {
  const names = documentFileNames(model.scenario.title, {
    scenarioNo: model.scenarioNo,
    scenarioId: model.scenario.id,
  })
  const folder = join(await assertOutDir(outDir), names.folder)
  await ensureDir(folder)
  const state: RunState = {
    model,
    names,
    folder,
    media: [],
    result: { folder, files: [], warnings: [] },
    playerSurveyForms: [],
    ...(opts.surveyIds?.length ? { surveyIds: opts.surveyIds } : {}),
  }
  const plan = planTargets(targets)
  for (const [i, target] of plan.entries()) {
    ctx.throwIfCancelled()
    ctx.progress(i / plan.length, `Writing ${TARGET_LABELS[target]}…`, { stage: target })
    const started = Date.now()
    await runTarget(state, target, outDir)
    ctx.log(`${TARGET_LABELS[target]} written in ${Date.now() - started} ms`, 'info', {
      stage: target,
    })
  }
  for (const w of state.result.warnings) ctx.log(w, 'warn')
  ctx.progress(1, `Exported ${state.result.files.length} files`)
  return state.result
}
