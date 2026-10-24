// The `.example.json` marker inside a project opened from an example (#169).
import { join } from 'node:path'
import { ExampleMarker, type ExampleMarkerView } from '@shared/ipc/examples'
import { compareSemver } from '@shared/schemas/pack'
import { exists, readJson } from '../lib/fs'
import { MARKER_FILE } from './open'
import { bundledPackById, packById } from '../packs/layers'

/** The marker of a project root, or null when it is not an example copy or the file is bad. */
export async function readMarker(root: string): Promise<ExampleMarker | null> {
  const path = join(root, MARKER_FILE)
  if (!(await exists(path))) return null
  try {
    return await readJson(path, ExampleMarker)
  } catch (err) {
    console.warn(`[examples] ignoring unreadable ${MARKER_FILE}:`, err)
    return null
  }
}

/**
 * The marker with its pack's state (#269): not installed when no enabled pack of that id still
 * has the example, update available when the installed pack is newer than the copied version.
 */
export function markerView(marker: ExampleMarker): ExampleMarkerView {
  if (!marker.packId) return marker
  // A bundled pack the user disabled still ships the example (ADR-0020): not "not installed".
  const pack = packById(marker.packId) ?? bundledPackById(marker.packId)
  const provides = pack?.manifest.contents.examples.includes(marker.slug) ? pack : undefined
  return {
    ...marker,
    ...(pack?.bundled ? { bundled: true } : {}),
    packState: {
      packMissing: !provides,
      // A bundled pack updates with the app; its examples are never "out of date".
      updateAvailable:
        !!provides &&
        !provides.bundled &&
        !!marker.packVersion &&
        compareSemver(provides.version, marker.packVersion) > 0,
      ...(provides ? { installedVersion: provides.version } : {}),
    },
  }
}
