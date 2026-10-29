// Controller/Evaluator Handbook in the HSEEP 2020 order (#420). documents/handbook.md is not
// rewritten: its sections are placed under the matching HSEEP headings (overview → Exercise
// Overview; room, rules and SimCell scripts → Controller Instructions; rubric and hot wash →
// Evaluator Instructions), and the structured rubric, hot wash and SimCell scripts fill in
// where the markdown has none. The classroom handbook (handbook.html) stays as it was.
import type { Scenario } from '@shared/schemas'
import { stripEndNote } from '../escape'
import { tasksForRow, type ExportEvaluation } from '../evaluation'
import type { ExportModel } from '../model'
import { groupRows, toText } from '../views'
import { h2, h3, h4, list, note, para, type Block } from './blocks'
import {
  acronymsTable,
  communicationsTable,
  exerciseOverviewFacts,
  exerciseStructureBlocks,
  realWorldBlocks,
  scheduleTable,
} from './common'
import { handbookParts, type HandbookParts } from './handbook-sections'

export const NO_EEGS_YET =
  'Exercise Evaluation Guides have not been prepared for this scenario yet. Evaluators use the objectives and the grading rubric until they are.'

/** HSEEP's rating scale, printed until the scenario's EEGs bring their own. */
export const DEFAULT_RATING_SCALE = [
  'P: Performed without challenges. The critical tasks were completed in a way that achieved the objective and did not create additional risks.',
  'S: Performed with some challenges. The objective was achieved, but some opportunities to improve effectiveness or efficiency were found.',
  'M: Performed with major challenges. The objective was achieved, but with significant problems, or additional risks were created.',
  'U: Unable to be performed. The critical tasks were not performed in a way that achieved the objective.',
]

const md = (text: string): Block => ({ kind: 'markdown', md: text, baseLevel: 4 })

function overview(model: ExportModel, parts: HandbookParts): Block[] {
  return [
    h2('Exercise Overview'),
    { kind: 'facts', caption: 'Exercise overview', rows: exerciseOverviewFacts(model) },
    ...(parts.overview ? [md(parts.overview)] : []),
  ]
}

function generalInformation(model: ExportModel): Block[] {
  const c = model.conduct
  return [
    h2('General Information'),
    h3('Controller and Evaluator Roles'),
    list([
      'The exercise director has overall responsibility for planning, conduct and evaluation, and decides when to pause, resume or end play.',
      'Controllers keep the exercise on schedule, deliver injects from the MSEL, answer player questions about the scenario and keep play within its scope.',
      'The SimCell plays every person and organization outside the room and answers player calls as they would.',
      'Evaluators observe and record player discussion and decisions against the objectives and critical tasks. They do not take part in play.',
    ]),
    ...exerciseStructureBlocks(model),
    h3('Exercise Conduct'),
    h4('Safety'),
    para(c.safetyNotes.trim(), 'Site safety notes'),
    h4('Security'),
    para(c.securityNotes.trim(), 'Security notes'),
    h4('Communications'),
    para('Exercise channels are listed in the Communications Directory (Appendix D).'),
    h4('Player Instructions'),
    para(
      'Players received the Exercise Plan and the Player Briefing Packet. Remind them to respond from their roles, to ask the SimCell for anything from outside the room, and to record decisions with their reasons.',
    ),
    h4('Real-World Emergencies'),
    ...realWorldBlocks(model),
  ]
}

function simcellBlocks(s: Scenario, rules: string | undefined): Block[] {
  if (!s.simcellScripts.length || /simcell scripts?/i.test(rules ?? '')) return []
  return [
    h3('SimCell Scripts'),
    ...s.simcellScripts.flatMap((sc) => [
      h4(sc.rolePlayed),
      para(sc.trigger, 'When'),
      ...(sc.hardQuestions.length ? [list(sc.hardQuestions.map((q) => `Ask: ${q}`))] : []),
      ...(sc.concessions.length ? [list(sc.concessions.map((c) => `Concede: ${c}`))] : []),
    ]),
  ]
}

function controllerInstructions(model: ExportModel, parts: HandbookParts): Block[] {
  return [
    h2('Controller Instructions'),
    h3('Before the Exercise'),
    list([
      'Read this handbook, the MSEL and the Master Inject Deck in full.',
      'Set up the room and check the projector, audio and any phones or radios.',
      'Sort the inject deck in MSEL order and place handouts by team.',
      'Brief evaluators and the SimCell on the schedule and on any changes to the MSEL.',
    ]),
    h3('During the Exercise'),
    list([
      'The MSEL is the controller’s script: deliver each inject at its scenario time, to the role it names, in the way the deck says.',
      'Watch for the expected player actions; note when they happen or do not.',
      'Use time jumps to move the clock forward when a module has done its work.',
      'Keep discussion on the objectives; park side issues for the hot wash.',
    ]),
    h3('After the Exercise'),
    list([
      'Run the hot wash with the facilitator.',
      'Collect Participant Feedback Forms and controller notes.',
      'Join the controller and evaluator debrief.',
    ]),
    ...(parts.room ? [h3('Room Setup and Logistics'), md(parts.room)] : []),
    ...(parts.rules ? [h3('Rules of Play'), md(parts.rules)] : []),
    ...simcellBlocks(model.scenario, parts.rules),
    h3('Delivering Injects'),
    para(
      'Hand paper injects to the named role, display screen injects for the room, play audio injects aloud, and read control cards (STARTEX, time jumps, ENDEX) to everyone. Never add detail the inject does not carry; answer follow-up questions as the SimCell.',
    ),
    h3('Managing Time'),
    para(
      'Each module has a time window (Appendix A). When discussion runs long, announce a time jump: "Pause exercise. We are moving forward to [time]. Resume." Keep at least 30 minutes for the hot wash.',
    ),
    ...parts.other.flatMap((o) => [h3(o.heading), md(o.body)]),
  ]
}

