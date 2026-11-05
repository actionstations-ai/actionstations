// Program exercise tags a scenario carries (spec 0457 FR-14): resolved from the toolkits of the
// enabled packs, so a tag whose pack is removed is skipped and the AAR simply omits its table.
// Each resolved tag carries its program capabilities mapped to Core Capabilities through the
// toolkits' capability mappings, for the AAR's program capability table.
import {
  exerciseTagsOf,
  tagCapabilityRows,
  tagsByIds,
  type ProgramTag,
  type ToolkitExerciseTag,
} from '@shared/toolkits'
import { listToolkits } from './registry'

export async function resolveExerciseTags(ids: readonly string[]): Promise<ProgramTag[]> {
  if (!ids.length) return []
  const toolkits = (await listToolkits()).map((l) => l.toolkit)
  return tagsByIds(toolkits, ids).map((tag) => {
    const capabilityMap = tagCapabilityRows(tag, toolkits)
    return capabilityMap.length ? { ...tag, capabilityMap } : tag
  })
}

/** Every tag the enabled packs offer, for the picker. */
export async function listExerciseTags(): Promise<ToolkitExerciseTag[]> {
  return exerciseTagsOf((await listToolkits()).map((l) => l.toolkit))
}
