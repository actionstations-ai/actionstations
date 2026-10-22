// Map validated stage outputs into the Scenario. Ids are ULIDs except roles (id = sanitized
// key, so prompts and MSEL rows can refer to "ops", "it", "pio") and MSEL rows (the
// user-visible "I-07"). Citation keys are resolved by the caller and passed in.
import {
  exerciseMinutes,
  formatExerciseTime,
  type BriefingOutput,
  type Citation,
  type HandbookOutput,
  type HotwashOutput,
  type IdeasOutput,
  type MselPhaseOutput,
  type MselRow,
  type ObjectivesRolesOutput,
  type OverviewOutput,
  type Phase,
  type PhasePlanOutput,
  type Role,
  type RubricOutput,
  type Scenario,
  type ScenarioIdea,
} from '@shared/schemas'
import { newId } from '../lib/ids'
import type { RetrievedChunk } from './retrieval'
import { resolveCitations } from './retrieval'
import {
  repairPlayerSources,
  repairRubricLinks,
  type LinkRepair,
  type SourceRepair,
} from './sources'

export const DEFAULT_START_WALL_CLOCK = '09:00'

/** Separates a phase's one-sentence goal from the beats the MSEL author needs. */
export const BEATS_MARKER = 'Key beats:'

/** The goal without its beats, for the MSEL header and later stages. */
export function goalSummary(goal: string): string {
  const at = goal.indexOf(BEATS_MARKER)
  return (at < 0 ? goal : goal.slice(0, at)).trim()
}

/** "(C3)", "[C1, C2]", "(see C4)" written into prose; bare "C1" is left alone (Gate C1 exists). */
const KEY_REFS = /\s*[([]\s*(?:see|per|cf\.?)?\s*C\d+(?:\s*[,;/&]\s*(?:and\s+)?C\d+)*\s*[)\]]/gi

/** "gates (C1, C2)", "Concourse (C4)": a facility identifier list, not a citation. */
const FACILITY_BEFORE =
  /\b(?:gates?|concourses?|doors?|stands?|piers?|terminals?|bays?|zones?|levels?|lots?|hangars?|rooms?|positions?)\s*$/i

export function stripCitationKeys(text: string): string {
  return text
    .replace(KEY_REFS, (match, offset: number, whole: string) =>
      FACILITY_BEFORE.test(whole.slice(0, offset)) ? match : '',
    )
    .replace(/[ \t]{2,}/g, ' ')
}

/** Strip key references from every string in a stage output; arrays of bare keys survive. */
export function stripKeysDeep<T>(value: T): T {
  if (typeof value === 'string') return stripCitationKeys(value) as T
  if (Array.isArray(value)) return value.map(stripKeysDeep) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripKeysDeep(v)]),
    ) as T
  }
  return value
}

const US_STATES: Record<string, string> = {
  AL: 'alabama',
  AK: 'alaska',
  AZ: 'arizona',
  AR: 'arkansas',
  CA: 'california',
  CO: 'colorado',
  CT: 'connecticut',
  DE: 'delaware',
  FL: 'florida',
  GA: 'georgia',
  HI: 'hawaii',
  ID: 'idaho',
  IL: 'illinois',
  IN: 'indiana',
  IA: 'iowa',
  KS: 'kansas',
  KY: 'kentucky',
  LA: 'louisiana',
  ME: 'maine',
  MD: 'maryland',
  MA: 'massachusetts',
  MI: 'michigan',
  MN: 'minnesota',
  MS: 'mississippi',
  MO: 'missouri',
  MT: 'montana',
  NE: 'nebraska',
  NV: 'nevada',
  NH: 'new hampshire',
  NJ: 'new jersey',
  NM: 'new mexico',
  NY: 'new york',
  NC: 'north carolina',
  ND: 'north dakota',
  OH: 'ohio',
  OK: 'oklahoma',
  OR: 'oregon',
  PA: 'pennsylvania',
  RI: 'rhode island',
  SC: 'south carolina',
  SD: 'south dakota',
  TN: 'tennessee',
  TX: 'texas',
  UT: 'utah',
  VT: 'vermont',
  VA: 'virginia',
  WA: 'washington',
  WV: 'west virginia',
  WI: 'wisconsin',
  WY: 'wyoming',
  DC: 'district of columbia',
}

