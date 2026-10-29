// OpenFEMA disaster declarations (www.fema.gov). The $filter is built only from two- and
// three-digit FIPS strings that pass a regex, so no user text reaches the query (OData injection).
import type { HazardSnapshot } from '@shared/schemas'
import type { HazardGet } from '../http'
import type { SourceOutcome } from './nws'
import { clip, isRecord, num, parseJson } from './util'

const BASE = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries'
const TOP = 200

export function declarationsUrl(stateFips: string, countyFips?: string): string {
  if (!/^\d{2}$/.test(stateFips)) throw new Error('State FIPS must be two digits')
  if (countyFips !== undefined && !/^\d{3}$/.test(countyFips))
    throw new Error('County FIPS must be three digits')
  const filter =
    `fipsStateCode eq '${stateFips}'` + (countyFips ? ` and fipsCountyCode eq '${countyFips}'` : '')
  const q = [
    `$filter=${encodeURIComponent(filter)}`,
    `$orderby=${encodeURIComponent('declarationDate desc')}`,
    `$top=${TOP}`,
  ]
  return `${BASE}?${q.join('&')}`
}

/** Declarations newest first, one per disaster number (a disaster lists one row per program). */
export function parseDeclarations(text: string): HazardSnapshot['declarations'] {
  const root = parseJson(text, 'OpenFEMA')
  const rows =
    isRecord(root) && Array.isArray(root.DisasterDeclarationsSummaries)
      ? root.DisasterDeclarationsSummaries
      : []
  const seen = new Set<number>()
  const out: HazardSnapshot['declarations'] = []
  for (const r of rows) {
    if (!isRecord(r)) continue
    const disasterNumber = num(r.disasterNumber)
    if (disasterNumber === undefined || seen.has(disasterNumber)) continue
    seen.add(disasterNumber)
    out.push({
      disasterNumber: Math.trunc(disasterNumber),
      declarationType: clip(r.declarationType, 10),
      declarationDate: clip(r.declarationDate, 40),
      incidentType: clip(r.incidentType, 60) || 'Other',
      declarationTitle: clip(r.declarationTitle, 200),
      designatedArea: clip(r.designatedArea, 120),
    })
    if (out.length >= TOP) break
  }
  return out
}

export async function fetchDeclarations(
  get: HazardGet,
  stateFips: string,
  countyFips: string | undefined,
  signal?: AbortSignal,
): Promise<SourceOutcome> {
  const url = declarationsUrl(stateFips, countyFips)
  const declarations = parseDeclarations((await get(url, signal)).text)
  return { url, count: declarations.length, patch: { declarations } }
}
