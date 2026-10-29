// The bundled US county list for the location picker (spec 0439 FR-1). Offline: no geocoding
// service is called. Rows come from the Census Gazetteer (see data/README.md).
import rows from './data/us-counties.json'

export interface CountyMatch {
  label: string
  stateFips: string
  countyFips: string
  lat: number
  lon: number
}

type Row = [name: string, state: string, fips: string, lat: number, lon: number]
const COUNTIES = rows as Row[]
export const MAX_MATCHES = 20

const toMatch = ([name, state, fips, lat, lon]: Row): CountyMatch => ({
  label: `${name}, ${state}`,
  stateFips: fips.slice(0, 2),
  countyFips: fips.slice(2),
  lat,
  lon,
})

/** Counties whose "Name, ST" text contains every word of `query`, prefix matches first. */
export function searchCounties(query: string): CountyMatch[] {
  const words = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
  if (!words.length) return []
  const scored: { row: Row; rank: number }[] = []
  for (const row of COUNTIES) {
    const text = `${row[0]}, ${row[1]}`.toLowerCase()
    if (!words.every((w) => text.includes(w))) continue
    scored.push({ row, rank: text.startsWith(words[0]!) ? 0 : 1 })
  }
  scored.sort((a, b) => a.rank - b.rank || a.row[0].localeCompare(b.row[0]))
  return scored.slice(0, MAX_MATCHES).map((s) => toMatch(s.row))
}

export const countyCount = (): number => COUNTIES.length
