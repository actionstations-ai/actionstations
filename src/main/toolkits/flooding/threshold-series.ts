// The stage-threshold crossing helper (spec 0454 FR-13): turn one gauge's stage series into the
// per-zone series the threshold timing metric scores. Each zone (a road, a crossing, an area, a
// facility) floods at its own stage, so the series for a zone is the stage in feet above that
// stage; the metric's threshold is then 0 for every zone, and the crossing is the moment the
// water reaches the zone. The flooding toolkit's metric configurations assume this form.
import type { ModeledSeries } from '@shared/schemas/metrics'

export interface FloodZone {
  /** The road, crossing, area or facility, as decisions name it. */
  name: string
  /** Stage in feet at the gauge at which the zone floods. */
  floodsAtStage: number
}

export interface StagePoint {
  t: string
  v: number
}

export const ZONE_QUANTITY = 'feet above the stage that floods the zone'

export function zoneSeries(
  stage: readonly StagePoint[],
  zones: readonly FloodZone[],
): ModeledSeries[] {
  return zones.map((z) => ({
    zone: z.name,
    quantity: ZONE_QUANTITY,
    points: stage.map((p) => ({
      time: p.t,
      value: Math.round((p.v - z.floodsAtStage) * 100) / 100,
    })),
  }))
}
