// Plan check, deterministic part (#423, FR-10/FR-11/FR-14): slot statements from every chunk of
// the project's plans, policies and forms; candidate contradictions (same slot and subject,
// different values, different documents unless asked otherwise), ranked authority and deadlines
// first; and references to documents the project does not have. Pure.
import type { PlanFinding, PlanPassage } from '@shared/schemas'
import { S_SUBJECT } from './constants'
import { findingId } from './conflicts-file'
import { danglingReferences, knownNames, type KnownDocument } from './references'
import {
  extractStatements,
  sameSubject,
  slotLabel,
  SLOT_WEIGHT,
  subjectSimilarity,
  valuesDiffer,
  type SlotStatement,
} from './slots'

export interface PlanChunk {
  chunkId: number
  documentId: string
  documentTitle: string
  headingPath: string
  page?: number
  text: string
}

export interface PlanDocument {
  id: string
  title: string
  shortName?: string
  chunks: PlanChunk[]
}

export interface Candidate {
  finding: PlanFinding
  /** Ranking for the model budget (FR-14): slot weight, then subject similarity. */
  rank: number
  chunkA: PlanChunk
  chunkB: PlanChunk
}

interface Located {
  stmt: SlotStatement
  chunk: PlanChunk
}

const passage = (c: PlanChunk, span: string): PlanPassage => ({
  documentId: c.documentId,
  documentTitle: c.documentTitle,
  headingPath: c.headingPath,
  ...(c.page !== undefined ? { page: c.page } : {}),
  chunkId: c.chunkId,
  span,
})

function statements(docs: PlanDocument[]): Located[] {
  return docs.flatMap((d) =>
    d.chunks.flatMap((chunk) => extractStatements(chunk.text).map((stmt) => ({ stmt, chunk }))),
  )
}

function pairAllowed(a: Located, b: Located, withinDocument: boolean): boolean {
  if (a.chunk.documentId !== b.chunk.documentId) return true
  return withinDocument && a.chunk.headingPath !== b.chunk.headingPath
}

/** FR-10.2: candidate pairs, best first; one per id. */
export function candidatePairs(
  docs: PlanDocument[],
  opts: { withinDocument: boolean; now: string },
): Candidate[] {
  const all = statements(docs)
  const bySlot = new Map<string, Located[]>()
  for (const l of all) bySlot.set(l.stmt.slot, [...(bySlot.get(l.stmt.slot) ?? []), l])
  const out = new Map<string, Candidate>()
  for (const group of bySlot.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!
        const b = group[j]!
        if (!pairAllowed(a, b, opts.withinDocument)) continue
        if (!sameSubject(a.stmt, b.stmt, S_SUBJECT) || !valuesDiffer(a.stmt, b.stmt)) continue
        const id = findingId(a.stmt.slot, a.stmt.span, b.stmt.span)
        if (out.has(id)) continue
        out.set(id, {
          finding: {
            id,
            kind: 'contradiction',
            slot: a.stmt.slot,
            slotLabel: slotLabel(a.stmt.slot, a.stmt.subject),
            subject: a.stmt.subject,
            a: passage(a.chunk, a.stmt.span),
            b: passage(b.chunk, b.stmt.span),
            values: [a.stmt.value, b.stmt.value],
            verdict: 'unconfirmed',
            status: 'open',
            foundAt: opts.now,
          },
          rank: SLOT_WEIGHT[a.stmt.slot] + subjectSimilarity(a.stmt.subject, b.stmt.subject),
          chunkA: a.chunk,
          chunkB: b.chunk,
        })
      }
    }
  }
  return [...out.values()].sort((x, y) => y.rank - x.rank)
}

/** FR-11: references in the checked documents to plans, annexes or sections nobody ingested. */
export function danglingFindings(
  docs: PlanDocument[],
  others: KnownDocument[],
  now: string,
): PlanFinding[] {
  const known = knownNames([
    ...docs.map((d) => ({
      title: d.title,
      ...(d.shortName ? { shortName: d.shortName } : {}),
      headings: d.chunks.map((c) => c.headingPath),
    })),
    ...others,
  ])
  const out = new Map<string, PlanFinding>()
  for (const d of docs)
    for (const chunk of d.chunks)
      for (const ref of danglingReferences(chunk.text, known)) {
        const id = findingId('reference', ref.span, ref.target)
        if (out.has(id)) continue
        out.set(id, {
          id,
          kind: 'dangling_reference',
          slot: 'reference',
          slotLabel: 'Refers to a document the project does not have',
          subject: ref.target,
          a: passage(chunk, ref.span),
          missingTarget: ref.target,
          verdict: 'unconfirmed',
          status: 'open',
          foundAt: now,
        })
      }
  return [...out.values()]
}
