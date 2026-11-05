// The reflection survey of a classroom scenario (#724, spec 0453 FR-6): the course's prompts as
// open-ended questions, marked so live play tells students their answers go to the instructor
// with their name. Stored like any survey, so the existing Surveys panel opens it.
import { Survey } from '@shared/schemas'
import { nowIso } from '../lib/ids'
import { readSurvey, writeSurvey } from '../surveys/store'
import { readCourse } from './store'

export const REFLECTION_SURVEY_ID = 'classroom-reflection'

export async function saveReflectionSurvey(
  root: string,
  scenarioId: string,
): Promise<{ surveyId: string }> {
  const { reflectionPrompts } = await readCourse(root)
  const existing = await readSurvey(root, scenarioId, REFLECTION_SURVEY_ID).catch(() => undefined)
  const now = nowIso()
  const survey = Survey.parse({
    ...existing,
    id: REFLECTION_SURVEY_ID,
    title: 'Course reflection',
    kind: 'custom',
    timing: 'post',
    introMd:
      'These answers go to your instructor with your name. They are part of your course record.',
    classroomReflection: true,
    status: 'ready',
    sections: [
      {
        id: 'reflection',
        title: 'Reflection',
        questions: reflectionPrompts.map((text, i) => ({
          id: `q${i + 1}`,
          type: 'text',
          text,
          required: false,
          long: true,
          maxLength: 2000,
        })),
      },
    ],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })
  await writeSurvey(root, scenarioId, survey)
  return { surveyId: survey.id }
}
