// PREP exercise support (spec 0455 FR-10, #782): the objective sets and the 15 core
// components of the National Preparedness for Response Exercise Program as data, the
// exercise-cycle arithmetic, coverage of the core components across a project's exercises,
// the tags that say which inject or decision exercised which component, and the exercise
// record's fields. Text follows the 2016 PREP Guidelines, version 2016.1 (read in full;
// Appendix A, sections 2.3.4, 2.3.8, 2.4.7.2, 3.9, 3.10, 4.3, 5.2 and 7.2). The guidelines are
// voluntary and are not regulations: everything here is generic exercise guidance, never a
// finding that a plan complies. Pure data and functions, no Node imports.
import { z } from 'zod'

export const PREP_EDITION = {
  name: '2016 National Preparedness for Response Exercise Program (PREP) Guidelines',
  version: '2016.1',
  /** The record of changes in version 2016.1 runs to this date. */
  changesThrough: '2018-10-02',
  url: 'https://www.epa.gov/sites/production/files/2020-03/documents/prep_guidelines_2016_12oct18.pdf',
} as const

export const PREP_EDITION_LINE = `Objectives follow the ${PREP_EDITION.name}, version ${PREP_EDITION.version}.`

// ---- core components (Appendix A) -------------------------------------------------------------

export const CORE_COMPONENT_IDS = [
  'notifications',
  'staff_mobilization',
  'response_management',
  'source_control',
  'assessment',
  'containment',
  'mitigation',
  'protection',
  'disposal',
  'communications',
  'transportation',
  'personnel_support',
  'equipment_maintenance',
  'procurement',
  'documentation',
] as const
export type CoreComponentId = (typeof CORE_COMPONENT_IDS)[number]

export interface CoreComponent {
  id: CoreComponentId
  /** Appendix A reference, "A.1" to "A.15". */
  ref: string
  name: string
  summary: string
  /** The sub-items Appendix A lists under the component. */
  subs: readonly string[]
}

const c = (
  n: number,
  id: CoreComponentId,
  name: string,
  summary: string,
  subs: readonly string[] = [],
): CoreComponent => ({ id, ref: `A.${n}`, name, summary, subs })

/** The 15 core components that must be exercised at least once in each cycle (Appendix A). */
export const CORE_COMPONENTS: readonly CoreComponent[] = [
  c(1, 'notifications', 'Notifications', 'Test the notification procedures in the response plan.'),
  c(
    2,
    'staff_mobilization',
    'Staff mobilization',
    'Assemble the response organization the plan identifies.',
  ),
  c(
    3,
    'response_management',
    'Operate within the response management system',
    "Work within a unified command and the plan's response management system.",
    [
      'Unified command: federal, state, local and responsible party representation',
      'Operations',
      'Planning',
      'Logistics',
      'Finance',
      'Public affairs (Joint Information Center)',
      'Safety affairs',
      'Legal affairs',
    ],
  ),
  c(
    4,
    'source_control',
    'Source control',
    'Control and stop the discharge at the source and coordinate that work within the response management system.',
    [
      'Salvage',
      'Marine firefighting (vessels)',
      'Lightering',
      'Other salvage equipment and devices',
      'Well control',
    ],
  ),
  c(
    5,
    'assessment',
    'Assessment',
    'Provide an initial assessment of the discharge and continuing assessments of the tactical plan.',
    ['Salvage assessment (vessels)', 'Marine firefighting assessment (vessels)'],
  ),
  c(
    6,
    'containment',
    'Containment',
    'Contain the discharge at the source or in other locations for recovery.',
  ),
  c(
    7,
    'mitigation',
    'Mitigation (formerly Recovery)',
    'Mitigate the discharged product with countermeasures (dispersants, in-situ burning, bioremediation) and mechanical recovery.',
  ),
  c(
    8,
    'protection',
    'Protection',
    'Protect the environmentally and economically sensitive areas named in the Area Contingency Plan and the response plan.',
    [
      'Protective booming',
      'Water intake protection',
      'Wildlife recovery and rehabilitation',
      'Population protection (public health and safety)',
    ],
  ),
  c(9, 'disposal', 'Disposal', 'Dispose of recovered material and contaminated debris.'),
  c(
    10,
    'communications',
    'Communications',
    'Establish an effective communications system for the response organization.',
    [
      'Internal communications',
      'External communications (Regional Response Team, claimants, media, agencies)',
    ],
  ),
  c(
    11,
    'transportation',
    'Transportation',
    'Provide effective multimode transportation for the response and its support.',
    ['Land', 'Waterborne', 'Airborne'],
  ),
  c(
    12,
    'personnel_support',
    'Personnel support',
    'Support all personnel associated with the response.',
    [
      'Management',
      'Berthing',
      'Messing',
      'Operational and administrative spaces',
      'Emergency procedures',
    ],
  ),
  c(
    13,
    'equipment_maintenance',
    'Equipment maintenance and support',
    'Maintain and support all equipment associated with the response.',
    ['Response equipment', 'Support equipment'],
  ),
  c(14, 'procurement', 'Procurement', 'Establish an effective procurement system.', [
    'Personnel',
    'Response equipment',
    'Support equipment',
  ]),
  c(
    15,
    'documentation',
    'Documentation',
    'Document all operational and support aspects of the response, with detailed records of decisions and actions.',
  ),
]

