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

/** What the defective row held before (`clean`) and after the edit, for the later check. */
function fieldChecks(clean, row, defect) {
  const set = Object.keys(defect.set ?? {}).map((field) => ({
    field,
    planted: row[field],
    clean: clean[field],
  }))
  const replaced = (defect.replace ?? []).map((r) => ({
    field: r.field,
    contains: r.with,
    planted: row[r.field],
    clean: clean[r.field],
  }))
  return [...set, ...replaced]
}

/** Apply one defect to `msel` in place; returns the rows a note may cite. */
function applyOne(msel, defect) {
  if (!DEFECT_KINDS.includes(defect.kind))
    throw new Error(`defect ${defect.id}: unknown kind "${defect.kind}"`)
  if (defect.kind === 'missing_decision_point') {
    const was = msel.filter((r) => r.purposeTag === 'DECISION_POINT')
    const rows = dropDecisionPoints(msel)
    if (!rows.length) throw new Error(`defect ${defect.id}: the scenario has no decision point`)
    const probe = { type: 'decision_point', count: was.length, phases: was.map((r) => r.phaseId) }
    return { rows, anyRow: true, probe }
  }
  const i = rowIndex(msel, defect.row, defect)
  if (defect.kind === 'duplicate_row') {
    if (!defect.copyId || msel.some((r) => r.id === defect.copyId))
      throw new Error(`defect ${defect.id}: copyId must be a new row id`)
    msel.splice(i + 1, 0, { ...structuredClone(msel[i]), id: defect.copyId })
    const copy = msel[i + 1]
    return {
      rows: [defect.row, defect.copyId],
      anyRow: false,
      probe: { type: 'duplicate', row: defect.row, copyId: defect.copyId, event: copy.event },
    }
  }
  const clean = structuredClone(msel[i])
  editRow(msel[i], defect)
  const probe = { type: 'fields', row: defect.row, checks: fieldChecks(clean, msel[i], defect) }
  if (defect.kind === 'time_order') {
    const near = [msel[i - 1]?.id, defect.row, msel[i + 1]?.id].filter(Boolean)
    return { rows: near, anyRow: false, probe }
  }
  return { rows: [defect.row], anyRow: false, probe }
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

const words = (text) =>
  new Set(
    String(text ?? '')
      .toLowerCase()
      .match(/[a-z0-9]{2,}/g) ?? [],
  )

/** Share of words two texts have in common (Jaccard, 0 to 1); two empty texts are identical. */
export function similarity(a, b) {
  const x = words(a)
  const y = words(b)
  if (!x.size && !y.size) return 1
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / (x.size + y.size - both)
}

/** Share of the shorter text's words that the other has (1 when one text contains the other). */
export function overlap(a, b) {
  const x = words(a)
  const y = words(b)
  if (!x.size && !y.size) return 1
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / Math.min(x.size, y.size || 1)
}

/** Free-text fields count as changed once less than this share of the words is shared. */
export const SAME_TEXT = 0.9

const minutes = (t) => {
  const [h, m] = String(t ?? '')
    .split(':')
    .map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN
}

/** A time is fixed when it is the clean one, or sits between its neighbours again. */
function timeFixed(msel, row, check) {
  if (row.time === check.clean) return true
  if (row.time === check.planted) return false
  const i = msel.indexOf(row)
  const t = minutes(row.time)
  const lo = minutes(msel[i - 1]?.time)
  const hi = minutes(msel[i + 1]?.time)
  return t >= (Number.isNaN(lo) ? -Infinity : lo) && t <= (Number.isNaN(hi) ? Infinity : hi)
}

/**
 * Fixed once the field is closer to the clean value than to the planted one (so an unrelated
 * rewrite is not a fix); for a replaced identifier the planted string must also be gone.
 */
function fieldFixed(msel, row, check) {
  if (check.field === 'time') return timeFixed(msel, row, check)
  const now = row[check.field]
  if (check.contains !== undefined && String(now ?? '').includes(check.contains)) return false
  const toClean = similarity(now, check.clean)
  const toPlanted = similarity(now, check.planted)
  return check.contains !== undefined ? toClean >= toPlanted && toClean >= 0.5 : toClean > toPlanted
}

function duplicateFixed(p, msel) {
  const copy = msel.find((r) => r.id === p.copyId)
  const original = msel.find((r) => r.id === p.row)
  if (!copy || !original) return true // either one removed
  const apart = similarity(copy.event, original.event) < SAME_TEXT
  const echoed = msel.some((r) => r !== copy && similarity(r.event, copy.event) >= SAME_TEXT)
  return apart && !echoed
}

function decisionPointBack(p, msel) {
  const back = msel.filter((r) => r.purposeTag === 'DECISION_POINT')
  return back.length >= p.count || back.some((r) => p.phases.includes(r.phaseId))
}

/**
 * Is planted defect `d` gone from `msel` (the revised rows)? A duplicate is fixed when either row
 * is removed or the copy is rewritten into something unlike every row; a decision point when as
 * many exist as before or one is back in a phase that lost one; an edited field when it is closer
 * to the clean value than to the planted one. A deleted row fixes none of the others (it is damage).
 */
export function isFixed(d, msel) {
  const p = d.probe
  if (!p) return false
  if (p.type === 'decision_point') return decisionPointBack(p, msel)
  if (p.type === 'duplicate') return duplicateFixed(p, msel)
  const row = msel.find((r) => r.id === p.row)
  return !!row && p.checks.some((c) => fieldFixed(msel, row, c))
}
