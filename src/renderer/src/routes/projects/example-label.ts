// Labels for example gallery cards (#266): built-in and pack examples side by side. A pack
// example shows a ProvenanceBadge (#269) and its pack's license.
import type { ExampleInfo } from '@shared/ipc'
import type { Provenance } from '../../lib/provenance'

/** A built-in and a pack example may share a slug; this tells them apart. */
export const exampleKey = (e: Pick<ExampleInfo, 'slug' | 'packId'>): string =>
  e.packId ? `${e.packId}/${e.slug}` : e.slug

/** Badge data for an example of an enabled pack; undefined for a built-in one. */
export function exampleProvenance(
  e: Pick<ExampleInfo, 'packId' | 'packName' | 'packVersion'> &
    Pick<Partial<ExampleInfo>, 'bundled'>,
): Provenance | undefined {
  if (!e.packId) return undefined
  return {
    origin: 'pack',
    ...(e.bundled ? { bundled: true } : {}),
    packId: e.packId,
    ...(e.packName ? { packName: e.packName } : {}),
    ...(e.packVersion ? { version: e.packVersion } : {}),
  }
}
