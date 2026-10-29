// surveys:* (#422): definitions, templates, paper responses and results for one scenario.
import { SurveyResponseInput, type Survey } from '@shared/schemas'
import { cleanAnswers, missingRequired, roundToMinute } from '@shared/survey-layout'
import { AppError } from '../../lib/errors'
import { newId, nowIso } from '../../lib/ids'
import { requireProject } from '../../project/guard'
import { getScenario } from '../../scenario/store'
import { mirroredSections, shouldMirror } from '../../surveys/pairs'
import { minResponsesSetting, pairOf, surveySummary } from '../../surveys/results'
import {
  appendResponse,
  deleteResponses,
  deleteSurvey,
  listSurveys,
  readResponses,
  readSurvey,
  writeSurvey,
} from '../../surveys/store'
import { blankSurvey, surveyTemplateInfo, surveysFromTemplate } from '../../surveys/templates'
import { defineHandlers } from '../registry'

/** Team names of the scenario's roles: the only role groups a survey may offer. */
const teamNames = (roles: { team: string }[]): string[] =>
  [...new Set(roles.map((r) => r.team.trim()).filter(Boolean))].slice(0, 20)

async function saveWithPair(
  root: string,
  scenarioId: string,
  survey: Survey,
  baseUpdatedAt?: string,
): Promise<Survey> {
  const saved = await writeSurvey(root, scenarioId, survey, baseUpdatedAt ? { baseUpdatedAt } : {})
  const pair = pairOf(saved, await listSurveys(root, scenarioId))
  if (shouldMirror(saved, pair))
    await writeSurvey(root, scenarioId, {
      ...pair,
      sections: mirroredSections(saved.sections, pair.edition),
    })
  return saved
}

export default defineHandlers({
  'surveys:list': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    const surveys = await listSurveys(root, scenarioId)
    return Promise.all(
      surveys.map(async (survey) => ({
        survey,
        responseCount: (await readResponses(root, scenarioId, survey.id)).length,
      })),
    )
  },

  'surveys:get': async ({ projectPath, scenarioId, surveyId }) =>
    readSurvey(await requireProject(projectPath), scenarioId, surveyId),

  'surveys:save': async ({ projectPath, scenarioId, survey, baseUpdatedAt }) => {
    const root = await requireProject(projectPath)
    await readSurvey(root, scenarioId, survey.id) // saves update; creating goes through from-template
    return saveWithPair(root, scenarioId, survey, baseUpdatedAt)
  },

  'surveys:delete': async ({ projectPath, scenarioId, surveyId }) => {
    await deleteSurvey(await requireProject(projectPath), scenarioId, surveyId)
  },

  'surveys:templates': () => surveyTemplateInfo(),

  'surveys:from-template': async ({ projectPath, scenarioId, templateId }) => {
    const root = await requireProject(projectPath)
    const scenario = await getScenario(root, scenarioId)
    const now = nowIso()
    const created =
      templateId === 'blank'
        ? [blankSurvey(now)]
        : surveysFromTemplate(templateId, {
            now,
            objectives: scenario.objectives,
            roleGroups: teamNames(scenario.roles),
          })
    const surveys: Survey[] = []
    for (const s of created) surveys.push(await writeSurvey(root, scenarioId, s))
    return { surveys }
  },

  'surveys:duplicate': async ({ projectPath, scenarioId, surveyId }) => {
    const root = await requireProject(projectPath)
    const source = await readSurvey(root, scenarioId, surveyId)
    const { pairId: _pair, ...rest } = source
    const now = nowIso()
    return writeSurvey(root, scenarioId, {
      ...rest,
      id: newId(),
      title: `${source.title} (copy)`.slice(0, 200),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    } as Survey)
  },

  'surveys:responses': async ({ projectPath, scenarioId, surveyId }) =>
    readResponses(await requireProject(projectPath), scenarioId, surveyId),

  'surveys:add-response': async ({ projectPath, scenarioId, surveyId, response }) => {
    const root = await requireProject(projectPath)
    const survey = await readSurvey(root, scenarioId, surveyId)
    const input = SurveyResponseInput.parse(response)
    const cleaned = cleanAnswers(survey, input.answers, input.otherText)
    const missing = missingRequired(survey, cleaned)
    if (missing.length)
      throw new AppError('VALIDATION', `Answer the required questions first (${missing.length}).`, {
        missing: missing.map((q) => q.id),
      })
    if (!Object.keys(cleaned.answers).length && !Object.keys(cleaned.otherText).length)
      throw new AppError('VALIDATION', 'This response has no answers.')
    const roleGroup = input.roleGroup?.trim()
    const responseId = newId()
    const count = await appendResponse(root, scenarioId, {
      id: responseId,
      surveyId,
      channel: input.channel,
      at: roundToMinute(nowIso()),
      ...(survey.askRoleGroup && roleGroup && survey.roleGroups.includes(roleGroup)
        ? { roleGroup }
        : {}),
      ...cleaned,
    })
    return { responseId, count }
  },

  'surveys:delete-responses': async ({ projectPath, scenarioId, surveyId, responseId }) => {
    const root = await requireProject(projectPath)
    await readSurvey(root, scenarioId, surveyId)
    return { count: await deleteResponses(root, scenarioId, surveyId, responseId) }
  },

  'surveys:summary': async ({ projectPath, scenarioId, surveyId }) =>
    surveySummary(
      await requireProject(projectPath),
      scenarioId,
      surveyId,
      await minResponsesSetting(),
    ),
})
