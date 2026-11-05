// The inspection program as a map overlay layer (spec 0471 FR-5, spec 0448 FR-11): one point per
// building, its style the placard posted (ok = INSPECTED, watch = RESTRICTED USE, critical =
// UNSAFE) with the posting time as the start of the feature's time range, so the map's time
// slider shows the program filling in. A building with no placard yet is muted and visible
// throughout. The label always carries the placard words; colors come from the style tokens
// that also carry a pattern, so color is never the only cue.
import { OverlayLayer, type OverlayToken } from '@shared/schemas/map-overlays'
import {
  PLACARD_STYLE,
  PRIORITY_LABEL,
  type PlacardState,
} from '../../render/figures/structures/common'
import type { SimBuilding } from './damage-sim'

export interface PostedPlacard {
  placard: PlacardState
  /** When it was posted (ISO); absent for a building not yet evaluated. */
  postedAt?: string
}

const TOKEN: Record<PlacardState, OverlayToken> = {
  INSPECTED: 'ok',
  'RESTRICTED USE': 'watch',
  UNSAFE: 'critical',
  'NOT YET EVALUATED': 'muted',
}

export function inspectionOverlay(
  buildings: readonly Pick<SimBuilding, 'id' | 'name' | 'lon' | 'lat' | 'priority'>[],
  posted: Readonly<Record<string, PostedPlacard>>,
): OverlayLayer {
  return OverlayLayer.parse({
    kind: 'point',
    id: 'inspection-placards',
    title: 'Building placards',
    legend: {
      label: 'Placard posted',
      note: 'INSPECTED, RESTRICTED USE or UNSAFE as of the map time; gray buildings are not yet evaluated.',
    },
    visible: true,
    opacity: 0.9,
    source: 'Simulated building list',
    features: buildings.map((b) => {
      const p = posted[b.id] ?? { placard: 'NOT YET EVALUATED' as const }
      return {
        id: b.id,
        label: `${b.id} ${p.placard}`,
        detail: `${b.name}. ${PRIORITY_LABEL[b.priority]}. ${p.placard} (${PLACARD_STYLE[p.placard].colorWord})${p.postedAt ? ` posted ${p.postedAt}` : ''}.`,
        style: TOKEN[p.placard],
        legendLabel: p.placard,
        at: [b.lon, b.lat],
        ...(p.postedAt ? { time: { start: p.postedAt } } : {}),
      }
    }),
  })
}
