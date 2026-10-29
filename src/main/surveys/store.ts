// Survey store (#422): scenarios/<id>/surveys/<surveyId>.json holds a Survey and
// <surveyId>.responses.jsonl its responses, one per line, append-only. Responses from paper
// entry today, and from live play later (the live module mirrors into the same file), land
// here, so one file is the source of truth for results.
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { Survey, SurveyResponse } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { ensureDir, exists, readJson, safeJoin, writeFileAtomic, writeJsonAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { scenarioLayout } from '../scenario/layout'
import { requireScenarioDir } from '../scenario/store'

/** CONFLICT details when a save's base copy is older than the file. */
export const SURVEY_STALE = 'stale'

const RESPONSES_SUFFIX = '.responses.jsonl'

// Writes to one survey's files run one at a time, in call order.
const queues = new Map<string, Promise<unknown>>()

function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(fn)
  queues.set(key, run)
  const done = () => {
    if (queues.get(key) === run) queues.delete(key)
  }
  run.then(done, done)
  return run
}

const queueKey = (root: string, scenarioId: string, surveyId: string) =>
  `${root}\0${scenarioId}\0${surveyId}`

function changed(root: string, scenarioId: string): void {
  emit('project:changed', { path: root, what: 'surveys', scenarioId })
}

/** Every survey definition of a scenario, oldest first. An unreadable file is skipped. */
export async function listSurveys(root: string, scenarioId: string): Promise<Survey[]> {
  const layout = await requireScenarioDir(root, scenarioId)
  const files = await fs.readdir(layout.surveys).catch(() => [] as string[])
  const surveys: Survey[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const id = file.slice(0, -'.json'.length)
    try {
      surveys.push(await readJson(layout.survey(id), Survey))
    } catch {
      // A hand-edited or newer file: left alone, not listed.
    }
  }
  return surveys.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export async function readSurvey(root: string, scenarioId: string, surveyId: string) {
  const layout = await requireScenarioDir(root, scenarioId)
  const file = layout.survey(surveyId)
  if (!(await exists(file))) throw new AppError('NOT_FOUND', `No survey ${surveyId}`)
  return readJson(file, Survey)
}

export interface WriteSurveyOptions {
  /** The updatedAt of the copy the caller edited; a newer file fails with CONFLICT. */
  baseUpdatedAt?: string
}

async function writeOne(
  root: string,
  scenarioId: string,
  input: Survey,
  opts: WriteSurveyOptions,
): Promise<Survey> {
  const layout = scenarioLayout(root, scenarioId)
  const file = layout.survey(input.id)
  if (opts.baseUpdatedAt && (await exists(file))) {
    const current = await readJson(file, Survey)
    if (current.updatedAt > opts.baseUpdatedAt)
      throw new AppError('CONFLICT', 'This survey was changed elsewhere. Reload it to continue.', {
        reason: SURVEY_STALE,
      })
  }
  const parsed = Survey.safeParse({ ...input, updatedAt: nowIso() })
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid survey', parsed.error.issues)
  await ensureDir(layout.surveys)
  await writeJsonAtomic(file, parsed.data)
  return parsed.data
}

/** Validate and write a survey definition (createdAt kept, updatedAt set to now). */
export async function writeSurvey(
  root: string,
  scenarioId: string,
  survey: Survey,
  opts: WriteSurveyOptions = {},
): Promise<Survey> {
  await requireScenarioDir(root, scenarioId)
  const saved = await serialized(queueKey(root, scenarioId, survey.id), () =>
    writeOne(root, scenarioId, survey, opts),
  )
  changed(root, scenarioId)
  return saved
}

/** Remove a survey and its responses; its pair, if any, is unlinked. */
export async function deleteSurvey(root: string, scenarioId: string, surveyId: string) {
  const layout = await requireScenarioDir(root, scenarioId)
  const survey = await readSurvey(root, scenarioId, surveyId)
  await serialized(queueKey(root, scenarioId, surveyId), async () => {
    await fs.rm(layout.surveyResponses(surveyId), { force: true })
    await fs.rm(layout.survey(surveyId), { force: true })
  })
  if (survey.pairId && (await exists(layout.survey(survey.pairId)))) {
    const pair = await readSurvey(root, scenarioId, survey.pairId)
    if (pair.pairId === surveyId) {
      const { pairId: _drop, ...rest } = pair
      await writeSurvey(root, scenarioId, rest as Survey)
    }
  }
  changed(root, scenarioId)
}

/** Every stored response, last copy of each id winning; unreadable lines are skipped. */
export async function readResponses(
  root: string,
  scenarioId: string,
  surveyId: string,
): Promise<SurveyResponse[]> {
  const layout = await requireScenarioDir(root, scenarioId)
  const raw = await fs.readFile(layout.surveyResponses(surveyId), 'utf8').catch(() => '')
  const byId = new Map<string, SurveyResponse>()
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      continue // a line cut short by a crash
    }
    const r = SurveyResponse.safeParse(value)
    if (r.success && r.data.surveyId === surveyId) byId.set(r.data.id, r.data)
  }
  return [...byId.values()]
}

/**
 * Append one response. A response whose id is already stored replaces it when read (live
 * play re-sends by message id); appending never rewrites earlier lines.
 */
export async function appendResponse(
  root: string,
  scenarioId: string,
  response: SurveyResponse,
): Promise<number> {
  const layout = await requireScenarioDir(root, scenarioId)
  const clean = SurveyResponse.parse(response)
  if (!(await exists(layout.survey(clean.surveyId))))
    throw new AppError('NOT_FOUND', `No survey ${clean.surveyId}`)
  await serialized(queueKey(root, scenarioId, clean.surveyId), async () => {
    const file = layout.surveyResponses(clean.surveyId)
    // A previous append cut short by a crash leaves a partial line: start on a fresh one.
    const tail = await fs.readFile(file, 'utf8').catch(() => '')
    const sep = tail && !tail.endsWith('\n') ? '\n' : ''
    await fs.appendFile(file, `${sep}${JSON.stringify(clean)}\n`, { mode: 0o600 })
  })
  changed(root, scenarioId)
  return (await readResponses(root, scenarioId, clean.surveyId)).length
}

/** Remove one response (a mistyped paper form), or all of them when `responseId` is absent. */
export async function deleteResponses(
  root: string,
  scenarioId: string,
  surveyId: string,
  responseId?: string,
): Promise<number> {
  const layout = await requireScenarioDir(root, scenarioId)
  const file = layout.surveyResponses(surveyId)
  const kept = responseId
    ? (await readResponses(root, scenarioId, surveyId)).filter((r) => r.id !== responseId)
    : []
  await serialized(queueKey(root, scenarioId, surveyId), async () => {
    if (!kept.length) await fs.rm(file, { force: true })
    else await writeFileAtomic(file, kept.map((r) => JSON.stringify(r)).join('\n') + '\n')
  })
  changed(root, scenarioId)
  return kept.length
}

/** Copy survey definitions (never responses) from one scenario folder to another. */
export async function copySurveyDefinitions(fromDir: string, toDir: string): Promise<void> {
  const files = await fs.readdir(fromDir).catch(() => [] as string[])
  const definitions = files.filter((f) => f.endsWith('.json') && !f.endsWith(RESPONSES_SUFFIX))
  if (!definitions.length) return
  await ensureDir(toDir)
  for (const file of definitions)
    await fs.copyFile(safeJoin(fromDir, basename(file)), safeJoin(toDir, basename(file)))
}