const componentById = new Map(CORE_COMPONENTS.map((x) => [x.id, x]))
export const coreComponent = (id: CoreComponentId): CoreComponent => componentById.get(id)!

// ---- exercise kinds, plan types, objective sets ------------------------------------------------

export const PREP_EXERCISE_KINDS = ['imt_tabletop', 'area_exercise'] as const
export type PrepExerciseKind = (typeof PREP_EXERCISE_KINDS)[number]

export const PREP_KIND_LABELS: Record<PrepExerciseKind, string> = {
  imt_tabletop: 'PREP IMT tabletop',
  area_exercise: 'PREP area exercise',
}

export const PREP_PLAN_TYPES = [
  'vessel',
  'mtr_facility',
  'inland_facility',
  'pipeline',
  'area',
] as const
export type PrepPlanType = (typeof PREP_PLAN_TYPES)[number]

export interface PrepObjective {
  id: string
  text: string
}

export interface PrepPlanRules {
  label: string
  /** The plan holder's exercise cycle in years: three for plans, four for Area Contingency Plans. */
  cycleYears: 3 | 4
  exerciseTitle: string
  frequency: string
  certification: string
  verification: string
  retention: string
  recordsLocation: string
  objectives: readonly PrepObjective[]
}

const o = (id: string, text: string): PrepObjective => ({ id, text })

const COMMON_FACILITY = (osro: string): PrepObjective[] => [
  o('A', 'Knowledge of the response plan'),
  o('B', 'Proper notifications'),
  o('C', 'Communications system'),
  o('D', `Ability to access ${osro}`),
  o('E', 'Coordination of internal organization personnel with responsibility for response'),
  o(
    'F',
    'Annual review of the transition from a local team to a regional, national and international team as appropriate',
  ),
  o(
    'G',
    'Ability to coordinate response activity with the National Response System infrastructure (if its personnel are not participating, show knowledge of the coordination)',
  ),
  o(
    'H',
    'Ability to access information in the Area Contingency Plan on the location of sensitive areas, resources available in the area and unique conditions of the area',
  ),
  o(
    'I',
    'Simulation of a worst case discharge scenario (at least one IMT exercise in each triennial cycle)',
  ),
]

const COUNTERMEASURE_OBJECTIVE = o(
  'J',
  'For any chemical or biological countermeasure or in-situ burn in the plan, prepare and submit a request, usage and monitoring plan; each countermeasure in the plan is exercised during the triennial cycle',
)

