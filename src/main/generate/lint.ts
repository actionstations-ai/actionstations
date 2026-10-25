// Deterministic checks on a Scenario (docs/04 §3): timing, ids, role coverage, the inject
// mix per phase, decision points, STARTEX/ENDEX, density, citations and rubric integrity.
// Pure: no I/O, so scenarios:lint and the pipeline's critique step share it. The mix rules
// come from the domain profile (which role is "public", "technical", "security") and the
// threat family (whether every phase needs a technical clue, what the decision point must
// involve) — ADR-0014. Without a DomainContext the generic profile and the brief's threat
// family (default: cyber) apply, which is the pre-profile behaviour.
import {
  exerciseMinutes,
  type LintWarning,
  type MselRow,
  type Phase,
  type Role,
  type Scenario,
} from '@shared/schemas'
import { domainContext, roleHeuristics, type DomainContext } from './domain'
import {
  DUPLICATE_EVENT,
  INJECT_PLAYER_VOICE,
  lintDuplicateEvents,
  lintPlayerVoice,
} from './lint-structure'
import { CLOCK_MISMATCH, DATE_DRIFT, lintBrief, START_TIME_MISMATCH } from './lint-brief'
import {
  CONTACT_REAL_LOOKING,
  lintRealism,
  OUTSIDE_AGENCY_DECIDES,
  RESTORE_TOO_FAST,
} from './lint-realism'

export const DENSITY_MIN_MINUTES = 5
export const DENSITY_MAX_MINUTES = 20
export const DENSITY_DENSE = 'DENSITY_DENSE'

/** Rows per hour of exercise the reference MSEL runs (24 in 4 h, #223), and the ceiling. */
export const TARGET_ROWS_PER_HOUR = 6
export const MAX_ROWS_PER_HOUR = 7

/**
 * Row counts for a phase of `minutes`: about one inject every 10 minutes, at most one every
 * 8.5 (20–28 rows for a 4-hour exercise). A short phase still gets room for its mix.
 */
export function phaseRowCounts(minutes: number): { targetRowCount: number; maxRowCount: number } {
  const target = Math.max(4, Math.round((minutes * TARGET_ROWS_PER_HOUR) / 60))
  const max = Math.max(target + 1, Math.round((minutes * MAX_ROWS_PER_HOUR) / 60))
  return { targetRowCount: target, maxRowCount: max }
}

/**
 * The most rows code keeps in a phase (the mix pass's room, the overfill trim): one above
 * what the prompt asks for, so a model a row over the steer is not cut. DENSITY_DENSE notes it.
 */
export const phaseRowCap = (minutes: number): number => phaseRowCounts(minutes).maxRowCount + 1

type W = LintWarning
const warn = (code: string, message: string, extra: Partial<W> = {}): W => ({
  code,
  severity: 'warning',
  message,
  source: 'lint',
  ...extra,
})
const info = (code: string, message: string, extra: Partial<W> = {}): W => ({
  ...warn(code, message, extra),
  severity: 'info',
})
const error = (code: string, message: string, extra: Partial<W> = {}): W => ({
  ...warn(code, message, extra),
  severity: 'error',
})

export function findRole(roles: Role[], pattern: RegExp): Role | undefined {
  return roles.find((r) => pattern.test(`${r.id} ${r.abbreviation} ${r.name}`))
}

/** The context to lint against when the caller has none: generic profile, the brief's threat. */
const contextFor = (s: Scenario, domain?: DomainContext): DomainContext =>
  domain ?? domainContext({ orgType: 'generic' }, s)

const rowsOf = (s: Scenario, phaseId: string): MselRow[] =>
  s.msel.filter((r) => r.phaseId === phaseId)

const phaseLabel = (p: Phase): string => `phase ${p.index + 1} "${p.title}"`

