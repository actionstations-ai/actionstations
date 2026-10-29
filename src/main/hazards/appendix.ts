// The "Hazard data sources" appendix of the controller handbook (spec 0439 FR-19): the sources
// a scenario's hazard snapshot came from, with the attribution each one's terms require. The
// OpenFEMA statement is printed exactly as its terms give it, with the access date.
import type { HazardSnapshot } from '@shared/schemas'
import { OPENFEMA_STATEMENT, USGS_CREDIT } from '@shared/schemas/hazards'
import { provenanceLine } from './summary'

export const HAZARD_APPENDIX_HEADING = 'Hazard data sources'

/** Markdown for the appendix, or '' when no source returned data. */
export function hazardAppendix(s: HazardSnapshot): string {
  const used = s.sources.filter((r) => r.status === 'ok' || r.status === 'empty')
  if (!used.length) return ''
  const lines = new Set<string>()
  for (const r of used) {
    const date = r.accessedAt.slice(0, 10)
    if (r.id === 'openfema')
      lines.add(
        `${OPENFEMA_STATEMENT} Endpoint: DisasterDeclarationsSummaries v2 (www.fema.gov/api/open/v2). Accessed ${date}.`,
      )
    else if (r.id.startsWith('usgs'))
      lines.add(`${USGS_CREDIT}. Earthquake Hazards Program event service. Accessed ${date}.`)
    else if (r.id.startsWith('nws'))
      lines.add(`National Weather Service (weather.gov), open data. Accessed ${date}.`)
    else if (r.id === 'firms')
      lines.add(`NASA FIRMS, VIIRS SNPP near-real-time active fire detections. Accessed ${date}.`)
    else lines.add(`Imported layer: ${r.attribution}. Read on ${date}.`)
  }
  return [
    `## ${HAZARD_APPENDIX_HEADING}`,
    '',
    `${provenanceLine(s)}. This is a dated snapshot used to design the exercise. It is not a warning and must not be used for operational decisions.`,
    '',
    ...[...lines].map((l) => `- ${l}`),
  ].join('\n')
}
