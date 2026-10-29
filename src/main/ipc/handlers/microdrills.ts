// microdrills:* (#437). Plan text goes to a model only through the project's draft provider, as
// numbered passages of the chosen annex and, for an answer, the question, expected points and
// the answer itself. Answers are kept in the project folder; the program gets totals only.
import { join } from 'node:path'
import type { MicroDrillListItem } from '@shared/schemas'
import { debriefHtml, debriefOf } from '../../microdrill/debrief'
import { buildMicroDrill } from '../../microdrill/build'
import { listAnnexes, openChunks } from '../../microdrill/annex'
import { saveEditedDrill } from '../../microdrill/edit'
import { reportToProgram } from '../../microdrill/program'
import { finishRun, startRun, submitAnswer, takeHint } from '../../microdrill/run'
import {
  deleteMicroDrill,
  getMicroDrill,
  getMicroRun,
  listMicroDrills,
  listMicroRuns,
  removeNames,
} from '../../microdrill/store'
import { loadMeta } from '../../ingest/storage'
import { jobs } from '../../jobs/manager'
import { ensureDir, writeFileAtomic } from '../../lib/fs'
import { requireProject } from '../../project/guard'
import { exportFolder } from '../../redline/export'
import { defineHandlers } from '../registry'

async function listItems(root: string): Promise<MicroDrillListItem[]> {
  const [drills, runs] = await Promise.all([listMicroDrills(root), listMicroRuns(root)])
  return drills.map((d) => {
    const mine = runs.filter((r) => r.drillId === d.id && r.finishedAt)
    const last = mine
      .map((r) => r.finishedAt!)
      .sort()
      .at(-1)
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      annex: d.annex,
      durationMin: d.durationMin,
      mode: d.mode,
      lintIssues: d.lint.length,
      runs: mine.length,
      ...(last ? { lastRunAt: last } : {}),
    }
  })
}

async function debriefPdf(root: string, runId: string): Promise<{ path: string }> {
  const run = await getMicroRun(root, runId)
  const drill = await getMicroDrill(root, run.drillId)
  const dir = exportFolder(root, '')
  await ensureDir(dir)
  const { htmlToPdf } = await import('../../export/pdf')
  const path = join(dir, `drill-debrief-${run.id}.pdf`)
  await writeFileAtomic(
    path,
    await htmlToPdf(debriefHtml(debriefOf(drill, run)), 'Drill debrief PDF'),
  )
  return { path }
}

export default defineHandlers({
  'microdrills:list': async ({ projectPath }) => listItems(await requireProject(projectPath)),

  'microdrills:annexes': async ({ projectPath, documentId }) => {
    const root = await requireProject(projectPath)
    await loadMeta(root, documentId)
    return listAnnexes(await openChunks(root), documentId)
  },

  'microdrills:build': async ({ projectPath, documentId, headingPath, settings }) => {
    const root = await requireProject(projectPath)
    await loadMeta(root, documentId)
    const job = jobs.start(
      'build-micro-drill',
      (ctx) => buildMicroDrill(root, { documentId, headingPath, settings }, ctx),
      { projectPath: root, payload: { documentId, headingPath } },
    )
    return { jobId: job.id }
  },

  'microdrills:get': async ({ projectPath, id }) =>
    getMicroDrill(await requireProject(projectPath), id),

  'microdrills:save': async ({ projectPath, drill }) =>
    saveEditedDrill(await requireProject(projectPath), drill),

  'microdrills:delete': async ({ projectPath, id }) => {
    await deleteMicroDrill(await requireProject(projectPath), id)
    return {}
  },

  'microdrills:remove-names': async ({ projectPath, id }) => ({
    removed: await removeNames(await requireProject(projectPath), id),
  }),

  'microdrills:runs': async ({ projectPath, drillId }) =>
    listMicroRuns(await requireProject(projectPath), drillId),

  'microdrills:run-start': async ({ projectPath, drillId, participants }) =>
    startRun(await requireProject(projectPath), drillId, participants),

  'microdrills:run-get': async ({ projectPath, runId }) =>
    getMicroRun(await requireProject(projectPath), runId),

  'microdrills:answer': async ({ projectPath, ...input }) =>
    submitAnswer(await requireProject(projectPath), input),

  'microdrills:hint': async ({ projectPath, runId, stepId }) =>
    takeHint(await requireProject(projectPath), runId, stepId),

  'microdrills:run-finish': async ({ projectPath, runId, pausedSec }) => {
    const root = await requireProject(projectPath)
    const run = await finishRun(root, runId, pausedSec)
    await reportToProgram(root)
    return run
  },

  'microdrills:debrief': async ({ projectPath, runId }) => {
    const root = await requireProject(projectPath)
    const run = await getMicroRun(root, runId)
    return debriefOf(await getMicroDrill(root, run.drillId), run)
  },

  'microdrills:debrief-pdf': async ({ projectPath, runId }) =>
    debriefPdf(await requireProject(projectPath), runId),
})
