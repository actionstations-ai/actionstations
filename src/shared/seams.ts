// Plan seams (#427): the places where two of the organization's plans disagree, or where a
// plan points at a document nobody ingested, picked by the designer as material for the
// exercise. These helpers are shared by the main process (prompts, notes, handbook, hot wash)
// and the renderer (brief picker, inject editor, facilitator panel). Everything here is
// built by code from the plan check's passages; no model writes it.
import type { PlanFinding, PlanPassage } from './schemas/plan-conflicts'
import type { MselRow, ScenarioSeam } from './schemas/scenario'

export { MAX_SEAMS } from './schemas/scenario'

/** Tags a seam row may carry (FR-6): the row must put players in the seam, not distract them. */
export const SEAM_TAGS: readonly MselRow['purposeTag'][] = [
  'CORE_NARRATIVE',
  'PRESSURE',
  'OPERATIONAL_FRICTION',
  'DECISION_POINT',
]

/** The longest passage quote a note, a prompt or the handbook carries. */
const QUOTE_MAX = 320

/**
 * FR-1: an open or confirmed contradiction (verdict contradicts or unconfirmed) or dangling
 * reference. Dismissed and outdated findings, and the ones the model judged consistent,
 * complementary or unrelated, are never seams.
 */
export function isSeam(f: PlanFinding): boolean {
  if (f.status !== 'open' && f.status !== 'confirmed') return false
  if (f.kind === 'dangling_reference') return true
  return f.verdict === 'contradicts' || f.verdict === 'unconfirmed'
}

const rank = (f: PlanFinding): number =>
  f.kind === 'dangling_reference' ? 2 : f.verdict === 'contradicts' ? 0 : 1

/**
 * The seams a designer can pick, in picker order: confirmed contradictions, then unconfirmed
 * ones, then dangling references (open question 3); the plan check's own order within each.
 */
export function seamChoices(findings: readonly PlanFinding[]): PlanFinding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => isSeam(f))
    .sort((x, y) => rank(x.f) - rank(y.f) || x.i - y.i)
    .map(({ f }) => f)
}

/** The scenario's snapshot of a finding. */
export function toSeam(f: PlanFinding): ScenarioSeam {
  return {
    id: f.id,
    slot: f.slot,
    slotLabel: f.slotLabel,
    kind: f.kind,
    confirmed: f.kind === 'contradiction' && f.verdict === 'contradicts',
    a: f.a,
    ...(f.b ? { b: f.b } : {}),
    ...(f.values ? { values: f.values } : {}),
    ...(f.missingTarget ? { missingTarget: f.missingTarget } : {}),
  }
}

/** "Crisis Communications Annex › C.1 Approval, p. 4" */
export function passageLine(p: PlanPassage): string {
  const section = p.headingPath.split('›').slice(1).join('›').trim() || p.headingPath
  return `${p.documentTitle} › ${section}${p.page ? `, p. ${p.page}` : ''}`
}

/** A passage's statement on one line, cut to a readable length. */
export function passageQuote(p: PlanPassage): string {
  const text = p.span.replace(/\s+/g, ' ').trim()
  return text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1).trimEnd()}…` : text
}

/** "Who approves public releases (Emergency Response Plan vs Crisis Communications Annex)" */
export function seamTitle(
  seam: Pick<ScenarioSeam, 'slotLabel' | 'a' | 'b' | 'missingTarget' | 'kind'>,
): string {
  if (seam.kind === 'dangling_reference')
    return `${seam.slotLabel} (${seam.a.documentTitle} points to ${seam.missingTarget ?? 'a missing document'})`
  const other = seam.b?.documentTitle ?? seam.a.documentTitle
  return `${seam.slotLabel} (${seam.a.documentTitle} vs ${other})`
}

const WATCH_CONTRADICTION =
  'Watch for: whether players notice the conflict, who they ask, how long the decision takes.'
const WATCH_DANGLING =
  'Watch for: whether players look for the missing document, what they do without it, who they ask.'

/** The first line of every controller block; also how the block is found again in a note. */
const BLOCK_START = /(?:^|\n)Plan seam(?: \(unconfirmed\))?: /

/**
 * FR-7: the controller block for a seam inject, appended to the instructor note after the
 * model's text. Plain text; exports escape it like any other note.
 */
export function controllerBlock(seam: ScenarioSeam): string {
  const head = `Plan seam${seam.kind === 'contradiction' && !seam.confirmed ? ' (unconfirmed)' : ''}: ${seam.slotLabel}.`
  const a = `${passageLine(seam.a)}: "${passageQuote(seam.a)}"`
  if (seam.kind === 'dangling_reference')
    return [
      head,
      a,
      `${seam.missingTarget ?? 'The document it points to'} is not among the project's documents.`,
      WATCH_DANGLING,
    ].join('\n')
  const b = seam.b ? `${passageLine(seam.b)}: "${passageQuote(seam.b)}"` : ''
  return [head, a, b, WATCH_CONTRADICTION].filter(Boolean).join('\n')
}

/** A note split into the part the model or the user wrote and the generated block. */
export function splitControllerBlock(note: string | undefined): { note: string; block: string } {
  const text = note ?? ''
  const m = BLOCK_START.exec(text)
  if (!m) return { note: text.trimEnd(), block: '' }
  const at = m.index + (m[0].startsWith('\n') ? 1 : 0)
  return { note: text.slice(0, m.index).trimEnd(), block: text.slice(at).trim() }
}

/**
 * The note with the seam's block rebuilt after the written part (never duplicated); without
 * a seam the block is removed.
 */
export function upsertControllerBlock(note: string | undefined, seam?: ScenarioSeam): string {
  const { note: written } = splitControllerBlock(note)
  if (!seam) return written
  const block = controllerBlock(seam)
  return written ? `${written}\n\n${block}` : block
}

/** The seam's two passages as citation keys (chunk ids), passage A first. */
export function seamChunkIds(seam: Pick<ScenarioSeam, 'a' | 'b'>): number[] {
  const ids = [seam.a.chunkId, ...(seam.b ? [seam.b.chunkId] : [])]
  return [...new Set(ids)]
}
