// Scenario folder layout and per-scenario write lock.
import { resolve } from 'node:path'
import { SafeId } from '@shared/schemas/common'
import type { ScenarioDocKind } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { safeJoin, toRel } from '../lib/fs'
import { projectPaths } from '../project/store'

export type HistoryArtifact = 'scenario' | ScenarioDocKind

/** Reject anything that is not a SafeId before it becomes a path segment. */
export function assertSafeId(id: string, what = 'id'): string {
  if (!SafeId.safeParse(id).success) throw new AppError('VALIDATION', `Invalid ${what}: ${id}`)
  return id
}

/** Absolute, guarded paths for one scenario folder. */
export function scenarioLayout(root: string, scenarioId: string) {
  const dir = projectPaths(root).scenario(assertSafeId(scenarioId, 'scenario id'))
  return {
    dir,
    file: safeJoin(dir, 'scenario.json'),
    /** The idea the scenario was started from, as the designer chose (and edited) it. */
    idea: safeJoin(dir, 'idea.json'),
    injects: safeJoin(dir, 'injects'),
    inject: (injectId: string) => safeJoin(dir, 'injects', `${assertSafeId(injectId)}.json`),
    documents: safeJoin(dir, 'documents'),
    doc: (kind: ScenarioDocKind) => safeJoin(dir, 'documents', `${kind}.md`),
    /** Project-root-relative path stored in Scenario.documents. */
    docRel: (kind: ScenarioDocKind) => toRel(root, safeJoin(dir, 'documents', `${kind}.md`)),
    media: safeJoin(dir, 'media'),
    /** Surveys (#422): <surveyId>.json definitions and <surveyId>.responses.jsonl answers. */
    surveys: safeJoin(dir, 'surveys'),
    survey: (surveyId: string) =>
      safeJoin(dir, 'surveys', `${assertSafeId(surveyId, 'survey id')}.json`),
    surveyResponses: (surveyId: string) =>
      safeJoin(dir, 'surveys', `${assertSafeId(surveyId, 'survey id')}.responses.jsonl`),
    history: safeJoin(dir, 'history'),
    historyFile: (artifact: HistoryArtifact) => safeJoin(dir, 'history', `${artifact}.jsonl`),
  }
}

const locks = new Map<string, Promise<unknown>>()

/** Serialize all writes to one scenario folder. Not re-entrant: never nest for the same key. */
export async function withScenarioLock<T>(
  root: string,
  scenarioId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `${resolve(root)}::${scenarioId}`
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(fn)
  locks.set(key, run)
  try {
    return await run
  } finally {
    if (locks.get(key) === run) locks.delete(key)
  }
}
