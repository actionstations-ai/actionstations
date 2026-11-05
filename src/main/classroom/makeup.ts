// Make-up versions (#730, spec 0453 FR-7). A make-up is a new scenario in the same project with
// the original's objectives, duration, phases and brief held fixed, and different facts, names
// and inject content. It runs through the normal generation stages (the caller starts the job);
// the objectives stage restores the fixed objectives, so the outcome mapping, the rubrics and
// the session settings carry over.
import type { ClassroomSession, OutcomeMapping, ScenarioBrief } from '@shared/schemas'
import { createScenario, getScenario } from '../scenario/store'
import { readCourse, updateClassroomFile } from './store'

export const MAKEUP_CONSTRAINT =
  'This is a make-up version of an earlier exercise. Keep the learning objectives, the difficulty, the number of phases and decision points and the kinds of injects, but use different facts: a different incident detail, different place and organization names, different people, different timings and new inject content.'

/** The brief of a make-up: the source's brief with its objectives fixed and the variation asked for. */
export function makeupBrief(source: {
  id: string
  brief: ScenarioBrief
  objectives: NonNullable<ScenarioBrief['fixedObjectives']>
}): ScenarioBrief {
  const withoutVariant = source.brief.constraints.filter((c) => c !== MAKEUP_CONSTRAINT)
  return {
    ...source.brief,
    learningObjectives: source.objectives.map((o) => o.text),
    constraints: [...withoutVariant, MAKEUP_CONSTRAINT],
    makeupOf: source.id,
    fixedObjectives: source.objectives,
    // A make-up is a fresh scenario: it is not a drill or a proposal from the program.
    drillOf: undefined,
  }
}

/**
 * What carries over to the make-up: objective and capability mappings (task ids are new), and the
 * session's section, rubrics and flag. Seats are not copied: the instructor seats the makeup group.
 */
export function carriedOver(
  mappings: OutcomeMapping[],
  session: ClassroomSession | undefined,
  from: string,
  to: string,
): { mappings: OutcomeMapping[]; session: ClassroomSession | undefined } {
  return {
    mappings: mappings
      .filter((m) => m.scenarioId === from && m.kind !== 'task')
      .map((m) => ({ ...m, scenarioId: to })),
    session: session
      ? {
          scenarioId: to,
          sectionId: session.sectionId,
          practice: false,
          seats: {},
          rubricIds: session.rubricIds,
          makeupOf: from,
        }
      : undefined,
  }
}

/** Create the make-up scenario and its classroom records; returns the new scenario's id. */
export async function createMakeup(root: string, sourceId: string): Promise<string> {
  const source = await getScenario(root, sourceId)
  const created = await createScenario(root, {
    title: `${source.title} (make-up)`,
    brief: makeupBrief({ id: source.id, brief: source.brief, objectives: source.objectives }),
  })
  const course = await readCourse(root)
  const carried = carriedOver(
    course.mappings,
    course.sessions.find((s) => s.scenarioId === sourceId),
    sourceId,
    created.id,
  )
  await updateClassroomFile(root, 'course', (file) => {
    file.mappings.push(...carried.mappings)
    if (carried.session) file.sessions.push(carried.session)
  })
  return created.id
}
