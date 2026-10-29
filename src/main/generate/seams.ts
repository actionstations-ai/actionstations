// Plan seams in the scenario pipeline (#427): the designer's picked findings from
// plan-conflicts.json (#423) snapshotted into the scenario, placed in a phase, pinned into
// that phase's msel_phase prompt, and turned into rows that put players where the plans
// disagree. Everything a facilitator reads about a seam (the controller block, the handbook
// section, the hot wash question) is built here by code from the two passages; the model
// only writes the inject itself.
import {
  CITATION_LIMITS,
  MAX_SEAMS,
  type Citation,
  type HotWash,
  type MselRow,
  type Phase,
  type PhasePlanOutput,
  type PlanFinding,
  type PlanPassage,
  type Scenario,
  type ScenarioSeam,
} from '@shared/schemas'
import { isSeam, passageLine, passageQuote, seamChunkIds, SEAM_TAGS, toSeam } from '@shared/seams'
import { readConflicts } from '../grounding/conflicts-file'
import { decisionPhaseIndex } from './lint'
import {
  canCarrySeam,
  citesChunk,
  normalizeSeamKey,
  phaseSeams,
  SEAM_ROW_ASSIGNED,
  seamKey,
  seamKeyMap,
  seamRows,
} from './lint-seams'
import { escapeText, type RetrievedChunk } from './retrieval'

/** The plan check's findings, or undefined when no check has run (or the file is unreadable). */
export async function loadSeamFindings(root: string): Promise<PlanFinding[] | undefined> {
  try {
    return (await readConflicts(root))?.findings
  } catch {
    return undefined
  }
}

export interface SeamSnapshot {
  seams: ScenarioSeam[]
  /** Picked ids neither the file nor the earlier snapshot knows; dropped. */
  unknown: string[]
}

/**
 * The scenario's seams for the brief's picks (at most three): a fresh snapshot of each finding
 * that is still a seam (its placement kept), else the earlier snapshot, so a seam the plan
 * owners fixed stays readable and SEAM_OUTDATED can say so.
 */
export function snapshotSeams(
  ids: readonly string[],
  findings: readonly PlanFinding[] | undefined,
  previous: readonly ScenarioSeam[],
): SeamSnapshot {
  const byId = new Map((findings ?? []).map((f) => [f.id, f]))
  const before = new Map(previous.map((x) => [x.id, x]))
  const seams: ScenarioSeam[] = []
  const unknown: string[] = []
  for (const id of [...new Set(ids)].slice(0, MAX_SEAMS)) {
    const f = byId.get(id)
    const old = before.get(id)
    if (f && isSeam(f))
      seams.push({ ...toSeam(f), ...(old?.phaseId ? { phaseId: old.phaseId } : {}) })
    else if (old) seams.push(old)
    else unknown.push(id)
  }
  return { seams, unknown }
}

/** Refresh `s.seams` from the brief and plan-conflicts.json; returns the ids it had to drop. */
export async function refreshSeams(root: string, s: Scenario): Promise<string[]> {
  const ids = s.brief.seamIds ?? []
  if (!ids.length && !s.seams.length) return []
  const { seams, unknown } = snapshotSeams(ids, await loadSeamFindings(root), s.seams)
  s.seams = seams
  return unknown
}

const safe = (text: string): string => escapeText(text)

interface PassageVar {
  label: string
  quote: string
  /** The passage's C key when the prompt carries it (pinned chunks). */
  key: string
}

function passageVar(p: PlanPassage, retrieved: RetrievedChunk[]): PassageVar {
  const key = retrieved.find((r) => r.hit.chunkId === p.chunkId)?.key ?? ''
  return { label: safe(passageLine(p)), quote: safe(passageQuote(p)), key }
}

/**
 * Prompt variables for seams (`seams` in ideate / phase_plan / critique, `phaseSeams` in
 * msel_phase): S key, label and both passages, escaped like any document text.
 */
