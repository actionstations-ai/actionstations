// redlines/<id>.json (#431, FR-1): read, list and save redline records, with status changes
// written to the record's history. Saving announces the change so open screens refetch.
import { Redline, type NewRedline, type RedlineStatus } from '@shared/schemas'
import { makeCollection } from '../lib/collection'
import { emit } from '../lib/events'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'

const redlines = makeCollection('redlines', Redline)

export interface RedlineFilter {
  scenarioId?: string
  documentId?: string
}

export async function listRedlines(root: string, filter: RedlineFilter = {}): Promise<Redline[]> {
  const all = await redlines.list(root)
  return all
    .filter((r) => !filter.scenarioId || r.source.scenarioId === filter.scenarioId)
    .filter((r) => !filter.documentId || r.target.documentId === filter.documentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export const getRedline = (root: string, id: string): Promise<Redline> => redlines.get(root, id)

export async function saveRedline(root: string, redline: Redline): Promise<Redline> {
  const saved = await redlines.save(root, { ...redline, updatedAt: nowIso() })
  emit('project:changed', { path: root, what: 'redlines' })
  return saved
}

/** A user-made proposal (FR-3): starts as proposed, like a drafted one. */
export function createRedline(
  root: string,
  input: NewRedline,
  by: Redline['by'] = 'user',
): Promise<Redline> {
  const now = nowIso()
  return saveRedline(
    root,
    Redline.parse({
      ...input,
      id: newId(),
      by,
      status: 'proposed',
      history: [{ at: now, to: 'proposed', note: by === 'ai' ? 'Drafted' : 'Written by hand' }],
      createdAt: now,
      updatedAt: now,
    }),
  )
}

/** Move a redline to `to`, recording the change; the text of a redline is never touched here. */
export function withStatus(redline: Redline, to: RedlineStatus, note = ''): Redline {
  const at = nowIso()
  return { ...redline, status: to, history: [...redline.history, { at, to, note }].slice(-200) }
}

export async function setRedlineStatus(
  root: string,
  ids: string[],
  to: RedlineStatus,
  note = '',
): Promise<Redline[]> {
  const out: Redline[] = []
  for (const id of ids)
    out.push(await saveRedline(root, withStatus(await getRedline(root, id), to, note)))
  return out
}

/** Edit the proposed wording or the rationale; an accepted redline goes back to proposed. */
export async function editRedline(
  root: string,
  id: string,
  patch: Partial<Pick<Redline, 'proposedText' | 'rationale'>>,
): Promise<Redline> {
  const current = await getRedline(root, id)
  if (current.status === 'exported' || current.status === 'applied')
    throw new AppError('CONFLICT', 'This redline was already exported; make a new one instead.')
  const edited = { ...current, ...patch }
  const reopened = current.status === 'accepted' ? withStatus(edited, 'proposed', 'Edited') : edited
  return saveRedline(root, reopened)
}

export async function deleteRedline(root: string, id: string): Promise<void> {
  await redlines.remove(root, id)
  emit('project:changed', { path: root, what: 'redlines' })
}