function lintTiming(s: Scenario): W[] {
  const out: W[] = []
  let last = -1
  for (const row of s.msel) {
    const t = exerciseMinutes(row.time)
    if (t < last)
      out.push(
        warn('TIME_ORDER', `Row ${row.id} at ${row.time} is earlier than the previous row`, {
          rowId: row.id,
        }),
      )
    last = Math.max(last, t)
    const phase = s.phases.find((p) => p.id === row.phaseId)
    if (!phase) {
      out.push(error('ROW_NO_PHASE', `Row ${row.id} belongs to no phase`, { rowId: row.id }))
      continue
    }
    if (t < exerciseMinutes(phase.startTime) || t > exerciseMinutes(phase.endTime)) {
      out.push(
        warn(
          'ROW_OUTSIDE_PHASE',
          `Row ${row.id} (${row.time}) is outside "${phase.title}" (${phase.startTime}–${phase.endTime})`,
          { rowId: row.id },
        ),
      )
    }
  }
  return out
}

function lintIds(s: Scenario): W[] {
  const seen = new Map<string, number>()
  for (const r of s.msel) seen.set(r.id, (seen.get(r.id) ?? 0) + 1)
  return [...seen]
    .filter(([, n]) => n > 1)
    .map(([id]) =>
      error('DUPLICATE_ROW_ID', `Inject id ${id} is used more than once`, { rowId: id }),
    )
}

/** An inject whose source is a player role is a player decision written as an inject. */
const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')
/** "IT Director (Technical Incident Command)" → "it director". */
const bareName = (name: string): string => norm(name.replace(/\s*\(.*?\)\s*/g, ' '))

/** The player role a free-text source refers to, matching key, abbreviation or (bare) name. */
export function roleNamedBy(text: string, roles: Role[]): Role | undefined {
  const t = norm(text)
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .trim()
  if (t.length < 2) return undefined
  return roles.find((r) => {
    const name = bareName(r.name)
    return (
      t === norm(r.id) ||
      (!!r.abbreviation && t === norm(r.abbreviation)) ||
      t === name ||
      (t.length >= 4 && (name.startsWith(t) || t.startsWith(name)))
    )
  })
}

function lintFromRoles(s: Scenario): W[] {
  return s.msel.flatMap((row) => {
    if (row.purposeTag === 'STARTEX' || row.purposeTag === 'ENDEX') return []
    const role = roleNamedBy(row.from, s.roles)
    if (!role) return []
    return [
      warn(
        'FROM_PLAYER_ROLE',
        `Row ${row.id} comes from "${row.from}", a player role (${role.name}); injects come from the outside world and the players' decision belongs in the expected action`,
        { rowId: row.id },
      ),
    ]
  })
}

const DECISION_VERBS =
  /\b(activates?|declares?|authori[sz]es?|orders?|approves?|decides?|initiates?|directs?|assumes?|announces?|confirms?)\b/i
