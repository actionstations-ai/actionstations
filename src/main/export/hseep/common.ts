// Content shared by the HSEEP documents (#420): the Exercise Overview facts, the objectives and
// capabilities table, participant roles, the exercise schedule, participants, communications
// and acronyms, and HSEEP's standard assumptions and artificialities. Exercise details come only
// from scenario.conduct; a blank detail is '' here and prints as a fill-in line.
import { threatFamily } from '@shared/domains/threats'
import { seededAcronyms, sortedAcronyms } from '@shared/hseep'
import type { Phase, Scenario } from '@shared/schemas'
import { goalSummary, wallClockAt, DEFAULT_START_WALL_CLOCK } from '../../generate/mappers'
import { capabilitiesFor } from '../evaluation'
import { tr } from '../lang'
import type { ExportModel } from '../model'
import { groupRows, locationText } from '../views'
import { h3, h4, list, para, type Block, type Fact } from './blocks'

const DEFAULT_MARKING = 'EXERCISE — FOR TRAINING USE'

export const EXERCISE_TYPE_LABEL = 'Tabletop Exercise (TTX)'

/** The exercise name as filed, else the scenario title. */
export const exerciseName = (model: ExportModel): string =>
  model.conduct.exerciseName.trim() || model.scenario.title

/** "2027-03-04" → "March 4, 2027" (UTC, so the date never shifts with the time zone). */
export function formatIsoDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function exerciseDates(model: ExportModel): string {
  const { dates, startTime, endTime } = model.conduct
  const days = dates
    .filter((d) => d.trim())
    .map(formatIsoDate)
    .join('; ')
  if (!days) return ''
  const hours =
    startTime && endTime ? `, ${startTime}–${endTime}` : startTime ? `, ${startTime}` : ''
  return `${days}${hours}`
}

export function pointOfContact(model: ExportModel): string {
  const d = model.conduct.director
  return [d.name, d.organization, d.phone, d.email]
    .map((v) => v?.trim() ?? '')
    .filter(Boolean)
    .join(' · ')
}

export const siteText = (model: ExportModel): string =>
  [model.conduct.site, model.conduct.room]
    .map((v) => v.trim())
    .filter(Boolean)
    .join(', ')

/** The kind of incident, at the level a player may read (never the inject detail). */
export function threatOrHazard(s: Scenario): string {
  const family = s.brief.threatFamily
  let label = ''
  if (family) {
    try {
      label = threatFamily(family).label
    } catch {
      label = ''
    }
  }
  const theme = s.overview?.theme.trim() ?? ''
  return [label, theme].filter(Boolean).join(': ')
}

/** Distinct Core Capabilities across the objectives (#421; empty without evaluation guides). */
export function coreCapabilities(model: ExportModel): string[] {
  const caps = model.scenario.objectives.flatMap((o) => capabilitiesFor(model.evaluation, o.id))
  return [...new Set(caps)]
}

export const objectiveText = (o: { name: string; text: string }): string =>
  o.name ? `${o.name}: ${o.text}` : o.text

const phasesOf = (s: Scenario): Phase[] => [...s.phases].sort((a, b) => a.index - b.index)

function scope(model: ExportModel): string {
  const s = model.scenario
  const n = s.phases.length
  const where = siteText(model) || locationText(s)
  const modules = n ? ` in ${n} ${n === 1 ? 'module' : 'modules'}` : ''
  return `A ${s.brief.durationHours}-hour discussion-based tabletop exercise${modules}${where ? ` at ${where}` : ''}.`
}

/** The Exercise Overview facts every HSEEP document opens with (and the AAR, #419). */
export function exerciseOverviewFacts(model: ExportModel): Fact[] {
  const s = model.scenario
  const c = model.conduct
  return [
    { label: 'Exercise Name', value: exerciseName(model) },
    { label: 'Exercise Dates', value: exerciseDates(model) },
    { label: 'Exercise Type', value: EXERCISE_TYPE_LABEL },
    { label: 'Scope', value: scope(model) },
    { label: 'Mission Area(s)', value: model.evaluation?.missionAreas.join(', ') ?? '' },
    { label: 'Core Capabilities', value: coreCapabilities(model).join(', ') },
    { label: 'Threat or Hazard', value: threatOrHazard(s) },
    { label: 'Scenario', value: s.subtitle ?? s.overview?.theme ?? '' },
    { label: 'Sponsor', value: c.sponsor.trim() },
    {
      label: 'Participating Organizations',
      value: c.participatingOrganizations.filter((o) => o.trim()).join(', '),
    },
    { label: 'Point of Contact', value: pointOfContact(model) },
  ]
}