export const PREP_PLAN_RULES: Record<PrepPlanType, PrepPlanRules> = {
  vessel: {
    label: 'Tank vessel and nontank vessel response plan',
    cycleYears: 3,
    exerciseTitle:
      'Incident Management Team tabletop exercise (tank vessels and certain nontank vessels)',
    frequency: 'Annually',
    certification: 'Self-certification',
    verification: 'USCG Captain of the Port or Federal On-Scene Coordinator',
    retention: 'Three years',
    recordsLocation:
      'At the U.S. location of the Qualified Individual, the IMT, the vessel owner or operator or the resource provider, as established in the plan',
    objectives: [
      ...COMMON_FACILITY('resource providers'),
      o(
        'J',
        'For any chemical or biological countermeasure or in-situ burn in the plan, the ability to prepare and submit a request and usage plan to the Federal On-Scene Coordinator and Regional Response Team; each countermeasure in the plan is exercised during the triennial cycle',
      ),
      o(
        'K',
        'When applicable, a request for aerial or vessel-applied dispersants (API Technical Report 1148 gives an example daily application plan)',
      ),
    ],
  },
  mtr_facility: {
    label: 'Marine transportation-related facility response plan',
    cycleYears: 3,
    exerciseTitle:
      'Incident Management Team tabletop exercise (marine transportation-related facilities)',
    frequency: 'Annually',
    certification: 'Self-certification',
    verification: 'USCG Captain of the Port or Federal On-Scene Coordinator',
    retention: 'Three years',
    recordsLocation: 'At each facility',
    objectives: [...COMMON_FACILITY('an OSRO'), COUNTERMEASURE_OBJECTIVE],
  },
  inland_facility: {
    label: 'Inland facility response plan',
    cycleYears: 3,
    exerciseTitle: 'Incident Management Team tabletop exercise (inland facilities)',
    frequency: 'Annually',
    certification: 'Self-certification',
    verification: 'EPA',
    retention: 'Five years',
    recordsLocation: 'At each facility',
    objectives: [...COMMON_FACILITY('an OSRO'), COUNTERMEASURE_OBJECTIVE],
  },
  pipeline: {
    label: 'Onshore pipeline response plan',
    cycleYears: 3,
    exerciseTitle: 'Incident Management Team tabletop exercise (pipelines)',
    frequency: 'As the response plan indicates and at least annually',
    certification:
      'Self-certification as the plan indicates or the guidelines define, whichever is more stringent',
    verification: 'DOT/PHMSA; records available on request',
    retention: 'Three years',
    recordsLocation: 'As indicated in the response plan',
    objectives: [...COMMON_FACILITY('an OSRO'), COUNTERMEASURE_OBJECTIVE],
  },
  area: {
    label: 'Area Contingency Plan',
    cycleYears: 4,
    exerciseTitle: 'Incident Management Team tabletop exercise (Area IMT)',
    frequency: 'Annually (the Area full-scale or functional exercise is on a four-year cycle)',
    certification: 'Federal On-Scene Coordinator',
    verification: 'Federal On-Scene Coordinator',
    retention: 'Four years (Coast Guard) or five years (EPA)',
    recordsLocation: 'With the Federal On-Scene Coordinator',
    objectives: [
      o('A', 'Knowledge of the Area Contingency Plan'),
      o('B', 'Proper notifications'),
      o('C', 'Communications system'),
      o('D', 'Ability to access response equipment'),
      o('E', 'Coordination of organization or agency personnel with responsibility for response'),
      o(
        'F',
        'Ability to coordinate spill and salvage and marine firefighting response with the National Response System infrastructure',
      ),
      o(
        'G',
        'Ability to access information in the Area Contingency Plan on the location of sensitive areas, resources available in the area and unique conditions of the area',
      ),
      o(
        'H',
        'Exercise the response management system the plan identifies and, to the extent possible, the unified command',
      ),
      o(
        'I',
        'For any chemical or biological countermeasure or in-situ burn in the plan, prepare requests for and make recommendations to the Federal On-Scene Coordinator; exercise each such countermeasure during the quadrennial cycle',
      ),
      o(
        'J',
        'Simulation of a worst case discharge scenario (at least one IMT exercise in each quadrennial cycle)',
      ),
    ],
  },
}

/** The plan type a PREP exercise kind starts with (the person can change it for the plan holder). */
export const defaultPlanType = (kind: PrepExerciseKind): PrepPlanType =>
  kind === 'area_exercise' ? 'area' : 'inland_facility'

/** Objectives to pre-fill for an exercise of this plan type. */
export const prepObjectives = (planType: PrepPlanType): readonly PrepObjective[] =>
  PREP_PLAN_RULES[planType].objectives

/** The objective that asks for a worst case discharge scenario (the last "simulation of a WCD"). */
export const wcdObjectiveId = (planType: PrepPlanType): string =>
  PREP_PLAN_RULES[planType].objectives.find((x) => /worst case discharge/i.test(x.text))!.id

