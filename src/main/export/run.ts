// export:run — one job that writes the selected targets into <outDir>/<Title>-S<n>-<tag>/ and,
// for 'zip', <outDir>/<Title>-S<n>-<tag>-distribution.zip (unique per scenario, #213). Each target is one progress step; the ZIP pulls
// in every artifact it needs (all PDFs, media, scenario.json/.md).
import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { ExportOptions, ExportTarget } from '@shared/ipc'
import { AppError } from '../lib/errors'
import { ensureDir, writeFileAtomic } from '../lib/fs'
import type { JobContext } from '../jobs/manager'
import { renderPdf } from '../render/window'
import { buildDocumentHtml, EXPORT_DOC_LABELS, type ExportDoc } from './documents'
import { completenessMarkdown, completenessReport } from './completeness'
import { aarDocx, briefingDocx, eegDocx, handbookDocx } from './docx'
import { explanDocx, handbookHseepDocx, sitmanDocx } from './hseep/docx'
import { blankFormDocument } from './forms'
import { improvementPlanWorkbook } from './improvement-plan'
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
import { mselWorkbook } from './xlsx'
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
  'eeg_pdf',
  'explan_pdf',
  'sitman_pdf',
  'handbook_hseep_pdf',
  'msel_xlsx',
  'aar_pdf',
  'media',
  'json',
  'markdown',
]
/** Fixed execution order: media before markdown (checksums), ZIP last. */
const ORDER: ExportTarget[] = [
  'media',
  'msel_xlsx',
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
  'aar_pdf',
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
  eeg_pdf: { doc: 'eeg', file: 'eegs' },
  explan_pdf: { doc: 'explan', file: 'explan' },
  sitman_pdf: { doc: 'sitman', file: 'sitman' },
  handbook_hseep_pdf: { doc: 'handbook_hseep', file: 'handbookHseep' },
  aar_pdf: { doc: 'aar', file: 'aar' },
}

/** The EEG packet needs guides to print; a scenario without any gets a warning, not a file. */
const hasEegs = (model: ExportModel): boolean => model.scenario.evaluation.eegs.length > 0
const NO_EEGS =
  'No evaluation guides yet: generate them on the Scenario page (Evaluation tab) to export the EEG packet'

/** The AAR/IP needs a draft to print (#419); a scenario without one gets a warning, not a file. */
const NO_AAR =
  'No After-Action Report yet: draft it on the Facilitate screen after the exercise to export the AAR/IP'

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
  options: ExportOptions
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

async function writePdf(
  state: RunState,
  doc: ExportDoc,
  file: keyof DocumentFileNames,
): Promise<void> {
  const html = buildDocumentHtml(state.model, doc, 'pdf')
  await writeOut(
    state,
    state.names[file],
    await htmlToPdf(html, EXPORT_DOC_LABELS[doc], [state.model.root]),
  )
}

/** Every Word document: the classroom handbook and briefing, the HSEEP set (#420), the EEG
 *  packet when the scenario has guides (#421) and the AAR/IP when a draft exists (#419). */
async function writeDocx(state: RunState): Promise<void> {
  const { model, names } = state
  await writeOut(state, names.handbookDocx, await handbookDocx(model))
  await writeOut(state, names.briefingDocx, await briefingDocx(model))
  await writeOut(state, names.explanDocx, await explanDocx(model))
  await writeOut(state, names.sitmanDocx, await sitmanDocx(model, 'facilitator'))
  await writeOut(state, names.handbookHseepDocx, await handbookHseepDocx(model))
  if (hasEegs(model)) await writeOut(state, names.eegsDocx, await eegDocx(model))
  if (model.aar) await writeOut(state, names.aarDocx, await aarDocx(model))
}

async function runTarget(state: RunState, target: ExportTarget, outDir: string): Promise<void> {
  const pdf = PDF_DOCS[target]
  if (target === 'eeg_pdf' && !hasEegs(state.model)) {
    state.result.warnings.push(NO_EEGS)
    return
  }
  if (target === 'aar_pdf' && !state.model.aar) {
    state.result.warnings.push(NO_AAR)
    return
  }
  if (pdf) {
    await writePdf(state, pdf.doc, pdf.file)
    if (target === 'sitman_pdf' && state.options.sitmanPlayerEdition)
      await writePdf(state, 'sitman_player', 'sitmanPlayer')
    if (target === 'briefing_pdf') {
      await writeBlankForms(state)
      await writeHandouts(state, 'handouts', 'handouts')
    }
    if (target === 'handbook_pdf')
      await writeHandouts(state, 'controller_handouts', 'controllerHandouts')
    // The Improvement Plan tracker sheet travels with the AAR/IP (spec 0419 FR-11).
    if (target === 'aar_pdf')
      await writeOut(
        state,
        state.names.improvementPlanXlsx,
        await improvementPlanWorkbook(state.model),
      )
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
    case 'msel_xlsx':
      return writeOut(state, state.names.mselXlsx, await mselWorkbook(state.model))
    case 'docx':
      return writeDocx(state)
    case 'zip': {
      await writeReport(state)
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

/** export-report.md (#420): what the HSEEP set contains and which details are still blank. */
async function writeReport(state: RunState): Promise<void> {
  const md = completenessMarkdown(completenessReport(state.model), state.model.scenario.title)
  await writeOut(state, state.names.report, md)
}

const TARGET_LABELS: Record<ExportTarget, string> = {
  msel_pdf: 'MSEL PDF',
  deck_pdf: 'Master Inject Deck PDF',
  handbook_pdf: 'Controller / Evaluator Handbook PDF',
  briefing_pdf: 'Player Briefing Packet PDF',
  exercise_plan_pdf: 'Exercise Plan PDF',
  surveys_pdf: 'survey forms',
  survey_results_pdf: 'survey results PDF',
  eeg_pdf: 'Exercise Evaluation Guides PDF',
  explan_pdf: 'ExPlan PDF',
  sitman_pdf: 'Situation Manual PDF',
  handbook_hseep_pdf: 'C/E Handbook (HSEEP) PDF',
  msel_xlsx: 'MSEL workbook',
  aar_pdf: 'After-Action Report / Improvement Plan',
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
  opts: ExportOptions & { surveyIds?: string[] } = {},
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
    options: { ...(opts.sitmanPlayerEdition ? { sitmanPlayerEdition: true } : {}) },
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
  if (!plan.includes('zip')) await writeReport(state)
  for (const w of state.result.warnings) ctx.log(w, 'warn')
  ctx.progress(1, `Exported ${state.result.files.length} files`)
  return state.result
}
