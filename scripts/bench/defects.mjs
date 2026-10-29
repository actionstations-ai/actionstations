// Planted defects for the critique task (#434, FR-8, FR-14). A defects file
// (bench/defects/<case>.json) lists changes to a hand-corrected example scenario; applying
// them is pure and deterministic, and each planted defect records the rows a correct critique
// note may cite and the words (any of a small synonym set) the note must contain.
//
// Defect kinds:
//   time_order              `set.time` moves a row out of sequence; notes on it or a neighbour count
//   contradicts_citation    `set.expectedAction` names an authority other than the cited passage's
//   player_inject           `set.from` makes a player role send the inject
//   duplicate_row           copies `row` as `copyId` right after it
//   missing_decision_point  retags every DECISION_POINT row and strips "DECISION (POINT):" labels
//   unknown_facility_id     `replace` swaps an identifier for one not in the facility facts
//   fast_restoration        `set.event` restores service implausibly fast
//   outside_agency_decides  `set.expectedAction` has an outside agency decide for the organization
export const DEFECT_KINDS = [
  'time_order',
  'contradicts_citation',
  'player_inject',
  'duplicate_row',
  'missing_decision_point',
  'unknown_facility_id',
  'fast_restoration',
  'outside_agency_decides',
]

const EDITABLE = new Set(['time', 'from', 'event', 'expectedAction', 'toLabel'])
/** The upper-case labels authors put on decision rows ("DECISION POINT:", "DECISION:"). */
const DECISION_LABEL = /\b(?:CRITICAL )?DECISION(?: POINT)?:\s*/g

function rowIndex(msel, id, defect) {
  const i = msel.findIndex((r) => r.id === id)
  if (i < 0) throw new Error(`defect ${defect.id}: no row "${id}"`)
  return i
}

function editRow(row, defect) {
  for (const [field, value] of Object.entries(defect.set ?? {})) {
    if (!EDITABLE.has(field)) throw new Error(`defect ${defect.id}: cannot set "${field}"`)
    row[field] = value
  }
  for (const r of defect.replace ?? []) {
    if (!EDITABLE.has(r.field) || !String(row[r.field] ?? '').includes(r.find))
      throw new Error(`defect ${defect.id}: "${r.find}" is not in ${row.id}.${r.field}`)
    row[r.field] = row[r.field].split(r.find).join(r.with)
  }
}

function dropDecisionPoints(msel) {
  const touched = []
  for (const row of msel) {
    const event = row.event.replace(DECISION_LABEL, '')
    const action = row.expectedAction.replace(DECISION_LABEL, '')
    const retag = row.purposeTag === 'DECISION_POINT'
    if (!retag && event === row.event && action === row.expectedAction) continue
    if (retag) row.purposeTag = 'CORE_NARRATIVE'
    row.event = event
    row.expectedAction = action
    touched.push(row.id)
  }
  return touched
}

/** Apply one defect to `msel` in place; returns the rows a note may cite. */
function applyOne(msel, defect) {
  if (!DEFECT_KINDS.includes(defect.kind))
    throw new Error(`defect ${defect.id}: unknown kind "${defect.kind}"`)
  if (defect.kind === 'missing_decision_point') {
    const rows = dropDecisionPoints(msel)
    if (!rows.length) throw new Error(`defect ${defect.id}: the scenario has no decision point`)
    return { rows, anyRow: true }
  }
  const i = rowIndex(msel, defect.row, defect)
  if (defect.kind === 'duplicate_row') {
    if (!defect.copyId || msel.some((r) => r.id === defect.copyId))
      throw new Error(`defect ${defect.id}: copyId must be a new row id`)
    msel.splice(i + 1, 0, { ...structuredClone(msel[i]), id: defect.copyId })
    return { rows: [defect.row, defect.copyId], anyRow: false }
  }
  editRow(msel[i], defect)
  if (defect.kind === 'time_order') {
    const near = [msel[i - 1]?.id, defect.row, msel[i + 1]?.id].filter(Boolean)
    return { rows: near, anyRow: false }
  }
  return { rows: [defect.row], anyRow: false }
}

/**
 * The scenario with the defects applied (a copy; stored warnings cleared so only the new
 * critique's notes are scored) and the planted defects to match notes against.
 */
export function applyDefects(scenario, file) {
  const s = structuredClone(scenario)
  s.warnings = []
  const planted = file.defects.map((d) => {
    if (!d.id || !Array.isArray(d.words) || !d.words.length)
      throw new Error(`defect ${d.id ?? '?'}: needs an id and words`)
    return { id: d.id, kind: d.kind, words: d.words, ...applyOne(s.msel, d) }
  })
  return { scenario: s, planted }
}

const noteText = (n) => `${n.message ?? ''} ${n.suggestion ?? ''}`.toLowerCase()

/** Does critique note `note` find planted defect `d`: the right row and one of its words. */
export function noteMatches(note, d) {
  const onRow = note.rowId ? d.rows.includes(note.rowId) : d.anyRow
  if (!onRow) return false
  const text = noteText(note)
  return d.words.some((w) => text.includes(w.toLowerCase()))
}