// ---- cycle arithmetic --------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const toUtc = (iso: string): number => {
  if (!ISO_DATE.test(iso)) throw new Error(`Not an ISO date (YYYY-MM-DD): ${iso}`)
  return Date.parse(`${iso}T00:00:00Z`)
}
const addYears = (iso: string, years: number): string => {
  const d = new Date(toUtc(iso))
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}
const addDays = (iso: string, days: number): string =>
  new Date(toUtc(iso) + days * 86_400_000).toISOString().slice(0, 10)

export interface CyclePosition {
  cycleYears: 3 | 4
  cycleStart: string
  /** Last day of the cycle (the day before the next cycle begins). */
  cycleEnd: string
  /** 1-based year within the cycle; 0 when the date is before the start; years+1 when after the end. */
  yearOfCycle: number
  /** Whole days from the exercise date to the end of the cycle (negative once it ended). */
  daysLeft: number
  status: 'before' | 'in' | 'after'
}

/** Where `exerciseDate` falls in the cycle that began on `cycleStart` for this plan type. */
export function cyclePosition(
  planType: PrepPlanType,
  cycleStart: string,
  exerciseDate: string,
): CyclePosition {
  const cycleYears = PREP_PLAN_RULES[planType].cycleYears
  const cycleEnd = addDays(addYears(cycleStart, cycleYears), -1)
  const t = toUtc(exerciseDate)
  const daysLeft = Math.round((toUtc(cycleEnd) - t) / 86_400_000)
  if (t < toUtc(cycleStart))
    return { cycleYears, cycleStart, cycleEnd, yearOfCycle: 0, daysLeft, status: 'before' }
  if (t > toUtc(cycleEnd))
    return {
      cycleYears,
      cycleStart,
      cycleEnd,
      yearOfCycle: cycleYears + 1,
      daysLeft,
      status: 'after',
    }
  let year = 1
  while (year < cycleYears && t >= toUtc(addYears(cycleStart, year))) year++
  return { cycleYears, cycleStart, cycleEnd, yearOfCycle: year, daysLeft, status: 'in' }
}

/** One line for the record and the program view. */
export function cycleLine(p: CyclePosition): string {
  if (p.status === 'before')
    return `Before the ${p.cycleYears}-year cycle that begins ${p.cycleStart}`
  if (p.status === 'after') return `After the ${p.cycleYears}-year cycle that ended ${p.cycleEnd}`
  return `Year ${p.yearOfCycle} of the ${p.cycleYears}-year cycle that began ${p.cycleStart} (ends ${p.cycleEnd})`
}

// ---- which inject or decision exercised which component ---------------------------------------

/** Inject types and the core components they exercise (the tags the evaluation shares). */
export const INJECT_TYPE_COMPONENTS: Readonly<Record<string, readonly CoreComponentId[]>> = {
  nrc_report_record: ['notifications', 'communications'],
  ics_201_prefill: ['response_management', 'assessment'],
  ics_202_incident_objectives: ['response_management', 'documentation'],
  ics_203_prefill: ['staff_mobilization', 'response_management'],
  ics_204_assignment_list: ['response_management', 'containment'],
  ics_213_general_message: ['communications'],
  ics_214_activity_log: ['documentation'],
  ics_232_resources_at_risk: ['protection', 'assessment'],
  ics_233_open_action_tracker: ['response_management', 'documentation'],
  ics_234_work_analysis_matrix: ['response_management'],
  uc_meeting_agenda: ['response_management'],
  aerial_observation_report: ['assessment'],
  shoreline_survey_report: ['assessment', 'disposal'],
  countermeasure_request: ['mitigation'],
  wildlife_status_report: ['protection'],
  closure_order: ['protection'],
  claims_line_notice: ['communications'],
  press_release: ['communications'],
}

/** Decision form ids (the spill_plume decisions) and the components they exercise. */
export const DECISION_COMPONENTS: Readonly<Record<string, readonly CoreComponentId[]>> = {
  make_notifications: ['notifications'],
  activate_osro: ['staff_mobilization', 'procurement'],
  set_protection_priorities: ['protection', 'assessment'],
  deploy_protective_boom: ['protection', 'containment'],
  request_countermeasure: ['mitigation'],
  close_water_intake: ['protection'],
  close_fishery_or_shoreline: ['protection'],
  set_safety_zone: ['protection'],
  escalate_imt: ['staff_mobilization', 'response_management'],
  issue_public_statement: ['communications'],
}

