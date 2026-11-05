// classroom:* evidence, scores and rotation (#724, #727, #730). Nothing here uses the network and
// no model decides a score.
import { classroomRoot, classroomState } from '../../classroom/state'
import {
  addEvidence,
  clearScore,
  linkEvidence,
  listEvidence,
  removeEvidence,
  saveRotation,
  scoringView,
  setReflectionPrompts,
  setScore,
  tallyHotwash,
} from '../../classroom/scoring'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'classroom:evidence-add': async ({ projectPath, evidence }) =>
    addEvidence(await classroomRoot(projectPath), evidence),

  'classroom:evidence-list': async ({ projectPath, scenarioId, studentId }) =>
    listEvidence(await classroomRoot(projectPath), scenarioId, studentId),

  'classroom:evidence-link': async ({ projectPath, evidenceId, ...link }) =>
    linkEvidence(await classroomRoot(projectPath), evidenceId, link),

  'classroom:evidence-remove': async ({ projectPath, evidenceId }) =>
    removeEvidence(await classroomRoot(projectPath), evidenceId),

  'classroom:hotwash-tally': async ({ projectPath, scenarioId, studentId, note }) =>
    tallyHotwash(await classroomRoot(projectPath), scenarioId, studentId, note),

  'classroom:scoring-view': async ({ projectPath, scenarioId, sectionId }) =>
    scoringView(await classroomRoot(projectPath), scenarioId, sectionId),

  'classroom:set-score': async ({ projectPath, ...score }) => {
    const root = await classroomRoot(projectPath)
    await setScore(root, score)
    return scoringView(root, score.scenarioId)
  },

  'classroom:clear-score': async ({ projectPath, ...key }) => {
    const root = await classroomRoot(projectPath)
    await clearScore(root, key)
    return scoringView(root, key.scenarioId)
  },

  'classroom:set-reflection-prompts': async ({ projectPath, prompts }) => {
    const root = await classroomRoot(projectPath)
    await setReflectionPrompts(root, prompts)
    return classroomState(root)
  },

  'classroom:rotation-plan': async ({ projectPath, ...input }) =>
    saveRotation(await classroomRoot(projectPath), input),
})
