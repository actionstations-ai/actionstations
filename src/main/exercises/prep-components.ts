// The PREP core components a scenario's own play reaches (spec 0455 FR-10, #782). Kept apart from
// the exercise record so the program snapshot can use it without loading the renderer.
import { conductOf, type Scenario } from '@shared/schemas/scenario'
import { componentEvidence, type CoreComponentId } from '@shared/prep'
import { listInjects } from '../scenario/store'

/** The components a scenario's own injects and discussion list reach (decisions are not stored with it). */
export async function scenarioComponents(root: string, s: Scenario): Promise<CoreComponentId[]> {
  const injects = await listInjects(root, s.id)
  const evidence = componentEvidence({ injectTypes: injects.map((i) => i.type), decisionIds: [] })
  const prep = conductOf(s).prep
  for (const id of prep?.alsoExercised ?? []) evidence.set(id, evidence.get(id) ?? [])
  return [...evidence.keys()]
}