const FACILITATOR = /facilitator|controller|simcell|exercise director/i

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Where `name` occurs in `text` as a whole word (case-insensitive), so "IC" never matches
 * inside "RPIC" (#251). Returns the index just past each occurrence.
 */
function wholeWordEnds(text: string, name: string): number[] {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu')
  return [...text.matchAll(re)].map((m) => m.index + m[0].length)
}

/** The first "<role name> <decision verb>…" in a facilitator row's text, if any. */
function scriptedDecision(text: string, r: Role): string | undefined {
  const names = [r.name, bareName(r.name), r.abbreviation, r.id].filter(
    (n): n is string => !!n && n.length >= 2,
  )
  for (const n of names) {
    for (const end of wholeWordEnds(text, n)) {
      const after = text.slice(end, end + 80)
      if (DECISION_VERBS.test(after))
        return `${text.slice(end - n.length, end)} ${after.slice(0, 40).trim()}`
    }
  }
  return undefined
}

/** A facilitator row that narrates what a player role did scripts the players' decisions. */
function lintScriptedDecisions(s: Scenario): W[] {
  return s.msel.flatMap((row) => {
    if (!FACILITATOR.test(row.from)) return []
    if (row.purposeTag === 'STARTEX' || row.purposeTag === 'ENDEX') return []
    for (const r of s.roles) {
      const quote = scriptedDecision(row.event, r)
      if (!quote) continue
      return [
        warn(
          'INJECT_SCRIPTS_PLAYERS',
          `Row ${row.id} narrates a decision by ${r.name} ("…${quote}…"); let the players make it and describe it in the expected action`,
          { rowId: row.id },
        ),
      ]
    }
    return []
  })
}

/** Distinctive strings from the reference Scenario 3 (and the prompt examples) that belong to no other scenario. */
const REFERENCE_STRINGS = [
  '#4492',
  'purgatory',
  'flight 666',
  'browns tickets',
  '20% of flights',
  'random_gate_generator',
  'travelguy99',
  'cleveland moms',
  'ops_intern_03',
  // Style examples inside prompts/msel_phase.md (a water utility, a transit agency, a venue)
  // must not leak either.
  '#20417',
  'ridgeview',
  'chlorine dosing',
  'pumping stations have dropped',
  'supervisor 12',
  'bus 2231',
  'elm and 9th',
  'sectiononetwofan',
  '#stadiumfail',
]
const REFERENCE_TOPIC = /\bfids\b|aodb|flight information display/i

function lintReferenceLeak(s: Scenario): W[] {
  const about = `${s.title} ${s.subtitle ?? ''} ${s.overview?.threat ?? ''} ${s.overview?.theme ?? ''}`
  if (REFERENCE_TOPIC.test(about)) return []
  return s.msel.flatMap((row) => {
    const text = `${row.event} ${row.expectedAction}`.toLowerCase()
    const hit = REFERENCE_STRINGS.find((x) => text.includes(x))
    return hit
      ? [
          warn(
            'REFERENCE_LEAK',
            `Row ${row.id} reuses "${hit}" from the reference Scenario 3; invent details for this scenario`,
            { rowId: row.id },
          ),
        ]
      : []
  })
}

export interface MixGap {
  code: string
  /** What the phase still needs, phrased for the model ("one NOISE or RED_HERRING inject"). */
  need: string
  message: string
  /** The role the gap is about (role coverage, PIO pressure, the technical clue). */
  roleId?: string
}

/** Control rows (STARTEX, TIME_JUMP, ENDEX) go to everyone and give no role work to do. */
const CONTROL_TAGS = new Set<MselRow['purposeTag']>(['STARTEX', 'TIME_JUMP', 'ENDEX'])

/** A row addressed to the whole room ("all", or every role listed). */
export function isBroadcast(row: MselRow, roles: Role[]): boolean {
  if (norm(row.toLabel ?? '') === 'all') return true
  return roles.length > 1 && roles.every((r) => row.toRoleIds.includes(r.id))
}

/**
 * The phase (0-based) that carries the exercise's single DECISION_POINT: the middle of the
 * exercise (phase 3 of 4, phase 2 of 2 or 3), the only phase of a one-phase exercise.
 */
export function decisionPhaseIndex(phaseCount: number): number {
  return phaseCount <= 1 ? 0 : Math.floor(phaseCount / 2)
}

const MIX_NO_DECISION_POINT = 'MIX_NO_DECISION_POINT'
export const DECISION_POINT_SCOPE = 'DECISION_POINT_SCOPE'

/** The decision-point need, in the threat family's words (plus what it must involve). */
function decisionNeed(domain: DomainContext): string {
  const { threat } = domain
  const examples = threat.decisionPointExamples.slice(0, 3).join('; ')
  const must = threat.lint.decisionMustMention
    ? `, taken with ${threat.lint.decisionMustMention.description}`
    : ''
  return `the exercise's one DECISION_POINT inject: a high-consequence call with a cost on both sides${must} (${examples})`
}

function decisionGap(s: Scenario, phase: Phase, domain: DomainContext): MixGap[] {
  if (phase.index !== decisionPhaseIndex(s.phases.length)) return []
  if (s.msel.some((r) => r.purposeTag === 'DECISION_POINT')) return []
  return [
    {
      code: MIX_NO_DECISION_POINT,
      need: decisionNeed(domain),
      message: `No DECISION_POINT inject in ${phaseLabel(phase)}, the phase that should carry it`,
    },
  ]
}

/** Inject-mix and role-coverage gaps of one phase (docs/04 §3). Empty when the phase is fine. */
export function phaseMixGaps(s: Scenario, phase: Phase, domainIn?: DomainContext): MixGap[] {
  const rows = rowsOf(s, phase.id)
  if (!rows.length) return []
  const domain = contextFor(s, domainIn)
  const heur = roleHeuristics(domain.profile)
  const label = phaseLabel(phase)
  const has = (pred: (r: MselRow) => boolean): boolean => rows.some(pred)
  /** Addressed to this role specifically, not as part of a broadcast. */
  const aimedAt = (r: MselRow, roleId: string): boolean =>
    r.toRoleIds.includes(roleId) && !isBroadcast(r, s.roles)
  const gaps: MixGap[] = []
  const pio = findRole(s.roles, heur.public)
  const clueRole = domain.threat.lint.clueRole
  const it = domain.threat.lint.clueRequired ? findRole(s.roles, heur[clueRole]) : undefined
  if (!has((r) => r.purposeTag === 'CORE_NARRATIVE')) {
    gaps.push({
      code: 'MIX_NO_CORE',
      need: 'one CORE_NARRATIVE inject that advances the main storyline',
      message: `No CORE_NARRATIVE inject in ${label}`,
    })
  }
  if (!has((r) => r.purposeTag === 'NOISE' || r.purposeTag === 'RED_HERRING')) {
    gaps.push({
      code: 'MIX_NO_NOISE',
      need: 'one NOISE inject (an unrelated distraction) or RED_HERRING (a plausible false lead)',
      message: `No NOISE or RED_HERRING inject in ${label}`,
    })
  }
  const pressure = new Set(['PRESSURE', 'MISINFORMATION', 'DISTRACTION'])
  if (pio && !has((r) => pressure.has(r.purposeTag) && aimedAt(r, pio.id))) {
    gaps.push({
      code: 'MIX_NO_PIO_PRESSURE',
      need: `one PRESSURE or MISINFORMATION inject addressed to "${pio.id}" (social media, a reporter with a deadline, a rumor)`,
      message: `No PRESSURE or MISINFORMATION inject aimed at ${pio.name} in ${label}`,
      roleId: pio.id,
    })
  }
  const clue = new Set(['CLUE', 'TECH_HURDLE'])
  if (it && !has((r) => clue.has(r.purposeTag) && aimedAt(r, it.id))) {
    gaps.push({
      code: clueRole === 'technical' ? 'MIX_NO_IT_CLUE' : 'MIX_NO_CLUE',
      need: `one CLUE (${domain.threat.clueKinds}) or TECH_HURDLE (${domain.threat.hurdleKinds}) addressed to "${it.id}"`,
      message: `No CLUE or TECH_HURDLE inject aimed at ${it.name} in ${label}`,
      roleId: it.id,
    })
  }
  for (const role of s.roles) {
    if (!has((r) => !CONTROL_TAGS.has(r.purposeTag) && r.toRoleIds.includes(role.id))) {
      gaps.push({
        code: 'ROLE_NO_INJECT',
        need: `one inject addressed to "${role.id}" (${role.name}) that gives that role something to do`,
        message: `${role.name} receives no inject in ${label}`,
        roleId: role.id,
      })
    }
  }
  return [...gaps, ...decisionGap(s, phase, domain)]
}

export const DECISION_POINT_RETAGGED = 'DECISION_POINT_RETAGGED'

const DECISION_WORDS =
  /\bdecision\b|\bdecides?\b|\bdecide whether\b|\bauthori[sz]e[sd]?\b|\bwhether to\b|\bmust (?:choose|call|order|decide)\b|\brecommends? (?:a |an |the )?(?:pause|halt|stop|suspension|shutdown|evacuation|lockdown)\b|\borders? (?:all|the|a)\b/i
const CONSEQUENCE_WORDS =
  /\b(?:halt|stop|suspend|pause|cease|evacuate|shelter|lock ?down|shut (?:down|off)|disconnect|isolate|go dark|continue operations|curtail|pay|refuse)\b/i

/**
 * The row of the decision phase that reads most like the exercise's decision point, when the
 * model tagged none (the mix pass asked once; a local model sometimes writes the decision as
 * CORE_NARRATIVE). Control and locked rows are never candidates; nothing is picked when no
 * row mentions a decision or a consequence.
 */
export function pickDecisionRow(
  s: Scenario,
  phase: Phase,
  domain: DomainContext,
): MselRow | undefined {
  if (phase.index !== decisionPhaseIndex(s.phases.length)) return undefined
  if (s.msel.some((r) => r.purposeTag === 'DECISION_POINT')) return undefined
  const must = domain.threat.lint.decisionMustMention
  const scope = must ? new RegExp(must.pattern, 'i') : undefined
  let best: { row: MselRow; score: number } | undefined
  for (const row of rowsOf(s, phase.id)) {
    if (CONTROL_TAGS.has(row.purposeTag) || row.locked) continue
    const text = `${row.event}\n${row.expectedAction}`
    let score = 0
    if (/decision point/i.test(row.expectedAction)) score += 3
    if (DECISION_WORDS.test(text)) score += 2
    if (CONSEQUENCE_WORDS.test(text)) score += 1
    if (scope?.test(text)) score += 2
    if (score > 0 && (!best || score > best.score)) best = { row, score }
  }
  return best && best.score >= 2 ? best.row : undefined
}

function lintPhaseMix(s: Scenario, domain: DomainContext): W[] {
  return s.phases.flatMap((p) => {
    if (!rowsOf(s, p.id).length)
      return [error('PHASE_EMPTY', `Phase ${p.index + 1} "${p.title}" has no injects`)]
    // The decision point is checked once for the whole exercise (lintDecisionPoint).
    return phaseMixGaps(s, p, domain)
      .filter((g) => g.code !== MIX_NO_DECISION_POINT)
      .map((g) => warn(g.code, g.message))
  })
}

/**
 * The threat family's decision point must involve what the family says (a drone incident's
 * decision is taken with law enforcement / the airspace authority): checked on every
 * DECISION_POINT row's event and expected action.
 */
function lintDecisionScope(s: Scenario, domain: DomainContext): W[] {
  const must = domain.threat.lint.decisionMustMention
  if (!must) return []
  const rows = s.msel.filter((r) => r.purposeTag === 'DECISION_POINT')
  if (!rows.length) return []
  const re = new RegExp(must.pattern, 'i')
  if (rows.some((r) => re.test(`${r.event}\n${r.expectedAction}`))) return []
  return [
    warn(
      DECISION_POINT_SCOPE,
      `The DECISION_POINT (${rows.map((r) => r.id).join(', ')}) does not involve ${must.description}, which a ${domain.threat.label.toLowerCase()} decision must`,
      { rowId: rows[0]!.id },
    ),
  ]
}

/** A DECISION_POINT must land in the middle phases (2–3 of 4, the designated phase in general). */
function lintDecisionPoint(s: Scenario): W[] {
  if (!s.phases.length) return []
  const dp = decisionPhaseIndex(s.phases.length)
  const from = Math.min(1, dp)
  const to = Math.max(dp, s.phases.length >= 4 ? 2 : s.phases.length - 1)
  const middle = s.phases.filter((p) => p.index >= from && p.index <= to).map((p) => p.id)
  const ok = s.msel.some((r) => r.purposeTag === 'DECISION_POINT' && middle.includes(r.phaseId))
  return ok
    ? []
    : [warn('NO_DECISION_POINT', `No DECISION_POINT inject in phases ${from + 1}–${to + 1}`)]
}

function lintBoundaries(s: Scenario): W[] {
  if (!s.msel.length) return []
  const out: W[] = []
  const first = s.msel[0]!
  const last = s.msel[s.msel.length - 1]!
  if (first.purposeTag !== 'STARTEX')
    out.push(
      warn('STARTEX_FIRST', `First row ${first.id} is ${first.purposeTag}, expected STARTEX`, {
        rowId: first.id,
        suggestion:
          'Open the MSEL with one STARTEX card at 0:00 that sets the clock, day and conditions',
      }),
    )
  // Rows after an ENDEX in the middle name themselves (#347); without one, the last row does.
  const after = rowsAfterEndex(s)
  if (last.purposeTag !== 'ENDEX' && !after.length)
    out.push(
      warn('ENDEX_LAST', `Last row ${last.id} is ${last.purposeTag}, expected ENDEX`, {
        rowId: last.id,
        suggestion: 'Close the MSEL with one ENDEX card at the end of the last phase',
      }),
    )
  out.push(...after)
  const starts = s.msel.filter((r) => r.purposeTag === 'STARTEX')
  const ends = s.msel.filter((r) => r.purposeTag === 'ENDEX')
  if (starts.length > 1)
    out.push(
      warn('STARTEX_MULTIPLE', `${starts.length} STARTEX rows`, {
        rowId: starts[1]!.id,
        suggestion: 'Keep the first STARTEX card and turn the others into injects or delete them',
      }),
    )
  if (ends.length > 1)
    out.push(
      warn('ENDEX_MULTIPLE', `${ends.length} ENDEX rows`, {
        rowId: ends[0]!.id,
        suggestion: 'Keep one ENDEX card, as the last row; delete the others',
      }),
    )
  return out
}

/**
 * ~1 inject per 10 minutes: phases far outside the band get DENSITY_LOW / DENSITY_HIGH (the
 * MSEL repair trims the latter), and a phase above the reference pace a softer DENSITY_DENSE.
 */
function lintDensity(s: Scenario): W[] {
  const out: W[] = []
  for (const p of s.phases) {
    const n = rowsOf(s, p.id).length
    const minutes = exerciseMinutes(p.endTime) - exerciseMinutes(p.startTime)
    if (!n || minutes <= 0) continue
    const per = minutes / n
    const detail = `Phase ${p.index + 1} has ${n} injects over ${minutes} min (one every ${Math.round(per)} min; aim for about 10)`
    if (per > DENSITY_MAX_MINUTES) out.push(info('DENSITY_LOW', detail))
    if (per < DENSITY_MIN_MINUTES) out.push(info('DENSITY_HIGH', detail))
    else if (n > phaseRowCounts(minutes).maxRowCount)
      out.push(
        info(
          DENSITY_DENSE,
          `Phase ${p.index + 1} has ${n} injects over ${minutes} min, more than the reference MSEL's pace (about ${TARGET_ROWS_PER_HOUR} an hour, at most ${phaseRowCounts(minutes).maxRowCount} here)`,
          { suggestion: 'Merge or cut thin rows so each remaining inject forces a decision' },
        ),
      )
  }
  return out
}

function lintCitations(s: Scenario): W[] {
  const out: W[] = []
  const bad = (c: { documentId: string; headingPath: string }): boolean =>
    !c.documentId || !c.headingPath
  for (const r of s.msel) {
    if (r.citations.some(bad))
      out.push(
        warn('CITATION_UNRESOLVED', `Row ${r.id} has a citation without document/section`, {
          rowId: r.id,
        }),
      )
  }
  if (s.overview?.coreSectionsTested.some(bad))
    out.push(warn('CITATION_UNRESOLVED', 'Overview cites a section without document/section'))
  if (s.overview && !s.overview.coreSectionsTested.length)
    out.push(warn('OVERVIEW_NO_SECTIONS', 'Overview lists no plan sections tested'))
  const cited = s.msel.filter((r) => r.citations.length).length
  if (s.msel.length >= 6 && cited === 0)
    out.push(warn('MSEL_NO_CITATIONS', 'No MSEL row cites a plan section'))
  return out
}

function lintRubric(s: Scenario): W[] {
  const metrics = s.rubric?.metrics
  if (!metrics) return []
  const out: W[] = []
  const ids = new Set(s.msel.map((r) => r.id))
  for (const m of metrics) {
    for (const id of m.linkedInjectIds) {
      if (!ids.has(id))
        out.push(
          warn('RUBRIC_LINK_UNKNOWN', `Rubric metric "${m.name}" links to unknown inject ${id}`),
        )
    }
  }
  const total = metrics.reduce((n, m) => n + m.points, 0)
  if (total !== 100) out.push(warn('RUBRIC_POINTS', `Rubric points sum to ${total}, expected 100`))
  return out
}

/**
 * All deterministic lints for a scenario. Safe to call on a partially generated scenario.
 * `domain` (the project's profile and the scenario's threat family) shapes the mix rules.
 */
export function lintScenario(scenario: Scenario, domainIn?: DomainContext): LintWarning[] {
  const domain = contextFor(scenario, domainIn)
  return [
    ...lintTiming(scenario),
    ...lintIds(scenario),
    ...lintBoundaries(scenario),
    ...lintFromRoles(scenario),
    ...lintScriptedDecisions(scenario),
    ...lintPlayerVoice(scenario),
    ...lintDuplicateEvents(scenario),
    ...lintReferenceLeak(scenario),
    ...lintBrief(scenario),
    ...lintRealism(scenario),
    ...lintPhaseMix(scenario, domain),
    ...lintDecisionPoint(scenario),
    ...lintDecisionScope(scenario, domain),
    ...lintDensity(scenario),
    ...lintCitations(scenario),
    ...lintRubric(scenario),
  ]
}

// ---- mix completion plan (#167) ---------------------------------------------------------------

/** Tags of rows the mix pass may rewrite when the phase has another row covering their job. */
const SPARE_TAGS = new Set<MselRow['purposeTag']>([
  'NOISE',
  'RED_HERRING',
  'DISTRACTION',
  'PRESSURE',
  'MISINFORMATION',
])

const NEED_ORDER = [
  MIX_NO_DECISION_POINT,
  'MIX_NO_CORE',
  'MIX_NO_PIO_PRESSURE',
  'MIX_NO_IT_CLUE',
  'MIX_NO_CLUE',
  'MIX_NO_NOISE',
  'ROLE_NO_INJECT',
]
const gapKey = (g: MixGap): string => `${g.code}:${g.roleId ?? ''}`

/**
 * One ask per row the pass should produce, most important first. A role whose PRESSURE or
 * CLUE gap is asked for needs no separate coverage row; the remaining uncovered roles share
 * one inject.
 */
export function rowNeeds(gaps: MixGap[]): string[] {
  const covered = new Set(gaps.filter((g) => g.code !== 'ROLE_NO_INJECT').map((g) => g.roleId))
  const roles = gaps.filter((g) => g.code === 'ROLE_NO_INJECT' && !covered.has(g.roleId))
  const others = gaps
    .filter((g) => g.code !== 'ROLE_NO_INJECT')
    .sort((a, b) => NEED_ORDER.indexOf(a.code) - NEED_ORDER.indexOf(b.code))
    .map((g) => g.need)
  if (roles.length <= 1) return [...others, ...roles.map((g) => g.need)]
  const keys = roles.map((g) => `"${g.roleId}"`).join(', ')
  return [
    ...others,
    `one inject addressed to ${keys} together that gives each of them something to do`,
  ]
}

/**
 * Unlocked NOISE / PRESSURE-type rows of the phase that can be rewritten without opening a
 * new gap: removing them (one after another) leaves the phase's gaps as they are.
 */
export function spareRows(
  s: Scenario,
  phase: Phase,
  domain?: DomainContext,
  eligible: (r: MselRow) => boolean = () => true,
): MselRow[] {
  const before = new Set(phaseMixGaps(s, phase, domain).map(gapKey))
  const removed = new Set<MselRow>()
  for (const row of rowsOf(s, phase.id)) {
    if (row.locked || !SPARE_TAGS.has(row.purposeTag) || !eligible(row)) continue
    const without = { ...s, msel: s.msel.filter((r) => r !== row && !removed.has(r)) }
    const after = phaseMixGaps(without, phase, domain).map(gapKey)
    if (after.every((k) => before.has(k))) removed.add(row)
  }
  return [...removed]
}

/** Rows that are never trimmed: control cards and the decision point. */
const UNTRIMMABLE = new Set<MselRow['purposeTag']>([...CONTROL_TAGS, 'DECISION_POINT'])

/** Removing `row` keeps another row of its tag and every role it addresses still served. */
function redundant(row: MselRow, rest: MselRow[]): boolean {
  if (!rest.some((r) => r.purposeTag === row.purposeTag)) return false
  const served = (roleId: string): boolean =>
    rest.some((r) => !CONTROL_TAGS.has(r.purposeTag) && r.toRoleIds.includes(roleId))
  return row.toRoleIds.every(served)
}

/**
 * The rows to drop so a phase the first call overfilled fits `maxRows` (#167). Lowest value
 * first: spare NOISE / PRESSURE-type rows, then other rows, latest first within each group.
 * A row is only dropped when its tag and every role it addresses are still covered by
 * another row and the phase's mix gaps do not grow. Locked rows, control cards and the
 * DECISION_POINT are never dropped, so the phase can stay over the limit.
 */
export function overfillRows(
  s: Scenario,
  phase: Phase,
  maxRows: number,
  domain?: DomainContext,
): MselRow[] {
  const rows = rowsOf(s, phase.id)
  if (rows.length <= maxRows) return []
  const before = new Set(phaseMixGaps(s, phase, domain).map(gapKey))
  const candidates = rows
    .filter((r) => !r.locked && !UNTRIMMABLE.has(r.purposeTag))
    .reverse()
    .sort((a, b) => Number(!SPARE_TAGS.has(a.purposeTag)) - Number(!SPARE_TAGS.has(b.purposeTag)))
  const dropped = new Set<MselRow>()
  for (const row of candidates) {
    if (rows.length - dropped.size <= maxRows) break
    const rest = rows.filter((r) => r !== row && !dropped.has(r))
    if (!redundant(row, rest)) continue
    const without = { ...s, msel: s.msel.filter((r) => r !== row && !dropped.has(r)) }
    if (phaseMixGaps(without, phase, domain).every((g) => before.has(gapKey(g)))) dropped.add(row)
  }
  return [...dropped]
}

export interface MixPlan {
  /** What the pass must produce, one ask per row, most important first. */
  needs: string[]
  /** Spare rows the pass rewrites (same id and time) to cover needs. */
  replace: MselRow[]
  /** New rows the pass may add without the phase exceeding `maxRows`. */
  add: number
  /** Needs dropped because the phase is full and no spare row is left. */
  skipped: string[]
  /** Rows the phase can still take before it reaches `maxRows`. */
  room: number
}

/**
 * How the mix completion pass covers the phase's gaps within `maxRows` (#167): rewrite spare
 * NOISE / PRESSURE rows first, then add new rows only while the phase has room.
 */
export function planMixCompletion(
  s: Scenario,
  phase: Phase,
  maxRows: number,
  domain?: DomainContext,
  eligible?: (r: MselRow) => boolean,
): MixPlan {
  const needs = rowNeeds(phaseMixGaps(s, phase, domain))
  const room = Math.max(0, maxRows - rowsOf(s, phase.id).length)
  if (!needs.length) return { needs, replace: [], add: 0, skipped: [], room }
  const replace = spareRows(s, phase, domain, eligible).slice(0, needs.length)
  const add = Math.min(needs.length - replace.length, room)
  const used = replace.length + add
  return { needs: needs.slice(0, used), replace, add, skipped: needs.slice(used), room }
}

// ---- structural lints for the revision pass (#174) -------------------------------------------

/** Lint codes the MSEL revision pass is asked to fix, whatever the critique said. */
export const STRUCTURAL_CODES = new Set([
  'ROW_OUTSIDE_PHASE',
  'ENDEX_LAST',
  DUPLICATE_EVENT,
  INJECT_PLAYER_VOICE,
  'INJECT_SCRIPTS_PLAYERS',
  'FROM_PLAYER_ROLE',
  // Row text the revision can correct (#347).
  START_TIME_MISMATCH,
  CLOCK_MISMATCH,
  DATE_DRIFT,
  OUTSIDE_AGENCY_DECIDES,
  RESTORE_TOO_FAST,
  CONTACT_REAL_LOOKING,
])

/** Rows placed after the ENDEX row: the exercise is over before they are delivered. */
function rowsAfterEndex(s: Scenario): W[] {
  const at = s.msel.findIndex((r) => r.purposeTag === 'ENDEX')
  if (at < 0) return []
  const end = s.msel[at]!
  return s.msel.slice(at + 1).map((r) =>
    warn(
      'ENDEX_LAST',
      `Row ${r.id} (${r.time}) comes after the ENDEX row ${end.id} (${end.time})`,
      {
        rowId: r.id,
        suggestion: `Resolve it before ENDEX at ${end.time}, or fold it into the ENDEX row`,
      },
    ),
  )
}

/**
 * The structural lints on rows (#164, #174): rows outside their phase, rows after ENDEX,
 * near-duplicate rows and injects that carry a player's own decision. Each has a rowId.
 */
export function structuralLints(s: Scenario, domain?: DomainContext): LintWarning[] {
  const out = lintScenario(s, domain).filter(
    (w) => w.rowId && STRUCTURAL_CODES.has(w.code) && w.code !== 'ENDEX_LAST',
  )
  return [...out, ...rowsAfterEndex(s)]
}
