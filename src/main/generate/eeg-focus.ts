// Keeps the eeg stage's capability mapping to a size one reply can finish (#421). A model that
// maps every objective to three different capabilities then writes one guide and stops, so the
// mapping is cut to the capabilities most objectives share, and the guides the reply left out
// are asked for one at a time.
import type { EegOutput } from '@shared/schemas'

/** Most distinct capabilities (and so guides) one exercise gets, unless an objective needs more. */
export const MAX_GUIDES = 6

/**
 * The mapping with at most `max` distinct capabilities: those named by the most objectives
 * (first named wins a tie). An objective left with none keeps its first capability, so every
 * objective still maps to at least one.
 */
export function focusCapabilities(
  out: EegOutput,
  max = MAX_GUIDES,
): EegOutput['objectiveCapabilities'] {
  const counts = new Map<string, number>()
  for (const oc of out.objectiveCapabilities)
    for (const c of new Set(oc.capabilities.map((x) => x.capability)))
      counts.set(c, (counts.get(c) ?? 0) + 1)
  const kept = new Set(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([c]) => c),
  )
  return out.objectiveCapabilities.map((oc) => {
    const own = oc.capabilities.filter((c) => kept.has(c.capability))
    return { ...oc, capabilities: own.length ? own : oc.capabilities.slice(0, 1) }
  })
}

/** Capabilities the mapping names that no guide in the reply covers, in mapping order. */
export function missingGuides(out: EegOutput): string[] {
  const guided = new Set(out.eegs.map((e) => e.capability))
  const wanted = out.objectiveCapabilities.flatMap((oc) => oc.capabilities.map((c) => c.capability))
  return [...new Set(wanted)].filter((c) => !guided.has(c))
}
