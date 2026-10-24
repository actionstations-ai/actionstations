// The deterministic .aspack zip (#271), shared by Export as pack (export.ts) and the reference
// library packs (documents/library-build.ts, #325): entries sorted by path (code units), one
// fixed timestamp, regular-file mode 0644, deflate, no folder entries, so the same content
// always gives the same sha256. No Electron imports, so plain-Node scripts can bundle it.
import JSZip from 'jszip'
import { compareSemver } from '@shared/schemas/pack'

/** Packs need the app's pack support (0.3.0); a pack never asks for less, even from a dev build. */
export const PACKS_SINCE_VERSION = '0.3.0'
export const packMinAppVersion = (appVersion: string): string =>
  compareSemver(appVersion, PACKS_SINCE_VERSION) < 0 ? PACKS_SINCE_VERSION : appVersion

/** One fixed timestamp for every entry (DOS time has no zone; jszip writes UTC fields). */
export const EXPORT_ZIP_DATE = new Date('2000-01-01T00:00:00Z')
const FILE_MODE = 0o100644

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The deterministic zip: sorted entries, fixed date and mode, deflate. */
export async function zipTree(entries: ReadonlyMap<string, Buffer>): Promise<Buffer> {
  const zip = new JSZip()
  for (const name of [...entries.keys()].sort(byPath))
    zip.file(name, entries.get(name)!, {
      date: EXPORT_ZIP_DATE,
      createFolders: false,
      unixPermissions: FILE_MODE,
    })
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
  })
}