export interface OrgFacts {
  orgName: string
  city?: string
  region?: string
}

/** US states (names or codes) that `text` mentions. */
function statesIn(text: string): { code: string; name: string }[] {
  const lower = text.toLowerCase()
  const codes = new Set(
    [...text.matchAll(/\b([A-Z]{2})\b/g)].map((m) => m[1]!).filter((c) => c in US_STATES),
  )
  return Object.entries(US_STATES)
    .filter(([code, name]) => codes.has(code) || lower.includes(name))
    .map(([code, name]) => ({ code, name }))
}

export interface GroundedLocation {
  location: string
  /** The state the model named that the documents never mention. */
  ungrounded?: string
}

/**
 * A location naming a US state that neither the retrieved text nor the project mentions is
 * invented geography; fall back to the organization as the project names it.
 */
export function groundLocation(
  location: string,
  chunks: RetrievedChunk[],
  org: OrgFacts,
): GroundedLocation {
  const corpus = [
    ...chunks.map((c) => `${c.hit.headingPath} ${c.hit.text}`),
    org.orgName,
    org.city ?? '',
    org.region ?? '',
  ].join('\n')
  const known = statesIn(corpus)
  const bad = statesIn(location).find((st) => !known.some((k) => k.code === st.code))
  if (!bad) return { location }
  const fallback = [org.orgName, org.city, org.region].filter(Boolean).join(', ')
  return { location: fallback || location, ungrounded: `${bad.name} (${bad.code})` }
}

/** "0:15" / "00:15" / "1:5" → "0:15"; anything unparsable → fallback. */
export function normalizeExerciseTime(raw: string, fallback: string): string {
  const m = /^\s*(\d{1,2})[:.h](\d{1,2})\s*$/.exec(raw)
  if (!m) return fallback
  const minutes = Number(m[1]) * 60 + Number(m[2])
  return Number(m[2]) > 59 ? fallback : formatExerciseTime(minutes)
}

/** Wall clock for an exercise time, from the narrative start ("09:00" + 1:30 = "10:30"). */
export function wallClockAt(startWallClock: string, exerciseTime: string): string {
  const [h, m] = startWallClock.split(':').map(Number)
  const total = ((h ?? 9) * 60 + (m ?? 0) + exerciseMinutes(exerciseTime)) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Role key → SafeId: "Ops Director" → "ops_director"; empty → "role<n>". */
export function roleKeyToId(key: string, index: number): string {
  const cleaned = key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/_+$/, '')
    .slice(0, 64)
  return cleaned || `role${index + 1}`
}

interface CitationCollector {
  chunks: RetrievedChunk[]
  dropped: { rowId?: string; keys: string[] }[]
}

function cite(keys: string[], c: CitationCollector, rowId?: string): Citation[] {
  const { citations, dropped } = resolveCitations(keys, c.chunks)
  if (dropped.length) c.dropped.push({ ...(rowId ? { rowId } : {}), keys: dropped })
  return citations
}

export function mapIdeas(
  out: IdeasOutput,
  chunks: RetrievedChunk[],
): {
  ideas: ScenarioIdea[]
  dropped: CitationCollector['dropped']
} {
  const c: CitationCollector = { chunks, dropped: [] }
  const ideas = out.ideas.map((i) => ({
    id: newId(),
    title: i.title,
    hook: i.hook,
    threat: i.threat,
    systemsAffected: i.systemsAffected,
    sectionsExercised: cite(i.sectionsExercised, c, i.title),
    difficulty: i.difficulty,
    whyItTeaches: i.whyItTeaches,
    suggestedRoles: i.suggestedRoles,
  }))
  return { ideas, dropped: c.dropped }
}