/** Objective → Core Capability table rows (capability blank without evaluation guides). */
export function objectiveRows(model: ExportModel): string[][] {
  return model.scenario.objectives.map((o) => [
    objectiveText(o),
    capabilitiesFor(model.evaluation, o.id).join(', '),
  ])
}

export function objectivesTable(model: ExportModel): Block {
  return {
    kind: 'table',
    caption: 'Exercise objectives and Core Capabilities',
    header: ['Exercise Objective', 'Core Capability'],
    rows: objectiveRows(model),
    fillBlanks: true,
  }
}

const HSEEP_ROLES = [
  'Players: personnel with an active role in discussing or performing their regular roles and responsibilities. Players discuss or start actions in response to the simulated emergency.',
  'Controllers: plan and manage exercise play, set up and run the exercise site, and act in the roles of organizations or individuals that are not playing. Controllers direct the pace of play, deliver injects from the MSEL and keep play within the exercise scope.',
  'Simulators (SimCell): control staff who play the outside world (agencies, callers, media, the public) and answer player calls and requests as those parties would.',
  'Evaluators: observe and document performance against the exercise objectives and critical tasks, using the Exercise Evaluation Guides (EEGs).',
  'Observers: visit or view selected parts of the exercise; they do not play and do not take part in discussion.',
  'Facilitator: guides the discussion through each module, keeps it on the objectives and runs the hot wash.',
]

/** Participant roles and responsibilities, plus the player roles of this scenario. */
export function participantRoleBlocks(model: ExportModel): Block[] {
  const roles = model.scenario.roles
  return [
    h3('Participant Roles and Responsibilities'),
    para('The term "participant" covers all people taking part in the exercise:'),
    list(HSEEP_ROLES),
    ...(roles.length
      ? [
          {
            kind: 'table',
            caption: 'Player roles',
            header: ['Player Role', 'Team', 'Responsibilities'],
            rows: roles.map((r) => [
              r.abbreviation ? `${r.name} (${r.abbreviation})` : r.name,
              r.team,
              r.description,
            ]),
          } satisfies Block,
        ]
      : []),
  ]
}

const timeWindow = (p: Phase, start: string): string =>
  `${p.startTime}–${p.endTime} (${wallClockAt(start, p.startTime)}–${wallClockAt(start, p.endTime)})`

export const startClock = (s: Scenario): string =>
  s.brief.startWallClock ?? DEFAULT_START_WALL_CLOCK

/** "Module 2: The Crisis" */
export const moduleTitle = (p: Phase): string => `Module ${p.index + 1}: ${p.title}`

export const moduleWindow = (s: Scenario, p: Phase): string => timeWindow(p, startClock(s))

/** One line per module: title, time window and goal. */
export function moduleLines(model: ExportModel): string[] {
  const s = model.scenario
  return phasesOf(s).map((p) => `${moduleTitle(p)} (${moduleWindow(s, p)}): ${goalSummary(p.goal)}`)
}

export function exerciseStructureBlocks(model: ExportModel): Block[] {
  const n = model.scenario.phases.length
  return [
    h3('Exercise Structure'),
    para(
      `The exercise is a facilitated, discussion-based tabletop in ${n} ${n === 1 ? 'module' : 'modules'}. Each module opens with a situation update, continues with injects delivered by the controllers, and closes with discussion. Time jumps move the scenario clock forward between modules.`,
    ),
    list(moduleLines(model)),
  ]
}

/** HSEEP's standard lists, used until the `sitman` stage has written this room's own. */
export const DEFAULT_ASSUMPTIONS = [
  'The exercise is conducted in a no-fault learning environment where plans, policies, procedures and capabilities are evaluated, not individuals.',
  'The scenario is plausible, and events occur as they are presented.',
  'All players receive information at the same time.',
  'Players respond in accordance with existing plans, policies and procedures as they understand them.',
]
export const DEFAULT_ARTIFICIALITIES = [
  'Time jumps move the scenario clock forward between modules; events in between are summarized.',
  'The SimCell plays every agency, caller, partner and member of the public outside the room.',
  'Systems named in the scenario are not touched; injects describe their state.',
  'Injects are delivered on paper, on screen or read aloud rather than through real channels.',
]

export function assumptionsOrDefault(s: Scenario): {
  assumptions: string[]
  artificialities: string[]
  generated: boolean
} {
  const a = s.sitman?.assumptions ?? []
  const b = s.sitman?.artificialities ?? []
  return {
    assumptions: a.length ? a : DEFAULT_ASSUMPTIONS,
    artificialities: b.length ? b : DEFAULT_ARTIFICIALITIES,
    generated: !!(a.length || b.length),
  }
}

