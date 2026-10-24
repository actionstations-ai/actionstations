// Labels for example gallery cards (#266): built-in and pack examples side by side.
import type { ExampleInfo } from '@shared/ipc'

/** A built-in and a pack example may share a slug; this tells them apart. */
export const exampleKey = (e: Pick<ExampleInfo, 'slug' | 'packId'>): string =>
  e.packId ? `${e.packId}/${e.slug}` : e.slug

/** "From the Freight Rail Operations pack (1.0.0) · License CC-BY-4.0", or null for a built-in. */
export function packLabel(e: ExampleInfo): string | null {
  if (!e.packId) return null
  const name = e.packName ?? e.packId
  const version = e.packVersion ? ` (${e.packVersion})` : ''
  const license = e.packLicense ? ` · License ${e.packLicense}` : ''
  return `From the ${name} pack${version}${license}`
}