export interface PlayTags {
  injectTypes: readonly string[]
  decisionIds: readonly string[]
}

/** For each component the exercise reached, the injects and decisions that did it. */
export function componentEvidence(play: PlayTags): Map<CoreComponentId, string[]> {
  const out = new Map<CoreComponentId, string[]>()
  const add = (component: CoreComponentId, what: string): void => {
    const list = out.get(component) ?? []
    if (!list.includes(what)) list.push(what)
    out.set(component, list)
  }
  for (const t of play.injectTypes) for (const x of INJECT_TYPE_COMPONENTS[t] ?? []) add(x, t)
  for (const d of play.decisionIds) for (const x of DECISION_COMPONENTS[d] ?? []) add(x, d)
  return out
}

// ---- coverage across a project's exercises ----------------------------------------------------

export interface CoverageExercise {
  date: string
  /** Component ids this exercise exercised. */
  components: readonly CoreComponentId[]
}

export interface ComponentCoverage {
  component: CoreComponent
  applicable: boolean
  count: number
  firstDate?: string
}

export interface CycleCoverage {
  rows: ComponentCoverage[]
  covered: number
  applicable: number
  missing: CoreComponentId[]
  percent: number
}

/**
 * Coverage of the core components by the exercises inside one cycle. `notApplicable` lists the
 * components the plan holder decided do not apply to the plan ("adding or deleting as
 * appropriate"); they do not count against the cycle.
 */
export function cycleCoverage(
  exercises: readonly CoverageExercise[],
  window: { start: string; end: string } | undefined,
  notApplicable: readonly CoreComponentId[] = [],
): CycleCoverage {
  const inside = exercises
    .filter((e) => !window || (e.date >= window.start && e.date <= window.end))
    .sort((a, b) => a.date.localeCompare(b.date))
  const rows: ComponentCoverage[] = CORE_COMPONENTS.map((component) => {
    const hits = inside.filter((e) => e.components.includes(component.id))
    return {
      component,
      applicable: !notApplicable.includes(component.id),
      count: hits.length,
      ...(hits[0] ? { firstDate: hits[0].date } : {}),
    }
  })
  const applicableRows = rows.filter((r) => r.applicable)
  const missing = applicableRows.filter((r) => r.count === 0).map((r) => r.component.id)
  const covered = applicableRows.length - missing.length
  return {
    rows,
    covered,
    applicable: applicableRows.length,
    missing,
    percent: applicableRows.length ? Math.round((covered / applicableRows.length) * 100) : 100,
  }
}

// ---- settings and the exercise record ----------------------------------------------------------

export const PREP_RESULTS = ['met', 'partial', 'not_met', 'not_evaluated'] as const
export type PrepResult = (typeof PREP_RESULTS)[number]
const RESULT_LABEL: Record<PrepResult, string> = {
  met: 'Met',
  partial: 'Partially met',
  not_met: 'Not met',
  not_evaluated: 'Not evaluated',
}

const CoreComponentIdSchema = z.enum(CORE_COMPONENT_IDS)

/** What the designer sets for a PREP exercise (stored in the scenario's exercise details). */
export const PrepSettings = z.object({
  exerciseKind: z.enum(PREP_EXERCISE_KINDS),
  planType: z.enum(PREP_PLAN_TYPES).optional(),
  planHolder: z.string().max(200).default(''),
  worstCaseDischarge: z.boolean().default(false),
  worstCaseNote: z.string().max(500).default(''),
  /** Countermeasures the plan lists (dispersant, in-situ burn, chemical agent...). */
  countermeasuresInPlan: z.array(z.string().max(100)).max(5).default([]),
  /** The ones this exercise covered. */
  countermeasuresExercised: z.array(z.string().max(100)).max(5).default([]),
  /** First day (YYYY-MM-DD) of the plan's current exercise cycle. */
  cycleStart: z.string().regex(ISO_DATE).optional(),
  /** Components the exercise covered in discussion that no inject or decision shows. */
  alsoExercised: z.array(CoreComponentIdSchema).default([]),
  /** Components the plan holder decided do not apply to the plan. */
  notApplicable: z.array(CoreComponentIdSchema).default([]),
  objectiveResults: z.record(z.string().max(4), z.enum(PREP_RESULTS)).default({}),
  evaluation: z.string().max(2000).default(''),
  lessons: z.array(z.string().max(300)).max(5).default([]),
  certifier: z
    .object({ name: z.string().max(200), title: z.string().max(200), date: z.string().max(40) })
    .partial()
    .default({}),
})
export type PrepSettings = z.infer<typeof PrepSettings>