export function seamPromptVars(
  s: Pick<Scenario, 'seams'>,
  seams: readonly ScenarioSeam[],
  retrieved: RetrievedChunk[] = [],
) {
  return seams.map((seam) => ({
    key: seamKey(s, seam.id) ?? '',
    slotLabel: safe(seam.slotLabel),
    dangling: seam.kind === 'dangling_reference',
    confirmed: seam.confirmed,
    missingTarget: safe(seam.missingTarget ?? ''),
    values: (seam.values ?? []).map(safe),
    a: passageVar(seam.a, retrieved),
    b: seam.b ? passageVar(seam.b, retrieved) : undefined,
  }))
}

/** Slots whose seam bites early: a notification deadline is tested right after STARTEX. */
const EARLY_SLOTS = new Set(['notify_deadline', 'report_deadline', 'contact_phone'])

export interface SeamPlacement {
  /** Seams the model placed. */
  placed: string[]
  /** Seams placed by the fallback rule (FR-5). */
  fallback: string[]
}

/**
 * FR-5: each seam goes to the phase the phase plan named (`seamPhases`, 1-based); one the
 * model left out or placed outside the plan goes to the decision phase, or for a notification
 * or deadline slot to the first phase.
 */
export function placeSeams(s: Scenario, out: Pick<PhasePlanOutput, 'seamPhases'>): SeamPlacement {
  const keys = seamKeyMap(s)
  const chosen = new Map<string, number>()
  for (const p of out.seamPhases ?? []) {
    const id = keys.get(normalizeSeamKey(p.seam) ?? '')
    if (id && !chosen.has(id) && p.phase >= 1 && p.phase <= s.phases.length)
      chosen.set(id, p.phase - 1)
  }
  const placed: string[] = []
  const fallback: string[] = []
  s.seams = s.seams.map((seam) => {
    const model = chosen.get(seam.id)
    const index = model ?? (EARLY_SLOTS.has(seam.slot) ? 0 : decisionPhaseIndex(s.phases.length))
    ;(model === undefined ? fallback : placed).push(seam.id)
    const phase = s.phases[index]
    return phase ? { ...seam, phaseId: phase.id } : seam
  })
  return { placed, fallback }
}

/** NFR-1: at most two pinned chunks per seam, for the seams placed in this phase. */
export const pinnedChunkIds = (s: Pick<Scenario, 'seams'>, phaseId: string): number[] => [
  ...new Set(phaseSeams(s, phaseId).flatMap(seamChunkIds)),
]

/** A plan passage as a row or inject citation. */
export function citationOf(p: PlanPassage): Citation {
  return {
    documentId: p.documentId,
    documentTitle: p.documentTitle.slice(0, CITATION_LIMITS.documentTitle),
    headingPath: p.headingPath.slice(0, CITATION_LIMITS.headingPath),
    ...(p.page ? { page: p.page } : {}),
    quote: p.span.replace(/\s+/g, ' ').trim().slice(0, 200),
    chunkId: p.chunkId,
  }
}

const passages = (seam: ScenarioSeam): PlanPassage[] => [seam.a, ...(seam.b ? [seam.b] : [])]

/** The row cites both of the seam's passages afterwards; true when a citation was added. */
export function addSeamCitations(row: MselRow, seam: ScenarioSeam): boolean {
  const missing = passages(seam).filter((p) => !citesChunk(row, p.chunkId))
  row.citations = [...row.citations, ...missing.map(citationOf)]
  return missing.length > 0
}

/** The seam tag closest to a row's own (FR-6): pressure stays pressure, a lead becomes story. */
function seamTag(tag: MselRow['purposeTag']): MselRow['purposeTag'] {
  if (tag === 'MISINFORMATION' || tag === 'DISTRACTION') return 'PRESSURE'
  if (tag === 'CLUE' || tag === 'TECH_HURDLE' || tag === 'END_GAME') return 'CORE_NARRATIVE'
  return 'OPERATIONAL_FRICTION'
}

export interface SeamRowFixes {
  cited: string[]
  retagged: string[]
}

