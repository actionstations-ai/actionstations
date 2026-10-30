// maps:snapshot (#500, spec 0436 §5): a PNG of a site plan with numbered markers for the places
// whose rows the audience may see, drawn with the `map_annotation` inject template so every label
// is exact text. Exports, devices and the update hook read the file from `.cache/maps/`.
// Geographic maps need a rendered basemap and are not drawn yet.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { PinAudience, Pin } from '@shared/maps/pins'
import { isPercentPosition, pinsFor } from '@shared/maps/pins'
import type { Place } from '@shared/schemas'
import { readFacilitatorState } from '../facilitator/state'
import { AppError } from '../lib/errors'
import { ensureDir, safeJoin, safeJoinReal } from '../lib/fs'
import { composeDocument } from '../render/compose'
import { renderPng } from '../render/window'
import { getScenario } from '../scenario/store'
import { readProjectMaps } from './project'

export const SNAPSHOT_DIR = '.cache/maps'
/** The map_annotation template draws at most this many markers. */
export const MAX_SNAPSHOT_MARKERS = 12

export interface SnapshotRequest {
  scenarioId: string
  mapId: string
  /** `room` and `device` show delivered rows only; `facilitator` also shows upcoming ones. */
  audience: PinAudience
}

const KIND: Record<Place['kind'], 'incident' | 'staging' | 'command' | 'info'> = {
  incident: 'incident',
  staging: 'staging',
  command: 'command',
  asset: 'info',
  public: 'info',
  other: 'info',
}

/** Template markers for the pins that sit on a site plan, in pin order, at most twelve. */
export function snapshotMarkers(pins: Pin[]) {
  return pins.flatMap((pin) => {
    const at = pin.position
    if (!isPercentPosition(at)) return []
    return [
      {
        x: at.x,
        y: at.y,
        label: pin.label,
        detail: pin.rows.map((r) => r.rowId).join(', '),
        kind: KIND[pin.kind],
      },
    ]
  })
}

/** The file name for a snapshot: the same pins on the same plan give the same file. */
export const snapshotName = (parts: unknown): string =>
  `${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)}.png`

/** Draw the map and return its project-relative path under `.cache/maps/`. */
export async function snapshotMap(root: string, req: SnapshotRequest): Promise<{ path: string }> {
  const { maps } = await readProjectMaps(root)
  const layer = maps.maps.find((m) => m.id === req.mapId)
  if (!layer) throw new AppError('NOT_FOUND', 'That map is gone')
  if (layer.kind !== 'site_plan')
    throw new AppError('VALIDATION', 'A picture of a geographic map is not available yet')
  const [scenario, state] = await Promise.all([
    getScenario(root, req.scenarioId),
    readFacilitatorState(root, req.scenarioId),
  ])
  const pins = pinsFor({
    rows: scenario.msel.map((r) => ({ id: r.id, time: r.time, placeIds: r.placeIds })),
    delivered: state.delivered,
    elapsedMin: -1,
    places: maps.places,
    mapId: layer.id,
    audience: req.audience,
    showUpcoming: req.audience === 'facilitator',
  })
  const markers = snapshotMarkers(pins).slice(0, MAX_SNAPSHOT_MARKERS)
  const name = snapshotName({ layer: layer.image, title: layer.title, markers })
  const rel = `${SNAPSHOT_DIR}/${name}`
  const file = safeJoin(root, rel)
  if (
    await fs.stat(file).then(
      (s) => s.isFile(),
      () => false,
    )
  )
    return { path: rel }
  if (!markers.length) throw new AppError('VALIDATION', 'No places to show on this map yet')
  const plan = safeJoinReal(root, layer.image)
  const doc = composeDocument({
    type: 'map_annotation',
    fields: { title: layer.title, markers },
    assets: { baseMap: plan },
    projectRoot: root,
    title: layer.title,
  })
  const { png } = await renderPng(doc, 1)
  await ensureDir(safeJoin(root, SNAPSHOT_DIR))
  await fs.writeFile(file, png)
  return { path: rel }
}
