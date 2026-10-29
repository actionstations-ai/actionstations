// redlines:* and drills:* (#431). Plan text sent to a model is the section a finding cites, and
// only through the project's draft provider; exports go to the folder the user chose; the
// program is written only when the user asks for it.
import { promises as fs } from 'node:fs'
import { buildDrillScenario } from '../../drill/build'
import { exportDrillResults } from '../../drill/export'
import { draftDrill } from '../../drill/plan'
import { recordDrillRun, recordInProgram } from '../../drill/record'
import { deleteDrill, getDrill, listDrills, saveDrillPlan } from '../../drill/store'
import { loadMeta, readableOriginal } from '../../ingest/storage'
import { jobs } from '../../jobs/manager'
import { onSessionEnd } from '../../live/end-hooks'
import { AppError } from '../../lib/errors'
import { requireProject } from '../../project/guard'
import { requireProgram } from '../../program/guard'
import { checkApplied } from '../../redline/applied-check'
import { applyTrackedChanges } from '../../redline/docx-tracked'
import { exportRedlines } from '../../redline/export'
import { createManualRedline } from '../../redline/manual'
import { generateRedlines } from '../../redline/stage'
import {
  deleteRedline,
  editRedline,
  getRedline,
  listRedlines,
  setRedlineStatus,
} from '../../redline/store'
import { getScenario } from '../../scenario/store'
import { defineHandlers } from '../registry'

// A drill records its run when the live session of its scenario ends (FR-10).
onSessionEnd(async (root, scenarioId, sessionId) => {
  for (const drill of await listDrills(root))
    if (drill.drillScenarioId === scenarioId) await recordDrillRun(root, drill.id, sessionId)
})

async function previewTracked(root: string, id: string) {
  const redline = await getRedline(root, id)
  const doc = await loadMeta(root, redline.target.documentId)
  if (!doc.filename.toLowerCase().endsWith('.docx'))
    return { mode: 'memo' as const, reason: 'The plan is not a Word file.' }
  const bytes = new Uint8Array(await fs.readFile(readableOriginal(root, doc)))
  const r = await applyTrackedChanges(
    bytes,
    [
      {
        id: redline.id,
        originalExcerpt: redline.originalExcerpt,
        proposedText: redline.proposedText,
      },
    ],
    { author: 'Action Stations', date: new Date().toISOString() },
  )
  return r.applied.length
    ? { mode: 'tracked' as const }
    : { mode: 'memo' as const, reason: r.unmatched[0]?.reason ?? 'The text was not found.' }
}

export default defineHandlers({
  'redlines:list': async ({ projectPath, scenarioId, documentId }) =>
    listRedlines(await requireProject(projectPath), {
      ...(scenarioId ? { scenarioId } : {}),
      ...(documentId ? { documentId } : {}),
    }),

  'redlines:get': async ({ projectPath, id }) => getRedline(await requireProject(projectPath), id),

  'redlines:generate': async ({ projectPath, scenarioId, findingIds, instructions }) => {
    const root = await requireProject(projectPath)
    await getScenario(root, scenarioId)
    const job = jobs.start(
      'generate-redlines',
      (ctx) => generateRedlines(root, scenarioId, findingIds, ctx, instructions?.trim()),
      { projectPath: root, scenarioId, payload: { findingIds } },
    )
    return { jobId: job.id }
  },

  'redlines:create': async ({ projectPath, redline }) =>
    createManualRedline(await requireProject(projectPath), redline),

  'redlines:update': async ({ projectPath, id, patch }) =>
    editRedline(await requireProject(projectPath), id, patch),

  'redlines:set-status': async ({ projectPath, ids, to, note }) =>
    setRedlineStatus(await requireProject(projectPath), ids, to, note),

  'redlines:delete': async ({ projectPath, id }) =>
    deleteRedline(await requireProject(projectPath), id),

  'redlines:export': async ({ projectPath, ids, outDir, formats }) => {
    const root = await requireProject(projectPath)
    const job = jobs.start('redline-export', () => exportRedlines({ root, ids, outDir, formats }), {
      projectPath: root,
      payload: { ids },
    })
    return { jobId: job.id }
  },

  'redlines:preview-tracked': async ({ projectPath, id }) =>
    previewTracked(await requireProject(projectPath), id),

  'redlines:check-applied': async ({ projectPath, documentId }) =>
    checkApplied(await requireProject(projectPath), documentId),

  'drills:list': async ({ projectPath }) => listDrills(await requireProject(projectPath)),

  'drills:get': async ({ projectPath, id }) => getDrill(await requireProject(projectPath), id),

  'drills:draft': async ({ projectPath, scenarioId, sessionId }) =>
    draftDrill(await requireProject(projectPath), scenarioId, sessionId),

  'drills:save': async ({ projectPath, drill }) => {
    const root = await requireProject(projectPath)
    await getScenario(root, drill.sourceScenarioId)
    return saveDrillPlan(root, drill)
  },

  'drills:build-scenario': async ({ projectPath, id }) => {
    const root = await requireProject(projectPath)
    const drill = await getDrill(root, id)
    const job = jobs.start('build-drill', (ctx) => buildDrillScenario(root, id, ctx), {
      projectPath: root,
      scenarioId: drill.sourceScenarioId,
      payload: { id },
    })
    return { jobId: job.id }
  },

  'drills:record-run': async ({ projectPath, id, sessionId }) =>
    recordDrillRun(await requireProject(projectPath), id, sessionId),

  'drills:record-program': async ({ projectPath, id, runId, programPath }) => {
    const root = await requireProject(projectPath)
    return recordInProgram(await requireProgram(programPath), root, id, runId)
  },

  'drills:export-results': async ({ projectPath, id, outDir }) => {
    const root = await requireProject(projectPath)
    const drill = await getDrill(root, id)
    if (!drill.runs.length)
      throw new AppError('VALIDATION', 'Record a run before exporting results')
    const job = jobs.start('drill-export', () => exportDrillResults(root, drill, outDir), {
      projectPath: root,
      payload: { id },
    })
    return { jobId: job.id }
  },

  'drills:delete': async ({ projectPath, id }) =>
    deleteDrill(await requireProject(projectPath), id),
})
