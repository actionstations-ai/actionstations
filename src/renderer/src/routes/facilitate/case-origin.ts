import type { CaseManifest } from '@shared/schemas/case-data'

/** "Historical data", "Simulated data" or "Historical and simulated data". */
export function originWords(manifest: Pick<CaseManifest, 'datasets'>): string {
  const origins = new Set(manifest.datasets.map((d) => d.provenance.origin))
  if (origins.has('historical') && origins.has('simulated')) return 'Historical and simulated data'
  return origins.has('simulated') ? 'Simulated data' : 'Historical data'
}
