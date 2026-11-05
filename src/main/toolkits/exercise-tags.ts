// Program exercise tags a scenario carries (spec 0457 FR-14): resolved from the toolkits of the
// enabled packs, so a tag whose pack is removed is skipped and the AAR simply omits its table.
import { exerciseTagsOf, tagsByIds, type ToolkitExerciseTag } from '@shared/toolkits'
import { listToolkits } from './registry'

export async function resolveExerciseTags(ids: readonly string[]): Promise<ToolkitExerciseTag[]> {
  if (!ids.length) return []
  return tagsByIds(
    (await listToolkits()).map((l) => l.toolkit),
    ids,
  )
}

/** Every tag the enabled packs offer, for the picker. */
export async function listExerciseTags(): Promise<ToolkitExerciseTag[]> {
  return exerciseTagsOf((await listToolkits()).map((l) => l.toolkit))
}
