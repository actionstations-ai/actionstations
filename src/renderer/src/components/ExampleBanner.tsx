// Notice shown inside a project opened from an example (#169): the example's own banner text
// from the `.example.json` marker copied into the project. Ordinary projects show nothing.
// An example from a pack (#266) also shows a ProvenanceBadge (#269): the pack it was copied
// from, and whether that pack is gone or has a newer version.
import { Info } from 'lucide-react'
import type { ExampleMarkerView } from '@shared/ipc'
import { useIpcQuery } from '../lib/query'
import type { Provenance } from '../lib/provenance'
import { ProvenanceBadge } from './ProvenanceBadge'
import './domain.css'

/** The example project is the user's copy of the pack example. */
function markerProvenance(m: ExampleMarkerView, packId: string): Provenance {
  return {
    origin: 'copy',
    packId,
    ...(m.packName ? { packName: m.packName } : {}),
    ...(m.packVersion ? { version: m.packVersion } : {}),
    ...(m.packState ?? {}),
  }
}

export function ExampleBanner({ projectPath }: { projectPath: string }) {
  const marker = useIpcQuery('examples:marker', { projectPath }, { enabled: !!projectPath })
  const m = marker.data
  if (!m) return null
  return (
    <aside className="example-banner" aria-label="Example project" data-testid="example-banner">
      <Info size={16} aria-hidden />
      <p>
        <strong>Example: {m.title}.</strong> {m.notice}
        {m.packId && (
          <>
            {' '}
            <ProvenanceBadge provenance={markerProvenance(m, m.packId)} />
          </>
        )}
      </p>
    </aside>
  )
}
