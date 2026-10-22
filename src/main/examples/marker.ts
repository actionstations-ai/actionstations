// The `.example.json` marker inside a project opened from an example (#169).
import { join } from 'node:path'
import { ExampleMarker } from '@shared/ipc/examples'
import { exists, readJson } from '../lib/fs'
import { MARKER_FILE } from './open'

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