function rubricBlocks(model: ExportModel, parts: HandbookParts): Block[] {
  if (parts.rubric) return [h3('Grading Rubric'), md(parts.rubric)]
  const metrics = model.scenario.rubric?.metrics ?? []
  if (!metrics.length) return []
  return [
    h3('Grading Rubric'),
    {
      kind: 'table',
      caption: 'Grading rubric',
      header: ['Metric', 'Fail', 'Pass', 'Excellence'],
      rows: metrics.map((m) => [`${m.name} (${m.points} points)`, m.fail, m.pass, m.excellence]),
    },
  ]
}

function hotwashBlocks(model: ExportModel, parts: HandbookParts): Block[] {
  const head = h3('Hot Wash and Controller/Evaluator Debrief')
  if (parts.hotwash) return [head, md(parts.hotwash)]
  const hw = model.scenario.hotwash
  if (hw && (hw.methodDescription || hw.questions.length)) {
    return [
      head,
      ...(hw.methodDescription ? [para(hw.methodDescription)] : []),
      list(hw.questions.map((q) => (q.topic ? `${q.topic}: ${q.text}` : q.text))),
    ]
  }
  if (model.docs.hotwash.trim()) return [head, md(model.docs.hotwash)]
  return [
    head,
    para(
      'After ENDEX, ask the room for three things that went well and three that did not, team by team. Controllers and evaluators then meet to compare notes.',
    ),
  ]
}

function eegSummary(evaluation: ExportEvaluation | undefined): Block[] {
  if (!evaluation?.eegs.length) return [note(NO_EEGS_YET)]
  return [
    para('Each evaluator receives the EEGs for the capabilities they observe (Appendix C):'),
    list(evaluation.eegs.map((e) => `${e.capability}: ${e.criticalTasks.length} critical task(s)`)),
  ]
}

function evaluatorInstructions(model: ExportModel, parts: HandbookParts): Block[] {
  const scale = model.evaluation?.ratingScale.length
    ? model.evaluation.ratingScale
    : DEFAULT_RATING_SCALE
  return [
    h2('Evaluator Instructions'),
    h3('Exercise Evaluation Guides and Critical Tasks'),
    ...eegSummary(model.evaluation),
    h3('Observation Keys'),
    list([
      'Record what players say and decide, with the scenario time and the inject that prompted it.',
      'Note who made each decision and which plan or procedure they used.',
      'Note expected actions that did not happen, and actions taken that the MSEL did not expect.',
    ]),
    h3('Rating Scale'),
    list(scale),
    ...rubricBlocks(model, parts),
    h3('Data Collection'),
    para(
      'Keep notes on the EEG forms or in a log by module. Collect controller notes, chat or radio logs and the Participant Feedback Forms before leaving the site.',
    ),
    ...hotwashBlocks(model, parts),
    h3('Feeding the AAR/IP'),
    para(
      'Within a week, evaluators turn their notes into strengths and areas for improvement for each objective and capability, with the root cause and a recommended corrective action. These become the After-Action Report and Improvement Plan.',
    ),
  ]
}

/** Appendix B: one line per MSEL row (time, id, from, to, inject, expected action, capability). */
export function mselSummaryRows(model: ExportModel): string[][] {
  const s = model.scenario
  return groupRows(s)
    .flatMap((g) => g.rows)
    .map((r) => [
      r.time,
      r.id,
      r.from,
      toText(r, s),
      r.event,
      r.expectedAction,
      [...new Set(tasksForRow(model.evaluation, r.id).map((t) => t.capability))].join(', '),
    ])
}

function eegAppendix(evaluation: ExportEvaluation | undefined): Block[] {
  if (!evaluation?.eegs.length) return [note(NO_EEGS_YET)]
  return evaluation.eegs.flatMap((e) => [
    h3(e.capability),
    {
      kind: 'table',
      caption: `Critical tasks for ${e.capability}`,
      header: ['Critical Task', 'MSEL Rows', 'Observations', 'Rating'],
      rows: e.criticalTasks.map((t) => [t.text, t.rowIds.join(', '), '', '']),
      fillBlanks: true,
    } satisfies Block,
  ])
}

function appendices(model: ExportModel): Block[] {
  return [
    h2('Appendix A: Exercise Schedule'),
    scheduleTable(model),
    h2('Appendix B: MSEL Summary'),
    {
      kind: 'table',
      caption: 'MSEL summary',
      header: ['Time', 'ID', 'From', 'To', 'Inject', 'Expected Action', 'Capability'],
      rows: mselSummaryRows(model),
    },
    h2('Appendix C: Exercise Evaluation Guides'),
    ...eegAppendix(model.evaluation),
    h2('Appendix D: Communications Directory'),
    communicationsTable(model, 'Communications directory'),
    h2('Appendix E: Acronyms'),
    acronymsTable(model),
  ]
}

/** The HSEEP C/E Handbook's blocks, in HSEEP 2020 order. */
export function handbookHseepBlocks(model: ExportModel): Block[] {
  const parts = handbookParts(stripEndNote(model.docs.handbook))
  return [
    ...overview(model, parts),
    ...generalInformation(model),
    ...controllerInstructions(model, parts),
    ...evaluatorInstructions(model, parts),
    ...appendices(model),
  ]
}
