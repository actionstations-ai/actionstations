// case-studies/<id>.json and case-study-runs/<id>.json: unfolding case studies and their runs
// (spec 0452 FR-9). Optional files, written atomically, ignored by older versions (ADR-0016).
import {
  CaseStudy,
  CaseStudyRun,
  type CaseStudyListItem,
  type CaseStudyReview,
} from '@shared/schemas'
import {
  redactDeep,
  scanIdentifiers,
  stringsIn,
  type IdentifierHit,
} from '../../shared/clinical/identifiers'
import { emit } from '../lib/events'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { makeCollection } from '../lib/collection'

const cases = makeCollection('case-studies', CaseStudy)
const runs = makeCollection('case-study-runs', CaseStudyRun)

const changed = (root: string): void =>
  emit('project:changed', { path: root, what: 'case-studies' })

export const listCaseStudies = async (root: string): Promise<CaseStudy[]> =>
  (await cases.list(root)).sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  )

export const getCaseStudy = (root: string, id: string): Promise<CaseStudy> => cases.get(root, id)

export function listItem(c: CaseStudy): CaseStudyListItem {
  return {
    id: c.id,
    title: c.title,
    origin: c.origin,
    status: c.status,
    stages: c.stages.length,
    prompts: c.stages.reduce((n, s) => n + s.prompts.length, 0),
    ...(c.contentNotice ? { contentNotice: c.contentNotice } : {}),
  }
}

/**
 * Save an edit. Any edit to the content of a reviewed case sends it back to draft, so what a
 * learner sees is always what the author reviewed.
 */
export async function saveCaseStudy(root: string, next: CaseStudy): Promise<CaseStudy> {
  let existing: CaseStudy | undefined
  try {
    existing = await cases.get(root, next.id)
  } catch {
    existing = undefined
  }
  const contentChanged =
    !existing ||
    JSON.stringify({ ...existing, status: 0, review: 0, updatedAt: 0 }) !==
      JSON.stringify({ ...next, status: 0, review: 0, updatedAt: 0 })
  const draftAgain = contentChanged && next.status === 'reviewed' && !!existing
  const saved = await cases.save(root, {
    ...next,
    ...(draftAgain ? { status: 'draft' as const, review: undefined } : {}),
    updatedAt: nowIso(),
  })
  changed(root)
  return saved
}

export async function deleteCaseStudy(root: string, id: string): Promise<void> {
  await cases.remove(root, id)
  for (const r of await runs.list(root)) if (r.caseId === id) await runs.remove(root, r.id)
  changed(root)
}

/** The author's review: the case becomes available to learners. */
export async function reviewCaseStudy(
  root: string,
  id: string,
  review: Pick<CaseStudyReview, 'by' | 'note'>,
): Promise<CaseStudy> {
  const c = await cases.get(root, id)
  if (!review.by.trim()) throw new AppError('VALIDATION', 'The reviewer needs a name')
  const saved = await cases.save(root, {
    ...c,
    status: 'reviewed',
    review: { by: review.by.trim(), note: review.note, at: nowIso() },
    updatedAt: nowIso(),
  })
  changed(root)
  return saved
}

export interface ImportResult {
  case?: CaseStudy
  hits: { path: string; kind: IdentifierHit['kind']; text: string }[]
  /** The case was saved (as a draft); false when identifiers need a decision first. */
  saved: boolean
}

/**
 * Import a case from JSON text. Direct identifiers (numbers, emails, dates of birth, addresses)
 * stop the import until the author chooses to redact them (`redact`) or says they are not
 * identifiers (`acknowledge`). An imported case is always a draft with a new id.
 */
export async function importCaseStudy(
  root: string,
  json: string,
  opts: { redact?: boolean; acknowledge?: boolean },
): Promise<ImportResult> {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new AppError('VALIDATION', 'The file is not valid JSON')
  }
  const hits = stringsIn(raw).flatMap(({ path, text }) =>
    scanIdentifiers(text).map((h) => ({ path, kind: h.kind, text: h.text })),
  )
  if (hits.length && !opts.redact && !opts.acknowledge) return { hits, saved: false }
  const source = hits.length && opts.redact ? redactDeep(raw) : raw
  const now = nowIso()
  const parsed = CaseStudy.safeParse({
    ...(source as object),
    id: newId(),
    origin: 'imported',
    status: 'draft',
    review: undefined,
    createdAt: now,
    updatedAt: now,
  })
  if (!parsed.success)
    throw new AppError(
      'VALIDATION',
      `The case study is not valid: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    )
  const saved = await cases.save(root, parsed.data)
  changed(root)
  return { case: saved, hits, saved: true }
}

export const listRuns = async (root: string, caseId?: string): Promise<CaseStudyRun[]> =>
  (await runs.list(root))
    .filter((r) => !caseId || r.caseId === caseId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id))

export const getRun = (root: string, id: string): Promise<CaseStudyRun> => runs.get(root, id)

export async function saveRun(root: string, run: CaseStudyRun): Promise<CaseStudyRun> {
  const saved = await runs.save(root, run)
  changed(root)
  return saved
}
