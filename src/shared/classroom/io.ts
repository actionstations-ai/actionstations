// Import and export of rubrics and outcome sets as JSON (#720, #722). Imported text is untrusted:
// it is parsed with the schemas, capped, and given fresh ids where a clash would overwrite.
import { z } from 'zod'
import { ClassroomRubric, CLASSROOM_LIMITS, OutcomeSet, type Outcome } from '../schemas/classroom'
import starterRubrics from './starter-rubrics.json'

const MAX_JSON_BYTES = 500_000

function parseJson(text: string): unknown {
  if (text.length > MAX_JSON_BYTES) throw new Error('The file is too large.')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON.')
  }
}

/** Original starter rubrics bundled with the app (communication, decisions, roles, plans, awareness, coordination, evaluator quality). */
export const STARTER_RUBRICS: ClassroomRubric[] = z.array(ClassroomRubric).parse(starterRubrics)

export function exportRubric(rubric: ClassroomRubric): string {
  return JSON.stringify(ClassroomRubric.parse(rubric), null, 2) + '\n'
}

/** One rubric, or an array of them. */
export function importRubrics(text: string): ClassroomRubric[] {
  const raw = parseJson(text)
  const list = z.array(ClassroomRubric).max(CLASSROOM_LIMITS.rubrics)
  const parsed = Array.isArray(raw) ? list.safeParse(raw) : list.safeParse([raw])
  if (!parsed.success)
    throw new Error('The file is not a rubric: ' + parsed.error.issues[0]?.message)
  return parsed.data
}

export function exportOutcomeSet(name: string, outcomes: Outcome[]): string {
  return JSON.stringify(OutcomeSet.parse({ formatVersion: 1, name, outcomes }), null, 2) + '\n'
}

export function importOutcomeSet(text: string): OutcomeSet {
  const parsed = OutcomeSet.safeParse(parseJson(text))
  if (!parsed.success)
    throw new Error('The file is not an outcome set: ' + parsed.error.issues[0]?.message)
  return parsed.data
}