export function applyOverview(
  s: Scenario,
  out: OverviewOutput,
  chunks: RetrievedChunk[],
  org: OrgFacts,
): { dropped: CitationCollector['dropped']; ungroundedLocation?: string } {
  const c: CitationCollector = { chunks, dropped: [] }
  const grounded = groundLocation(out.location, chunks, org)
  s.title = out.title.trim() || s.title
  s.subtitle = out.subtitle.trim() || undefined
  s.overview = {
    theme: out.theme,
    threat: out.threat,
    operationalImpact: out.operationalImpact,
    coreSectionsTested: out.coreSectionsTested.flatMap((cs) => cite([cs.citation], c, 'overview')),
    targetAudience: out.targetAudience,
    location: grounded.location,
  }
  return {
    dropped: c.dropped,
    ...(grounded.ungrounded ? { ungroundedLocation: grounded.ungrounded } : {}),
  }
}

export function applyObjectivesRoles(s: Scenario, out: ObjectivesRolesOutput): void {
  const prevObjectives = new Map(s.objectives.map((o) => [o.name.toLowerCase(), o.id]))
  s.objectives = out.objectives.map((o) => ({
    id: prevObjectives.get(o.name.toLowerCase()) ?? newId(),
    name: o.name,
    text: o.text,
  }))
  const seen = new Set<string>()
  s.roles = out.roles.map((r, i): Role => {
    let id = roleKeyToId(r.key, i)
    while (seen.has(id)) id = `${id}_${i + 1}`
    seen.add(id)
    return {
      id,
      name: r.name,
      abbreviation: r.abbreviation,
      team: r.team,
      description: r.description,
      standingOrders: r.standingOrders,
    }
  })
  s.criticalResources = out.criticalResources
}

/** Phases keep their ids by index on re-run so MSEL rows of unchanged phases stay attached. */
export function applyPhasePlan(s: Scenario, out: PhasePlanOutput): void {
  let cursor = '0:00'
  const windows = out.phases.map((p) => {
    const startTime = normalizeExerciseTime(p.startTime, cursor)
    const endTime = normalizeExerciseTime(p.endTime, startTime)
    cursor = endTime
    return { startTime, endTime }
  })
  // A model that wrote wall-clock times ("9:00–9:45") instead of elapsed time is shifted
  // back so the first phase starts at 0:00; the MSEL stage then works in exercise time.
  const offset = exerciseMinutes(windows[0]?.startTime ?? '0:00')
  const shift = (t: string): string => formatExerciseTime(exerciseMinutes(t) - offset)
  s.phases = out.phases.map((p, index): Phase => ({
    id: s.phases[index]?.id ?? newId(),
    index,
    title: p.title,
    goal: p.goal,
    startTime: shift(windows[index]!.startTime),
    endTime: shift(windows[index]!.endTime),
  }))
  const live = new Set(s.phases.map((p) => p.id))
  s.msel = s.msel.filter((r) => live.has(r.phaseId))
}

const ALL_KEYS = new Set(['all', 'everyone', 'all players', 'all teams', '*'])

export interface ResolvedTo {
  ids: string[]
  label: string
  /** Keys that matched no role; kept in the label so the facilitator still sees them. */
  unresolved: string[]
}

const norm = (s: string): string => s.trim().toLowerCase()

/** Role by exact key / abbreviation / name, else by a unique prefix match ("sec" → security). */
function roleFor(key: string, roles: Role[]): Role | undefined {
  const k = norm(key)
  const exact = roles.find((r) => [r.id, r.abbreviation, r.name].some((x) => norm(x) === k))
  if (exact) return exact
  const prefix = roles.filter(
    (r) => k.length >= 2 && (norm(r.id).startsWith(k) || k.startsWith(norm(r.id))),
  )
  return prefix.length === 1 ? prefix[0] : undefined
}

/** Resolve "to" keys against roles by id, abbreviation or name (case-insensitive). */
export function resolveToRoles(to: string[], roles: Role[]): ResolvedTo {
  if (to.some((t) => ALL_KEYS.has(norm(t)))) {
    return { ids: roles.map((r) => r.id), label: 'All', unresolved: [] }
  }
  const ids: string[] = []
  const labels: string[] = []
  const unresolved: string[] = []
  for (const t of to) {
    const r = roleFor(t, roles)
    if (r && !ids.includes(r.id)) {
      ids.push(r.id)
      labels.push(r.abbreviation || r.name)
    } else if (!r && t.trim()) {
      labels.push(t.trim())
      unresolved.push(t.trim())
    }
  }
  return { ids, label: labels.join(', '), unresolved }
}

