// Situation Manual (SitMan, #420): overview, general information, one module per phase and the
// appendices. The facilitator edition carries every module; the player edition gives module 1
// in full and, for later modules, only the title, time window and discussion questions, so
// players do not learn what is coming from the packet.
import type { Phase, Role, Scenario, SitManModule } from '@shared/schemas'
import { citationLabel } from '../../generate/docs'
import { goalSummary } from '../../generate/mappers'
import type { ExportModel } from '../model'
import { h2, h3, list, note, para, type Block } from './blocks'
import {
  acronymsTable,
  assumptionsBlocks,
  exerciseOverviewFacts,
  exerciseStructureBlocks,
  moduleTitle,
  moduleWindow,
  objectivesTable,
  participantRoleBlocks,
  participantsTable,
  scheduleTable,
} from './common'

export type SitManEdition = 'facilitator' | 'player'

export const NO_QUESTIONS_YET = 'Discussion questions not generated yet.'
export const WITHHELD_NARRATIVE =
  'The situation for this module is handed out when the module begins.'

const GUIDELINES = [
  'This exercise is held in an open, low-stress, no-fault environment. Varying viewpoints, even disagreements, are expected.',
  'Respond to the scenario using your knowledge of existing plans and capabilities and any insights from training.',
  'Decisions are not precedent-setting and may not reflect your organization’s final position on an issue.',
  'Issue identification is not as valuable as suggesting solutions and courses of action.',
]

function generalInformation(model: ExportModel): Block[] {
  return [
    h2('General Information'),
    h3('Exercise Objectives and Core Capabilities'),
    objectivesTable(model),
    ...participantRoleBlocks(model),
    ...exerciseStructureBlocks(model),
    h3('Exercise Guidelines'),
    list(GUIDELINES),
    ...assumptionsBlocks(model.scenario),
    h3('Exercise Evaluation'),
    para(
      'Evaluation of the exercise is based on the objectives and the Exercise Evaluation Guides (EEGs), the observations of evaluators, the hot wash, and the Participant Feedback Forms. Results appear in the After-Action Report and Improvement Plan.',
    ),
  ]
}

function roleNames(ids: string[], roles: Role[]): string {
  return ids
    .map((id) => roles.find((r) => r.id === id))
    .map((r) => r?.abbreviation || r?.name || '')
    .filter(Boolean)
    .join(', ')
}

/** "Operations: …  (Objective: Decision Making · See: TIRP › 13.6)" */
function questionLine(q: SitManModule['discussionQuestions'][number], s: Scenario): string {
  const refs = [
    q.objectiveRef ? `Objective: ${q.objectiveRef}` : '',
    q.roleIds.length && !/^[^:]{1,40}:/.test(q.text) ? `For: ${roleNames(q.roleIds, s.roles)}` : '',
    q.citations.length ? `See: ${q.citations.map(citationLabel).join('; ')}` : '',
  ].filter(Boolean)
  return refs.length ? `${q.text} (${refs.join(' · ')})` : q.text
}

function questionsBlocks(m: SitManModule | undefined, s: Scenario): Block[] {
  const qs = m?.discussionQuestions ?? []
  return [
    h3('Discussion Questions'),
    qs.length
      ? list(
          qs.map((q) => questionLine(q, s)),
          true,
        )
      : note(NO_QUESTIONS_YET),
  ]
}

function moduleBlocks(
  model: ExportModel,
  phase: Phase,
  m: SitManModule | undefined,
  withheld: boolean,
): Block[] {
  const s = model.scenario
  const head = [h2(moduleTitle(phase)), para(moduleWindow(s, phase), 'Time window')]
  if (withheld) return [...head, note(WITHHELD_NARRATIVE), ...questionsBlocks(m, s)]
  const narrative = m?.narrativeMd.trim()
  return [
    ...head,
    para(goalSummary(phase.goal), 'Module goal'),
    h3('Situation'),
    narrative ? { kind: 'markdown', md: narrative, baseLevel: 4 } : para(goalSummary(phase.goal)),
    ...(m?.keyIssues.length ? [h3('Key Issues'), list(m.keyIssues)] : []),
    ...questionsBlocks(m, s),
  ]
}

/** The module of a phase, if the `sitman` stage (or the designer) wrote one. */
export const moduleFor = (s: Scenario, phaseId: string): SitManModule | undefined =>
  s.sitman?.modules.find((m) => m.phaseId === phaseId)

/** The SitMan's blocks, in HSEEP order. */
export function sitmanBlocks(model: ExportModel, edition: SitManEdition): Block[] {
  const s = model.scenario
  const phases = [...s.phases].sort((a, b) => a.index - b.index)
  return [
    h2('Exercise Overview'),
    { kind: 'facts', caption: 'Exercise overview', rows: exerciseOverviewFacts(model) },
    ...generalInformation(model),
    ...phases.flatMap((p, i) =>
      moduleBlocks(model, p, moduleFor(s, p.id), edition === 'player' && i > 0),
    ),
    h2('Appendix A: Exercise Schedule'),
    scheduleTable(model),
    h2('Appendix B: Exercise Participants'),
    participantsTable(model),
    h2('Appendix C: Acronyms'),
    acronymsTable(model),
  ]
}