export function assumptionsBlocks(s: Scenario): Block[] {
  const x = assumptionsOrDefault(s)
  return [
    h3('Exercise Assumptions and Artificialities'),
    para(
      'In any exercise, assumptions and artificialities are necessary to complete play in the time available and to account for logistical limits. Participants accept that they are needed and do not let them get in the way of meeting the objectives.',
    ),
    h4('Assumptions'),
    list(x.assumptions),
    h4('Artificialities'),
    list(x.artificialities),
  ]
}

/** Appendix A: phases, time jumps, STARTEX and ENDEX with exercise time and scenario clock. */
export function scheduleRows(model: ExportModel): string[][] {
  const s = model.scenario
  const start = startClock(s)
  const at = (t: string, wall?: string) => [t, wall ?? wallClockAt(start, t)]
  const rows: string[][] = [['', '', 'Registration, welcome and player briefing']]
  for (const { phase, rows: msel } of groupRows(s)) {
    if (phase) rows.push([...at(phase.startTime), `${moduleTitle(phase)} begins`])
    for (const r of msel) {
      if (r.purposeTag === 'STARTEX') rows.push([...at(r.time, r.wallClock), 'STARTEX'])
      if (r.purposeTag === 'TIME_JUMP')
        rows.push([...at(r.time, r.wallClock), 'Time jump (controller announcement)'])
      if (r.purposeTag === 'ENDEX') rows.push([...at(r.time, r.wallClock), 'ENDEX'])
    }
  }
  rows.push(['', '', 'Hot wash'], ['', '', 'Controller and evaluator debrief'])
  return rows
}

export function scheduleTable(model: ExportModel): Block {
  return {
    kind: 'table',
    caption: 'Exercise schedule',
    header: ['Exercise Time', 'Scenario Clock', 'Activity'],
    rows: scheduleRows(model),
  }
}

/** Appendix B: the sponsor and the participating organizations (a fill-in row when none). */
export function participantRows(model: ExportModel): string[][] {
  const c = model.conduct
  const rows = [
    ...(c.sponsor.trim() ? [[c.sponsor.trim(), 'Sponsor']] : []),
    ...c.participatingOrganizations.filter((o) => o.trim()).map((o) => [o.trim(), 'Participant']),
  ]
  return rows.length ? rows : [['', '']]
}

export function participantsTable(model: ExportModel): Block {
  return {
    kind: 'table',
    caption: 'Exercise participants',
    header: ['Organization', 'Participation'],
    rows: participantRows(model),
    fillBlanks: true,
  }
}

export function communicationRows(model: ExportModel): string[][] {
  const rows = model.conduct.communications.map((c) => [c.channel, c.purpose, c.detail])
  return rows.length ? rows : [['', '', '']]
}

export function communicationsTable(model: ExportModel, caption = 'Communications plan'): Block {
  return {
    kind: 'table',
    caption,
    header: ['Channel', 'Purpose', 'Detail'],
    rows: communicationRows(model),
    fillBlanks: true,
  }
}

/** The designer's acronyms, else the standard ones plus the role abbreviations; sorted. */
export function acronymRows(model: ExportModel): string[][] {
  const own = model.conduct.acronyms.map((a): [string, string] => [a.term, a.meaning])
  const roles = model.scenario.roles
    .filter((r) => r.abbreviation && r.abbreviation !== r.name)
    .map((r): [string, string] => [r.abbreviation, r.name])
  const list = sortedAcronyms(own)
  return (list.length ? list : seededAcronyms(roles)).map((a) => [a.term, a.meaning])
}

export function acronymsTable(model: ExportModel): Block {
  return {
    kind: 'table',
    caption: 'Acronyms',
    header: ['Acronym', 'Meaning'],
    rows: acronymRows(model),
  }
}

/** The exercise marking; the default one follows the document language (spec 0435 FR-6). */
export const markingOf = (model: ExportModel): string => {
  const marking = model.conduct.marking.trim()
  return !marking || marking === DEFAULT_MARKING ? tr(model.lang, DEFAULT_MARKING) : marking
}

export function realWorldBlocks(model: ExportModel): Block[] {
  return [
    para(
      `Any participant may stop play for a real emergency by announcing "REAL WORLD EMERGENCY". All exercise activity stops while the emergency is handled; the exercise director decides when play resumes. Real-world messages are marked "REAL WORLD" so they are never mistaken for injects.`,
    ),
    para(
      `All exercise documents and messages are marked "${markingOf(model)}". Start and end every radio or phone exchange with "This is an exercise."`,
    ),
  ]
}