/** Give a colliding "I-07" the next free number; START/END style ids are kept unique too. */
function uniqueRowId(raw: string, taken: Set<string>): string {
  const id = raw.trim().replace(/\s+/g, '') || 'I-00'
  if (!taken.has(id)) return id
  const m = /^(.*?)(\d+)([a-z]?)$/i.exec(id)
  let n = m ? Number(m[2]) + 1 : 1
  const prefix = m ? m[1] : `${id}-`
  const suffix = m?.[3] ?? ''
  for (;;) {
    const candidate = `${prefix}${String(n).padStart(2, '0')}${suffix}`
    if (!taken.has(candidate)) return candidate
    n++
  }
}

export interface MselMapResult {
  rows: MselRow[]
  dropped: CitationCollector['dropped']
  renamed: { from: string; to: string }[]
  /** Rows the model repeated verbatim (same event text); only the first is kept. */
  duplicates: string[]
  /** "to" keys that matched no role, per kept row. */
  unresolvedTo: { rowId: string; keys: string[] }[]
  /** Control rows the model omitted and the mapper added ("START", "END"). */
  synthesized: string[]
  /** START/END rows written into a phase that is not the first/last one; dropped. */
  stray: string[]
  /** Rows whose source was a player role, re-sourced or turned into a facilitator prompt. */
  resourced: SourceRepair[]
}

/** A START row belongs to the first phase and an END row to the last; elsewhere they are noise. */
function dropStrayBoundaryRows(
  rows: OutRow[],
  phase: Phase,
  phaseCount: number,
): { rows: OutRow[]; stray: string[] } {
  const stray: OutRow[] = rows.filter((r) => {
    const id = r.id.trim().toUpperCase()
    const isStart = id === 'START' || id === 'STARTEX' || r.purposeTag === 'STARTEX'
    const isEnd = id === 'END' || id === 'ENDEX' || r.purposeTag === 'ENDEX'
    return (isStart && phase.index !== 0) || (isEnd && phase.index !== phaseCount - 1)
  })
  return { rows: rows.filter((r) => !stray.includes(r)), stray: stray.map((r) => r.id) }
}

/** A stored row back in the model's output shape, citations re-keyed against `retrieved`. */
export function rowToOut(row: MselRow, retrieved: RetrievedChunk[]): OutRow {
  const keyOf = new Map(retrieved.map((c) => [c.hit.chunkId, c.key]))
  const to = row.toRoleIds.length ? row.toRoleIds : row.toLabel ? [row.toLabel] : ['all']
  return {
    id: row.id,
    time: row.time,
    from: row.from,
    to,
    event: row.event,
    expectedAction: row.expectedAction,
    purposeTag: row.purposeTag,
    format: row.format ?? 'scenario_update',
    citations: row.citations.flatMap((c) => {
      const key = c.chunkId === undefined ? undefined : keyOf.get(c.chunkId)
      return key ? [key] : []
    }),
  }
}

