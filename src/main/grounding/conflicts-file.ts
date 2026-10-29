// <project>/plan-conflicts.json (#423, FR-12/FR-13): read, write and merge. A re-run keeps the
// user's decisions (dismissed / confirmed, with the note) and the model's verdict for findings
// whose two spans are unchanged (the id hashes slot + both spans); findings the new run no longer
// produces, because a chunk disappeared or changed, are kept as outdated and hidden by default.
import { createHash } from 'node:crypto'
import { PlanConflictsFile, type PlanFinding, type PlanFindingStatus } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { exists, readJson, safeJoin, writeJsonAtomic } from '../lib/fs'

export const PLAN_CONFLICTS_FILE = 'plan-conflicts.json'

export const conflictsPath = (root: string): string => safeJoin(root, PLAN_CONFLICTS_FILE)

/** sha256(slot + spanA + spanB), 16 hex; the two spans in a stable order. */
export function findingId(slot: string, spanA: string, spanB: string): string {
  const [x, y] = [spanA, spanB].sort()
  return createHash('sha256').update(`${slot}\u0000${x}\u0000${y}`).digest('hex').slice(0, 16)
}

export async function readConflicts(root: string): Promise<PlanConflictsFile | null> {
  const file = conflictsPath(root)
  if (!(await exists(file))) return null
  return readJson(file, PlanConflictsFile)
}

export async function writeConflicts(root: string, value: PlanConflictsFile): Promise<void> {
  await writeJsonAtomic(conflictsPath(root), PlanConflictsFile.parse(value))
}

/**
 * The new run's findings with the earlier decisions carried over; earlier findings the run did
 * not produce again are marked outdated (their decision kept, in case the text comes back).
 */
export function mergeFindings(previous: PlanFinding[], next: PlanFinding[]): PlanFinding[] {
  const before = new Map(previous.map((f) => [f.id, f]))
  const merged = next.map((f) => {
    const old = before.get(f.id)
    if (!old) return f
    const keepVerdict = f.verdict === 'unconfirmed' && old.verdict !== 'unconfirmed'
    return {
      ...f,
      foundAt: old.foundAt,
      status: old.status === 'outdated' ? 'open' : old.status,
      ...(old.note ? { note: old.note } : {}),
      ...(keepVerdict
        ? {
            verdict: old.verdict,
            ...(old.verdictQuotes ? { verdictQuotes: old.verdictQuotes } : {}),
            ...(old.explanation ? { explanation: old.explanation } : {}),
          }
        : {}),
    }
  })
  const ids = new Set(next.map((f) => f.id))
  const outdated = previous
    .filter((f) => !ids.has(f.id))
    .map((f): PlanFinding => ({ ...f, status: 'outdated' }))
  return [...merged, ...outdated]
}

/** A finding the model already judged keeps its verdict; this says whether to ask again. */
export function needsVerdict(f: PlanFinding, previous: Map<string, PlanFinding>): boolean {
  const old = previous.get(f.id)
  return f.kind === 'contradiction' && (!old || old.verdict === 'unconfirmed')
}

/** FR-12: Not a conflict / Confirmed / back to open, with an optional note. */
export async function setFindingStatus(
  root: string,
  findingId: string,
  status: Exclude<PlanFindingStatus, 'outdated'>,
  note: string | undefined,
): Promise<PlanFinding> {
  const file = await readConflicts(root)
  const finding = file?.findings.find((f) => f.id === findingId)
  if (!file || !finding)
    throw new AppError('NOT_FOUND', 'No such plan finding; run the plan check again')
  finding.status = status
  if (note !== undefined) {
    if (note.trim()) finding.note = note.trim()
    else delete finding.note
  }
  await writeConflicts(root, file)
  return finding
}
