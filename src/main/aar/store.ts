// The AAR/IP store (#419): scenarios/<id>/aar.json (the Aar schema) with its own history under
// history/aar-json.jsonl, and documents/aar.md rendered from it through the scenario document
// store, so the document gets the editor, history and restore every other document has.
import { Aar } from '@shared/schemas/aar'
import { conductOf, type Scenario } from '@shared/schemas/scenario'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { readJsonOr, safeJoin, writeJsonAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { loadProject } from '../project/store'
import { assertNotGenerating } from '../scenario/busy'
import { appendHistory } from '../scenario/history'
import { scenarioLayout, withScenarioLock } from '../scenario/layout'
import { getScenario, readScenarioDoc, requireScenarioDir, writeScenarioDoc } from '../scenario/store'
import { refreshAarMarkdown, renderAarMarkdown } from './markdown'

export const AAR_FILE = 'aar.json'
const HISTORY_FILE = 'aar-json.jsonl'

/** CONFLICT details when a save's base copy is older than aar.json. */
export const AAR_STALE = 'stale'

/** Absolute path of aar.json; throws NOT_FOUND when the scenario does not exist. */
export async function aarPath(root: string, scenarioId: string): Promise<string> {
  const layout = await requireScenarioDir(root, scenarioId)
  return safeJoin(layout.dir, AAR_FILE)
}

/** The stored draft, or null before the first one. */
export async function readAar(root: string, scenarioId: string): Promise<Aar | null> {
  return readJsonOr(await aarPath(root, scenarioId), Aar.nullable(), () => null)
}

export interface WriteAarOptions {
  by: 'user' | 'ai'
  note?: string
  /** The updatedAt of the copy the caller edited; a newer aar.json fails with CONFLICT. */
  baseUpdatedAt?: string
}

/**
 * Validate and atomically write aar.json with a fresh updatedAt, keep a history snapshot and
 * announce the change. A user save while a job owns the scenario fails with CONFLICT (busy),
 * as does one made from a copy older than the file (stale).
 */
export async function writeAar(
  root: string,
  scenarioId: string,
  aar: Aar,
  opts: WriteAarOptions,
): Promise<Aar> {
  if (opts.by === 'user') assertNotGenerating(root, scenarioId)
  const saved = await withScenarioLock(root, scenarioId, async () => {
    const path = await aarPath(root, scenarioId)
    if (opts.baseUpdatedAt !== undefined) {
      const current = await readJsonOr(path, Aar.nullable(), () => null)
      if (current && current.updatedAt !== opts.baseUpdatedAt)
        throw new AppError(
          'CONFLICT',
          'This report changed since your edit started; your change was not saved yet.',
          { reason: AAR_STALE, updatedAt: current.updatedAt },
        )
    }
    const next = Aar.parse({ ...aar, updatedAt: nowIso() })
    await writeJsonAtomic(path, next)
    const layout = scenarioLayout(root, scenarioId)
    await appendHistory(safeJoin(layout.history, HISTORY_FILE), {
      by: opts.by,
      note: opts.note,
      snapshot: next,
    })
    return next
  })
  emit('project:changed', { path: root, what: 'aar', scenarioId })
  return saved
}

/** The sponsor printed in the document: the exercise details' sponsor (#420), else the organization. */
async function sponsorOf(root: string, scenario: Scenario): Promise<string> {
  const project = await loadProject(root)
  return conductOf(scenario).sponsor || project.orgName || project.name
}

/**
 * Write documents/aar.md from aar.json. `full` renders the whole document (a fresh draft);
 * `refresh` re-renders the tables a structured editor owns and keeps the prose a person edited.
 */
export async function syncAarDocument(
  root: string,
  scenarioId: string,
  aar: Aar,
  mode: 'full' | 'refresh',
  opts: { by: 'user' | 'ai'; note?: string },
  scenario?: Scenario,
): Promise<string> {
  const s = scenario ?? (await getScenario(root, scenarioId))
  const orgName = await sponsorOf(root, s)
  const current = await readScenarioDoc(root, scenarioId, 'aar')
  const markdown =
    mode === 'full'
      ? renderAarMarkdown(aar, s, orgName)
      : refreshAarMarkdown(current, aar, s, orgName)
  if (markdown !== current)
    await writeScenarioDoc(root, scenarioId, 'aar', markdown, {
      by: opts.by,
      ...(opts.note ? { note: opts.note } : {}),
      // History snapshots belong to the person's edits in the editor, not to table refreshes.
      snapshot: mode === 'full',
    })
  return markdown
}
