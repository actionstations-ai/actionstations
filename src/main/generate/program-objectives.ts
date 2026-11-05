// A program exercise tag's suggested objectives in a generated scenario (spec 0457 FR-14): the
// objectives_roles prompt is told they will be added so it does not restate them, and after
// the stage they are appended to the scenario's objectives as the program words them. The eeg
// stage then maps them to Core Capabilities like any other objective, and the AAR reports them.
import { conductOf, type Scenario } from '@shared/schemas/scenario'
import { mergeTagObjectives, type ToolkitExerciseTag } from '@shared/toolkits'
import { newId } from '../lib/ids'
import { resolveExerciseTags } from '../toolkits/exercise-tags'
import { dataSafe } from './vars'

/** The tags whose objectives a scenario takes: none for a classroom make-up with fixed objectives. */
export async function objectiveTagsOf(s: Scenario): Promise<ToolkitExerciseTag[]> {
  if (s.brief.fixedObjectives?.length) return []
  return (await resolveExerciseTags(conductOf(s).exerciseTags)).filter((t) => t.objectives.length)
}

/** `programObjectives` for the objectives_roles prompt; undefined without a tag. */
export function programObjectiveVars(tags: readonly ToolkitExerciseTag[]) {
  if (!tags.length) return undefined
  return dataSafe(tags.map((t) => ({ label: t.label, objectives: t.objectives })))
}

/** Append the tags' objectives the scenario lacks; returns how many were added. */
export function addProgramObjectives(s: Scenario, tags: readonly ToolkitExerciseTag[]): number {
  if (!tags.length) return 0
  const merged = mergeTagObjectives(s.objectives, tags, newId)
  s.objectives = merged.objectives
  return merged.added.length
}
