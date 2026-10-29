// Adds an imported infrastructure layer to the active snapshot, or starts a snapshot that holds
// only that layer (spec 0439 FR-10). The file is read on this computer; nothing is sent.
import type { HazardSnapshot, ProjectLocation } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { importLayerFile } from './sources/infrastructure'
import { activeSnapshot, readIndex, rewriteSnapshot, saveNewSnapshot } from './store'
import { assertRoom } from './store'

const MAX_LAYERS = 20

function emptySnapshot(where: ProjectLocation): HazardSnapshot {
  return {
    id: newId(),
    label: '',
    pinned: false,
    fetchedAt: nowIso(),
    request: {
      lat: Number(where.lat.toFixed(2)),
      lon: Number(where.lon.toFixed(2)),
      precision: where.sendPrecision,
    },
    sources: [],
    alerts: [],
    forecast: [],
    earthquakes: { recent: [], historical: [] },
    declarations: [],
    infrastructure: [],
  }
}

export interface LayerInput {
  file: string
  layer: string
  source: string
  radiusKm: number
}

export async function importLayer(
  root: string,
  where: ProjectLocation,
  input: LayerInput,
): Promise<HazardSnapshot> {
  const layer = await importLayerFile(input.file, where, input)
  const existing = await activeSnapshot(root)
  if (!existing) assertRoom(await readIndex(root))
  const snapshot = existing ?? emptySnapshot(where)
  const others = snapshot.infrastructure.filter((l) => l.layer !== layer.layer)
  if (others.length >= MAX_LAYERS)
    throw new AppError('VALIDATION', 'A snapshot holds up to 20 layers')
  snapshot.infrastructure = [...others, layer]
  const at = nowIso()
  snapshot.sources = [
    ...snapshot.sources.filter(
      (s) => !(s.id === 'infrastructure' && s.attribution === layer.source),
    ),
    {
      id: 'infrastructure',
      status: layer.features.length ? 'ok' : 'empty',
      attribution: layer.source || `Imported layer: ${layer.layer}`,
      accessedAt: at,
    },
  ]
  if (existing) await rewriteSnapshot(root, snapshot)
  else await saveNewSnapshot(root, snapshot)
  return snapshot
}
