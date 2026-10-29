// The compact `hazards` text for the ideate and scenario_overview prompts (spec 0439 FR-16).
// Pure and token-capped (about 1,500 tokens, counted as 4 characters each). It carries facts and
// dates only: no exact coordinates, and angle brackets are removed so a value from outside can
// never close the data block the prompt wraps it in.
import type { HazardSnapshot, Quake } from '@shared/schemas'

export const SUMMARY_MAX_CHARS = 6000

const clean = (s: string): string => s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
const day = (iso: string): string => iso.slice(0, 10)
const year = (iso: string): string => iso.slice(0, 4)

/** Declarations counted by incident type, most frequent first. */
export function declarationCounts(s: HazardSnapshot): { type: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const d of s.declarations) counts.set(d.incidentType, (counts.get(d.incidentType) ?? 0) + 1)
  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
}

const largest = (quakes: Quake[]): Quake | undefined =>
  quakes.reduce<Quake | undefined>((best, q) => (!best || q.mag > best.mag ? q : best), undefined)

function quakeLine(label: string, quakes: Quake[]): string | undefined {
  const top = largest(quakes)
  if (!top) return undefined
  return `${label}: ${quakes.length}; largest M${top.mag} ${clean(top.place)}, ${day(top.time)}`
}

/** One section per source, each cut to `n` list items. */
function sections(s: HazardSnapshot, n: number): string[] {
  const out: string[] = []
  if (s.alerts.length)
    out.push(
      `Active weather alerts (${s.alerts.length}):\n` +
        s.alerts
          .slice(0, n)
          .map(
            (a) =>
              `- ${clean(a.event)} (${clean(a.severity)}): ${clean(a.headline)}` +
              (a.effective
                ? ` [${day(a.effective)}${a.expires ? ` to ${day(a.expires)}` : ''}]`
                : ''),
          )
          .join('\n'),
    )
  if (s.forecast.length)
    out.push(
      'Forecast:\n' +
        s.forecast
          .slice(0, n)
          .map(
            (f) =>
              `- ${clean(f.name)}: ${clean(f.shortForecast)}` +
              (f.temperature !== undefined ? `, ${f.temperature}${f.unit ?? ''}` : '') +
              (f.windSpeed ? `, wind ${clean(f.windSpeed)}` : ''),
          )
          .join('\n'),
    )
  const quakes = [
    quakeLine('Earthquakes in the past 30 days', s.earthquakes.recent),
    quakeLine('Larger earthquakes since 1975', s.earthquakes.historical),
  ].filter((x): x is string => !!x)
  if (quakes.length) out.push(quakes.join('\n'))
  if (s.fires)
    out.push(
      `Fire detections in the last ${s.fires.days} day(s) within about 50 km: ${s.fires.count}` +
        (s.fires.nearestKm !== undefined ? `; nearest ${s.fires.nearestKm} km away` : ''),
    )
  if (s.declarations.length) {
    const counts = declarationCounts(s)
      .slice(0, n)
      .map((c) => `${c.type} ${c.count}`)
      .join(', ')
    const recent = s.declarations
      .slice(0, 3)
      .map(
        (d) => `${clean(d.declarationTitle) || clean(d.incidentType)} (${year(d.declarationDate)})`,
      )
    out.push(
      `Past federal disaster declarations (${s.declarations.length}): ${counts}\nMost recent: ${recent.join('; ')}`,
    )
  }
  for (const layer of s.infrastructure) {
    const names = layer.features
      .slice(0, 3)
      .map((f) => `${clean(f.name)} (${f.distanceKm} km)`)
      .join('; ')
    out.push(
      `Infrastructure, ${clean(layer.layer)}: ${layer.features.length} nearby; nearest: ${names}`,
    )
  }
  return out
}

/** The block for the prompt, or '' when the snapshot holds nothing worth sending. */
export function hazardSummary(s: HazardSnapshot, maxChars = SUMMARY_MAX_CHARS): string {
  const head = `Public hazard data for the organization's area, fetched ${day(s.fetchedAt)}. It may be out of date.`
  for (const n of [10, 6, 3, 1]) {
    const body = sections(s, n)
    if (!body.length) return ''
    const text = [head, ...body].join('\n')
    if (text.length <= maxChars) return text
  }
  return [head, ...sections(s, 1)].join('\n').slice(0, maxChars)
}

/** "Hazard context: snapshot of 2026-10-29 (NWS, USGS, OpenFEMA)" for the scenario's provenance. */
export function provenanceLine(s: HazardSnapshot): string {
  const names = new Set<string>()
  for (const r of s.sources) {
    if (r.status !== 'ok') continue
    if (r.id.startsWith('nws')) names.add('NWS')
    else if (r.id.startsWith('usgs')) names.add('USGS')
    else if (r.id === 'firms') names.add('NASA FIRMS')
    else if (r.id === 'openfema') names.add('OpenFEMA')
    else names.add('imported layers')
  }
  return `Hazard context: snapshot of ${day(s.fetchedAt)}${names.size ? ` (${[...names].join(', ')})` : ''}`
}
