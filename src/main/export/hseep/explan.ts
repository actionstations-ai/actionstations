// Exercise Plan (ExPlan, #420) in the HSEEP 2020 section order. It names the threat only at the
// level of the overview's theme and carries no inject detail, so it may go to players before
// the exercise (players/ in the distribution ZIP).
import type { ExportModel } from '../model'
import { h2, h3, h4, list, para, type Block } from './blocks'
import {
  acronymsTable,
  assumptionsBlocks,
  communicationsTable,
  exerciseOverviewFacts,
  exerciseStructureBlocks,
  objectiveText,
  objectivesTable,
  participantRoleBlocks,
  participantsTable,
  realWorldBlocks,
  scheduleTable,
  siteText,
} from './common'

function overview(model: ExportModel): Block[] {
  return [
    h2('Exercise Overview'),
    { kind: 'facts', caption: 'Exercise overview', rows: exerciseOverviewFacts(model) },
    h3('Exercise Objectives'),
    list(model.scenario.objectives.map(objectiveText), true),
  ]
}

function generalInformation(model: ExportModel): Block[] {
  return [
    h2('General Information'),
    para(
      'This Exercise Plan gives participants the information they need to take part: objectives, roles, logistics and the rules of the exercise. It contains no scenario detail beyond the overview.',
    ),
    h3('Exercise Objectives and Core Capabilities'),
    objectivesTable(model),
    ...participantRoleBlocks(model),
    ...exerciseStructureBlocks(model),
    ...assumptionsBlocks(model.scenario),
  ]
}

function logistics(model: ExportModel): Block[] {
  const c = model.conduct
  return [
    h2('Exercise Logistics'),
    h3('Safety'),
    para(
      'Participant safety takes priority over exercise events. Every participant is responsible for safety; report any hazard to a controller at once.',
    ),
    para(c.safetyNotes.trim(), 'Site safety notes'),
    h3('Fire and Real Emergencies'),
    ...realWorldBlocks(model),
    h3('Site Access'),
    para(siteText(model), 'Exercise site'),
    h3('Security'),
    para(c.securityNotes.trim(), 'Security notes'),
    h3('Observers and Media'),
    para(
      c.observersAllowed
        ? 'Observers may attend with the exercise director’s approval. They sit apart from players, do not take part in discussion and are escorted by a controller. Media requests go to the exercise director.'
        : 'This exercise has no observers. Media requests go to the exercise director.',
    ),
    h3('Exercise Identification'),
    para(
      'Controllers, evaluators and the SimCell wear identification that sets them apart from players. Exercise materials carry the exercise marking on every page.',
    ),
    h3('Communications Plan'),
    para('The channels used during the exercise are listed in Appendix C.'),
  ]
}

function postExercise(): Block[] {
  return [
    h2('Post-Exercise and Evaluation Activities'),
    h3('Hot Wash'),
    para(
      'Immediately after ENDEX the facilitator leads a hot wash with all players: strengths, areas for improvement and anything the exercise design got in the way of.',
    ),
    h3('Controller and Evaluator Debrief'),
    para(
      'Controllers and evaluators meet after the hot wash to compare observations against the objectives and critical tasks before memories fade.',
    ),
    h3('Participant Feedback Form'),
    para(
      'Every participant completes a Participant Feedback Form before leaving; the answers feed the After-Action Report.',
    ),
    h3('After-Action Meeting'),
    para(
      'Leadership of the participating organizations reviews the draft After-Action Report and agrees the corrective actions, owners and dates.',
    ),
    h3('After-Action Report and Improvement Plan'),
    para(
      'The AAR/IP records strengths and areas for improvement per objective and Core Capability, with the Improvement Plan that tracks each corrective action to completion.',
    ),
  ]
}

function participantGuidance(): Block[] {
  return [
    h2('Participant Information and Guidance'),
    h3('Exercise Rules'),
    list([
      'Real-world emergency actions take priority over exercise actions.',
      'Respond as you would in a real incident, based on your knowledge of current plans and capabilities.',
      'Treat the scenario as real. Decisions are not precedent-setting and may not reflect your organization’s final position.',
      'Speak from your role. Ask the SimCell for anything you would get from outside the room.',
      'Keep side conversations short so everyone hears the injects.',
    ]),
    h3('Player Instructions'),
    h4('Before the Exercise'),
    list([
      'Read this Exercise Plan and the plans, policies and procedures your role would use.',
      'Arrive in time for registration and the player briefing.',
      'Bring the materials your role uses in a real incident (contact lists, checklists).',
    ]),
    h4('During the Exercise'),
    list([
      'Respond to injects as you would in a real incident; state the actions you would take and who you would notify.',
      'Address requests for information to the people in the room or to the SimCell.',
      'Write down decisions and the reasons for them; evaluators may ask about them.',
    ]),
    h4('After the Exercise'),
    list([
      'Take part in the hot wash and share your observations.',
      'Complete the Participant Feedback Form.',
    ]),
  ]
}

function appendices(model: ExportModel): Block[] {
  return [
    h2('Appendix A: Exercise Schedule'),
    scheduleTable(model),
    h2('Appendix B: Exercise Participants'),
    participantsTable(model),
    h2('Appendix C: Communications Plan'),
    communicationsTable(model),
    h2('Appendix D: Acronyms'),
    acronymsTable(model),
  ]
}

/** The ExPlan's blocks, in HSEEP 2020 order. */
export function explanBlocks(model: ExportModel): Block[] {
  return [
    ...overview(model),
    ...generalInformation(model),
    ...logistics(model),
    ...postExercise(),
    ...participantGuidance(),
    ...appendices(model),
  ]
}