/** Rows whose first 100 normalized characters match are the same inject (a reused tweet with new metrics). */
const eventKey = (event: string): string =>
  event
    .replace(/^[^:"'\n]{0,40}:\s*/, '') // "Radio Call:" / "Face-to-Face:" channel labels
    .replace(/["'\u2018\u2019\u201c\u201d]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 100)

type OutRow = MselPhaseOutput['rows'][number]

/** STARTEX opens the first phase and ENDEX closes the last one even when the model forgot them. */
function withBoundaryRows(
  rows: OutRow[],
  phase: Phase,
  phaseCount: number,
  startWallClock: string,
  kept: MselRow[] = [],
): { rows: OutRow[]; synthesized: string[] } {
  const synthesized: string[] = []
  const out = [...rows]
  const has = (tag: OutRow['purposeTag']): boolean =>
    [...rows, ...kept].some((r) => boundaryTag(r.id, r.purposeTag) === tag)
  if (phase.index === 0 && !has('STARTEX')) {
    synthesized.push('START')
    out.unshift({
      id: 'START',
      time: phase.startTime,
      from: 'Facilitator',
      to: ['all'],
      event: `STARTEX (Start Exercise). Current time: ${startWallClock}. Normal operations.`,
      expectedAction: 'Establish baseline operations and review the relevant plan sections.',
      purposeTag: 'STARTEX',
      format: 'startex_card',
      citations: [],
    })
  }
  if (phase.index === phaseCount - 1 && !has('ENDEX')) {
    synthesized.push('END')
    out.push({
      id: 'END',
      time: phase.endTime,
      from: 'Facilitator',
      to: ['all'],
      event: 'ENDEX (End Exercise). The incident is resolved.',
      expectedAction: 'Move to the Hot Wash / Debrief.',
      purposeTag: 'ENDEX',
      format: 'endex_card',
      citations: [],
    })
  }
  return { rows: out, synthesized }
}

/** END_GAME belongs to the last phase; elsewhere it is ordinary narrative. */
function phaseTag(
  tag: OutRow['purposeTag'],
  phase: Phase,
  phaseCount: number,
): OutRow['purposeTag'] {
  return tag === 'END_GAME' && phase.index !== phaseCount - 1 ? 'CORE_NARRATIVE' : tag
}

/** The START / END control rows always carry the STARTEX / ENDEX tags, whatever the model wrote. */
function boundaryTag(id: string, tag: MselRow['purposeTag']): MselRow['purposeTag'] {
  const u = id.toUpperCase()
  if (u === 'START' || u === 'STARTEX') return 'STARTEX'
  if (u === 'END' || u === 'ENDEX') return 'ENDEX'
  return tag
}

/** Drop rows whose event text repeats an earlier row's (models sometimes emit a row twice). */
function dedupeRows(
  rows: MselPhaseOutput['rows'],
  alreadySeen: Iterable<string>,
): {
  kept: MselPhaseOutput['rows']
  duplicates: string[]
} {
  const seen = new Set<string>(alreadySeen)
  const kept: MselPhaseOutput['rows'] = []
  const duplicates: string[] = []
  for (const r of rows) {
    const key = eventKey(r.event)
    if (seen.has(key)) duplicates.push(r.id)
    else {
      seen.add(key)
      kept.push(r)
    }
  }
  return { kept, duplicates }
}

export interface ApplyMselOptions {
  /** Existing rows of the phase to keep verbatim (the critique revision's unflagged rows). */
  keepIds?: Set<string>
}

/** The phase's current rows split into those kept verbatim (locked or requested) and the rest. */
function keptRows(s: Scenario, phase: Phase, opts: ApplyMselOptions): MselRow[] {
  return s.msel.filter((r) => r.phaseId === phase.id && (r.locked || opts.keepIds?.has(r.id)))
}

/**
 * Rows for one phase, replacing what that phase had before; other phases are untouched.
 * Locked rows (and `keepIds`) stay exactly as they are and a model row with their id is
 * dropped; a regenerated row keeps the inject page linked to its id (injectId).
 */
export function applyMselPhase(
  s: Scenario,
  phase: Phase,
  out: MselPhaseOutput,
  chunks: RetrievedChunk[],
  opts: ApplyMselOptions = {},
): MselMapResult {
  const c: CitationCollector = { chunks, dropped: [] }
  const others = s.msel.filter((r) => r.phaseId !== phase.id)
  const kept = keptRows(s, phase, opts)
  const keptIds = new Set(kept.map((r) => r.id.toUpperCase()))
  const injectIds = new Map(
    s.msel.filter((r) => r.phaseId === phase.id && r.injectId).map((r) => [r.id, r.injectId!]),
  )
  const taken = new Set([...others, ...kept].map((r) => r.id))
  const renamed: { from: string; to: string }[] = []
  const unresolvedTo: MselMapResult['unresolvedTo'] = []
  const start = s.brief.startWallClock ?? DEFAULT_START_WALL_CLOCK
  const fresh = out.rows.filter((r) => !keptIds.has(r.id.trim().toUpperCase()))
  const overKept = out.rows.filter((r) => keptIds.has(r.id.trim().toUpperCase())).map((r) => r.id)
  const { rows: inPlace, stray } = dropStrayBoundaryRows(fresh, phase, s.phases.length)
  const { rows: sourced, repairs } = repairPlayerSources(inPlace, s.roles)
  const bounded = withBoundaryRows(sourced, phase, s.phases.length, start, kept)
  const deduped = dedupeRows(
    bounded.rows,
    [...others, ...kept].map((r) => eventKey(r.event)),
  )
  const rows = deduped.kept.map((r): MselRow => {
    const id = uniqueRowId(r.id, taken)
    if (id !== r.id.trim()) renamed.push({ from: r.id, to: id })
    taken.add(id)
    const time = normalizeExerciseTime(r.time, phase.startTime)
    const to = resolveToRoles(r.to, s.roles)
    if (to.unresolved.length) unresolvedTo.push({ rowId: id, keys: to.unresolved })
    const injectId = injectIds.get(id)
    return {
      id,
      phaseId: phase.id,
      time,
      wallClock: wallClockAt(start, time),
      from: r.from,
      toRoleIds: to.ids,
      toLabel: to.label,
      event: r.event,
      expectedAction: r.expectedAction,
      purposeTag: phaseTag(boundaryTag(id, r.purposeTag), phase, s.phases.length),
      format: r.format,
      ...(injectId ? { injectId } : {}),
      citations: cite(r.citations, c, id),
      locked: false,
    }
  })
  const sorted = [...kept, ...rows].sort(
    (a, b) => exerciseMinutes(a.time) - exerciseMinutes(b.time),
  )
  s.msel = [...others, ...sorted].sort(
    (a, b) =>
      phaseIndex(s, a.phaseId) - phaseIndex(s, b.phaseId) ||
      exerciseMinutes(a.time) - exerciseMinutes(b.time),
  )
  return {
    rows: sorted,
    dropped: c.dropped,
    renamed,
    duplicates: [...overKept, ...deduped.duplicates],
    unresolvedTo,
    synthesized: bounded.synthesized,
    stray,
    resourced: repairs,
  }
}

const phaseIndex = (s: Scenario, phaseId: string): number =>
  s.phases.find((p) => p.id === phaseId)?.index ?? Number.MAX_SAFE_INTEGER

export function applyHandbook(s: Scenario, out: HandbookOutput): void {
  s.simcellScripts = out.simcellScripts
}

/** Rubric links to rows that do not exist are repaired to the nearest real row or dropped. */
export function applyRubric(s: Scenario, out: RubricOutput): LinkRepair[] {
  const prev = new Map((s.rubric?.metrics ?? []).map((m) => [m.name.toLowerCase(), m.id]))
  s.rubric = {
    metrics: out.metrics.map((m) => ({
      id: prev.get(m.name.toLowerCase()) ?? newId(),
      name: m.name,
      points: Math.max(0, m.points),
      fail: m.fail,
      pass: m.pass,
      excellence: m.excellence,
      linkedInjectIds: m.linkedInjectIds,
      objectiveRefs: m.objectiveRefs,
    })),
  }
  return repairRubricLinks(s.rubric.metrics, s.msel)
}

export function applyHotwash(s: Scenario, out: HotwashOutput): void {
  s.hotwash = {
    method: out.method,
    methodDescription: out.methodDescription,
    questions: out.questions.map((q) => ({
      topic: q.topic,
      text: q.text,
      ...(q.objectiveRef ? { objectiveRef: q.objectiveRef } : {}),
    })),
  }
}

/** The briefing carries no scenario fields of its own beyond the rendered document. */
export function briefingTeams(s: Scenario, out: BriefingOutput) {
  return out.teams.map((t) => ({
    ...t,
    roles: t.roleKeys.map((k) => resolveToRoles([k], s.roles)).flatMap((r) => r.ids),
  }))
}
