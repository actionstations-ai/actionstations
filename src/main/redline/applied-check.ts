// "Mark applied" (#431, FR-7): after the organization updates a plan and the new version is
// imported and linked to the old one (supersedesDocumentId), the accepted redlines of the old
// version are read against the new text. The excerpt gone and the proposed wording present
// means applied; the excerpt still there means not applied; anything else needs a person.
import type { Redline } from '@shared/schemas'
import { findExcerpt } from '@shared/redline/excerpt'
import { loadMeta, readText } from '../ingest/storage'
import { AppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { listRedlines, saveRedline, withStatus } from './store'

type Result = NonNullable<Redline['appliedCheck']>['result']

/** Whether the new text shows the change. Pure. */
export function appliedResult(
  newText: string,
  r: Pick<Redline, 'originalExcerpt' | 'proposedText'>,
): Result {
  const oldThere = !!findExcerpt(newText, r.originalExcerpt)
  const newThere = !!findExcerpt(newText, r.proposedText)
  if (!oldThere && newThere) return 'applied'
  if (oldThere) return 'not_applied'
  return 'needs_review'
}

const CHECKED: Redline['status'][] = [
  'accepted',
  'exported',
  'applied',
  'not_applied',
  'needs_review',
]

/** Check the redlines of the document `documentId` supersedes; returns the updated records. */
export async function checkApplied(root: string, documentId: string): Promise<Redline[]> {
  const meta = await loadMeta(root, documentId)
  if (!meta.supersedesDocumentId)
    throw new AppError('VALIDATION', 'This document does not replace an earlier version of a plan')
  const [text, redlines] = await Promise.all([
    readText(root, meta),
    listRedlines(root, { documentId: meta.supersedesDocumentId }),
  ])
  const out: Redline[] = []
  for (const r of redlines.filter((x) => CHECKED.includes(x.status))) {
    const result = appliedResult(text, r)
    const next = withStatus(r, result, `Checked against ${meta.title}`)
    out.push(
      await saveRedline(root, {
        ...next,
        appliedCheck: { at: nowIso(), documentId, result },
      }),
    )
  }
  return out
}
