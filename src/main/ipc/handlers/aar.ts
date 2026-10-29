// aar:* (#419): the exercise record, the draft job and a person's edits to the AAR/IP. Nothing
// here leaves the project folder; the draft job sends the condensed record to the configured
// text provider and nowhere else.
import { z } from 'zod'
import type { Job } from '@shared/schemas'
import { buildExerciseRecord } from '../../aar/record'
import { draftAar } from '../../aar/draft'
import { listLiveSessions } from '../../aar/sources/live-log'
import { readAar, syncAarDocument, writeAar } from '../../aar/store'
import { startScenarioJob } from '../../generate/scenario-jobs'
import { jobs } from '../../jobs/manager'
import { AppError } from '../../lib/errors'
import { requireProject } from '../../project/guard'
import { defineHandlers } from '../registry'

const DraftPayload = z.object({
  instructions: z.string().optional(),
  sessionId: z.string().optional(),
})
type DraftPayload = z.infer<typeof DraftPayload>

/** Start the draft job; it owns the scenario while it runs, like a generation job. */
export function startDraftJob(root: string, scenarioId: string, payload: DraftPayload): Job {
  return startScenarioJob(
    'draft-aar',
    root,
    scenarioId,
    (ctx) => draftAar(root, scenarioId, payload, ctx),
    payload,
  )
}

/** A draft interrupted by an app exit is redone with the same instructions (it wrote nothing). */
jobs.registerResumer('draft-aar', async (paused) => {
  const payload = DraftPayload.safeParse(paused.payload ?? {})
  if (!payload.success) throw new AppError('VALIDATION', `Job ${paused.id} has no draft to resume`)
  return startDraftJob(await requireProject(paused.projectPath!), paused.scenarioId!, payload.data)
})

export default defineHandlers({
  'aar:get': async ({ projectPath, scenarioId }) =>
    readAar(await requireProject(projectPath), scenarioId),

  'aar:draft': async ({ projectPath, scenarioId, instructions, sessionId }) => {
    const root = await requireProject(projectPath)
    const job = startDraftJob(root, scenarioId, {
      ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
      ...(sessionId ? { sessionId } : {}),
    })
    return { jobId: job.id }
  },

  'aar:save': async ({ projectPath, scenarioId, aar, baseUpdatedAt }) => {
    const root = await requireProject(projectPath)
    const saved = await writeAar(root, scenarioId, aar, {
      by: 'user',
      note: 'Edited the AAR/IP',
      ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
    })
    // The tables a person edits here (ratings, plan rows, organizations) are re-rendered into
    // the document; the prose they edited in the document editor stays.
    await syncAarDocument(root, scenarioId, saved, 'refresh', { by: 'user' })
    return saved
  },

  'aar:record': async ({ projectPath, scenarioId, sessionId }) => {
    const root = await requireProject(projectPath)
    const { record } = await buildExerciseRecord(root, scenarioId, sessionId ? { sessionId } : {})
    return record
  },

  'aar:sessions': async ({ projectPath, scenarioId }) =>
    listLiveSessions(await requireProject(projectPath), scenarioId),
})