/**
 * FR-6 for the phase's seam rows: both passages cited, and a tag outside SEAM_TAGS (a NOISE or
 * RED_HERRING row players are meant to dismiss, a clue) turned into the nearest seam tag.
 * Rows naming a seam the scenario does not have, and control cards, lose the seam id.
 */
export function applySeamRows(s: Scenario, phase: Phase): SeamRowFixes {
  const fixes: SeamRowFixes = { cited: [], retagged: [] }
  const byId = new Map(s.seams.map((x) => [x.id, x]))
  for (const row of s.msel.filter((r) => r.phaseId === phase.id && r.seamId)) {
    const seam = byId.get(row.seamId!)
    if (!seam || !canCarrySeam(row)) {
      delete row.seamId
      continue
    }
    if (row.locked) continue
    if (addSeamCitations(row, seam)) fixes.cited.push(row.id)
    if (!SEAM_TAGS.includes(row.purposeTag)) {
      row.purposeTag = seamTag(row.purposeTag)
      fixes.retagged.push(row.id)
    }
  }
  return fixes
}

const TAG_ORDER: MselRow['purposeTag'][] = [
  'DECISION_POINT',
  'CORE_NARRATIVE',
  'OPERATIONAL_FRICTION',
  'PRESSURE',
]

/** How well a row fits a seam: both passages cited, then one, then its tag. Lower is better. */
function fit(row: MselRow, seam: ScenarioSeam): number {
  const cited = seamChunkIds(seam).filter((id) => citesChunk(row, id)).length
  const tag = TAG_ORDER.indexOf(row.purposeTag)
  return (2 - cited) * 10 + (tag < 0 ? TAG_ORDER.length : tag)
}

/**
 * FR-4: every seam placed in this phase leaves it with a row. When neither the phase call nor
 * the mix pass tagged one, the unlocked row that fits best (cites the passages, carries a
 * decision or the main story) is given the seam; never a control card, a NOISE or RED_HERRING
 * row, or a row already testing another seam. Returns what was assigned.
 */
export function ensureSeamRows(s: Scenario, phase: Phase): { rowId: string; seamId: string }[] {
  const assigned: { rowId: string; seamId: string }[] = []
  for (const seam of phaseSeams(s, phase.id)) {
    if (seamRows(s, seam.id).length) continue
    const candidates = s.msel.filter(
      (r) =>
        r.phaseId === phase.id &&
        !r.locked &&
        !r.seamId &&
        canCarrySeam(r) &&
        !['NOISE', 'RED_HERRING'].includes(r.purposeTag),
    )
    const best = candidates.sort((x, y) => fit(x, seam) - fit(y, seam))[0]
    if (!best) continue
    best.seamId = seam.id
    addSeamCitations(best, seam)
    assigned.push({ rowId: best.id, seamId: seam.id })
  }
  return assigned
}

/** The note recorded when ensureSeamRows assigned a row (a pipeline warning, kept on re-lint). */
export function assignedNote(s: Scenario, a: { rowId: string; seamId: string }) {
  const seam = s.seams.find((x) => x.id === a.seamId)
  return {
    code: SEAM_ROW_ASSIGNED,
    severity: 'info' as const,
    message: `Row ${a.rowId} was given plan seam "${seam?.slotLabel ?? a.seamId}": no row was written for it; check that the row puts players in the seam`,
    rowId: a.rowId,
    source: 'lint' as const,
    suggestion: 'Re-run the phase with instructions, or edit the row',
  }
}

/**
 * A row an older build saved without its seam id (MselRow strips unknown keys) gets it back
 * when it cites both passages of one of the scenario's seams. Returns the relinked row ids.
 */
export function relinkSeamRows(s: Scenario): string[] {
  const relinked: string[] = []
  for (const seam of s.seams) {
    if (seamRows(s, seam.id).length) continue
    const ids = seamChunkIds(seam)
    for (const row of s.msel) {
      if (row.seamId || !canCarrySeam(row) || !ids.every((id) => citesChunk(row, id))) continue
      row.seamId = seam.id
      relinked.push(row.id)
    }
  }
  return relinked
}