export interface PrepRecordInput {
  settings: PrepSettings
  exerciseName: string
  /** Exercise dates (YYYY-MM-DD); the first is the cycle date. */
  dates: readonly string[]
  startTime?: string
  endTime?: string
  site: string
  description: string
  participants: readonly { name: string; organization: string; role: string }[]
  play: PlayTags
  marking?: string
}

const NO_COMPONENT = 'Not exercised'
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Fields for the `prep_exercise_record` template, from the settings and what was played. */
export function buildPrepRecord(input: PrepRecordInput): Record<string, unknown> {
  const s = input.settings
  const planType = s.planType ?? defaultPlanType(s.exerciseKind)
  const rules = PREP_PLAN_RULES[planType]
  const evidence = componentEvidence(input.play)
  for (const id of s.alsoExercised) {
    const list = evidence.get(id) ?? []
    evidence.set(id, [...list, 'discussion'])
  }
  const first = input.dates[0]
  const cycle = s.cycleStart && first ? cycleLine(cyclePosition(planType, s.cycleStart, first)) : ''
  const when = [
    first,
    input.startTime && input.endTime ? `${input.startTime} to ${input.endTime}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  const wcd = s.worstCaseDischarge
    ? `Yes${s.worstCaseNote ? `: ${s.worstCaseNote}` : ''}`
    : 'No worst case discharge scenario in this exercise'
  return {
    ...(input.marking ? { marking: input.marking } : {}),
    planHolder: s.planHolder,
    planType: rules.label,
    exerciseType: PREP_KIND_LABELS[s.exerciseKind],
    exerciseName: input.exerciseName,
    exerciseDate: when,
    site: input.site,
    cyclePosition: cycle,
    description: input.description,
    worstCaseDischarge: wcd,
    countermeasures: s.countermeasuresInPlan.map((name) => ({
      name,
      exercised: s.countermeasuresExercised.includes(name) ? 'Yes' : 'No',
    })),
    participants: input.participants.slice(0, 8).map((p) => ({ ...p })),
    objectives: rules.objectives.map((obj) => {
      const given = s.objectiveResults[obj.id]
      const isWcd = obj.id === wcdObjectiveId(planType)
      const result: PrepResult =
        given ?? (isWcd ? (s.worstCaseDischarge ? 'met' : 'not_met') : 'not_evaluated')
      return { id: obj.id, text: obj.text, result: RESULT_LABEL[result] }
    }),
    components: CORE_COMPONENTS.map((comp) => {
      const hit = evidence.get(comp.id)
      const na = s.notApplicable.includes(comp.id)
      return {
        ref: comp.ref,
        name: comp.name,
        exercised: na ? 'Not applicable to the plan' : hit ? 'Yes' : 'No',
        evidence: na ? '' : hit ? clip(hit.join('; '), 70) : NO_COMPONENT,
      }
    }),
    evaluation: s.evaluation,
    lessons: [...s.lessons],
    certificationStatement:
      'I certify that this exercise was conducted as described, that its objectives were evaluated, and that this record is accurate.',
    certifierName: [s.certifier.name, s.certifier.title].filter(Boolean).join(', '),
    certifierDate: s.certifier.date ?? '',
    retention: `Keep this record and the exercise materials for ${rules.retention.toLowerCase()}; records location: ${rules.recordsLocation.charAt(0).toLowerCase()}${rules.recordsLocation.slice(1)}. Documentation is usually completed within 60 days of the exercise. This is generic guidance, not legal advice; the plan holder and the regulator decide what satisfies the plan.`,
    edition: PREP_EDITION_LINE,
  }
}
