// Builds src/main/hazards/data/us-counties.json from the US Census Gazetteer counties file (#439).
// Usage: node scripts/build-gazetteer.mjs <2024_Gaz_counties_national.txt>
// Each row is [name, state abbreviation, 5-digit FIPS, internal point latitude, longitude].
import { readFileSync, writeFileSync } from 'node:fs'

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/build-gazetteer.mjs <Gaz_counties_national.txt>')
  process.exit(1)
}
const lines = readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean)
const header = lines[0].split('\t').map((h) => h.trim())
const cols = ['USPS', 'GEOID', 'NAME', 'INTPTLAT', 'INTPTLONG'].map((n) => header.indexOf(n))
if (cols.some((i) => i < 0)) throw new Error('Unexpected columns in the gazetteer file')
const rows = lines.slice(1).map((line) => {
  const f = line.split('\t').map((v) => v.trim())
  const [usps, geoid, name, lat, lon] = cols.map((i) => f[i])
  return [name, usps, geoid, Number(lat), Number(lon)]
})
writeFileSync(
  new URL('../src/main/hazards/data/us-counties.json', import.meta.url),
  JSON.stringify(rows) + '\n',
)
console.log(`${rows.length} counties`)