/** Plan text in markdown: one line, and nothing that could open or close an HTML comment. */
const mdText = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .replace(/<!--|-->/g, '')
    .replace(/\|/g, '\\|')
    .trim()

const rowRef = (r: MselRow): string => `${r.id} (${r.time}${r.wallClock ? `, ${r.wallClock}` : ''})`

function seamBlock(s: Scenario, seam: ScenarioSeam, n: number): string[] {
  const unconfirmed = seam.kind === 'contradiction' && !seam.confirmed ? ' (unconfirmed)' : ''
  const rows = seamRows(s, seam.id)
  const lines = [`#### ${n}. ${mdText(seam.slotLabel)}${unconfirmed}`, '']
  for (const p of passages(seam))
    lines.push(`- **${mdText(passageLine(p))}:** “${mdText(passageQuote(p))}”`)
  if (seam.kind === 'dangling_reference')
    lines.push(
      `- **Missing:** ${mdText(seam.missingTarget ?? 'the document it points to')} is not among the project's documents.`,
    )
  lines.push(`- **Tested by:** ${rows.length ? rows.map(rowRef).join('; ') : '_no inject yet_'}`)
  lines.push(
    seam.kind === 'dangling_reference'
      ? '- **Watch for:** whether players look for the missing document, what they do without it, who they ask.'
      : '- **Watch for:** whether players notice the conflict, who they ask, how long the decision takes.',
  )
  lines.push(
    '',
    '**Observations:**',
    '',
    '______________________________________________',
    '',
    '______________________________________________',
    '',
  )
  return lines
}

/**
 * FR-8: the handbook's "Plan seams this exercise tests" section, built from the scenario's
 * seam snapshot and rows. Empty when the scenario tests no seam.
 */
export function seamHandbookSection(s: Scenario): string {
  if (!s.seams.length) return ''
  const lines = [
    '### Plan seams this exercise tests',
    '',
    'These injects put players where two of the organization’s plans disagree, or where a plan points at a document that does not exist. Players are not told; whether they notice is part of what the exercise finds. Take the findings to the plan owners after the hot wash.',
    '',
  ]
  s.seams.forEach((seam, i) => lines.push(...seamBlock(s, seam, i + 1)))
  return lines.join('\n').trimEnd()
}

const lowerFirst = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1)

/** FR-9: the hot wash question for one seam. */
export function seamQuestionText(seam: ScenarioSeam): string {
  const a = seam.a.documentTitle
  if (seam.kind === 'dangling_reference')
    return `Our ${a} points to ${seam.missingTarget ?? 'a document'}, which we do not have. What did you do without it, and what should the plan point to?`
  const b = seam.b?.documentTitle ?? a
  const docs = a === b ? `Two sections of our ${a}` : `Our ${a} and our ${b}`
  const values = seam.values ? ` (${seam.values[0]} or ${seam.values[1]})` : ''
  return `${docs} give different answers to “${lowerFirst(seam.slotLabel)}”${values}. Which did you follow, and which should the plans say?`
}

export const SEAM_TOPIC = 'Plan seam'

type Question = HotWash['questions'][number]

/** FR-9: one question per seam, linked to the seam's rows. */
export function seamHotwashQuestions(s: Scenario): Question[] {
  return s.seams.map((seam) => ({
    topic: SEAM_TOPIC,
    text: seamQuestionText(seam),
    seamId: seam.id,
    rowIds: seamRows(s, seam.id).map((r) => r.id),
  }))
}

/** The hot wash's model questions plus the seam questions (rebuilt, never duplicated). */
export function mergeSeamHotwash(s: Scenario): void {
  if (!s.hotwash) return
  const own = s.hotwash.questions.filter((q) => !q.seamId)
  s.hotwash = { ...s.hotwash, questions: [...own, ...seamHotwashQuestions(s)] }
}
