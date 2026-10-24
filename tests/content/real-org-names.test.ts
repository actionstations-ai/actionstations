// Content shipped as templates (schema examples, previews) and the generation fixtures uses
// simulated organizations only (#278). Generic government roles the domain profiles treat as
// roles (TSA, FAA, FBI, CISA) are allowed; named real companies, outlets, teams, groups, specific
// field offices and real street addresses are not. Matching is case-sensitive on whole words so
// CSS/HTML identifiers such as `delta` are not caught.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SCANNED = [
  'templates',
  'tests/fixtures/injects',
  'tests/fixtures/generate',
  'tests/fixtures/scenarios',
]
const TEXT = new Set(['.json', '.md', '.html', '.ts', '.txt'])

const DENY: RegExp[] = [
  // Airlines (names, upper-case FIDS spellings and look-alike domains)
  /\b(Delta|DELTA|United Airlines|UNITED|American Airlines|AMERICAN|SkyWest)\b/,
  /\b(Southwest Airlines|SOUTHWEST|JetBlue|JETBLUE|Air Canada|AIR CANADA|Spirit Airlines)\b/,
  /\bdelta(-airlines[\w-]*)?\.(com|net)\b/,
  // Cleveland/Akron-area organizations and places named in the CSAAP source
  /\b(Cleveland|CLEVELAND|cleveland|Akron|Hopkins)\b/,
  /\b(Browns|browns|Steelers|Huntington Bank)\b/,
  /\b(Plain Dealer|Beacon Journal|Fox 8|WKYC|WEWS)\b/,
  /\b(1501 Lakeside Avenue|5300 Riverside Drive)\b/,
  // Real extremist organizations
  /\b(ISIS|ISIL|al-Qaeda|Al Qaeda)\b/,
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return TEXT.has(extname(name)) ? [path] : []
  })
}

function hits(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((line, i) =>
      DENY.flatMap((re) => {
        const m = re.exec(line)
        return m ? [`${relative(ROOT, path)}:${i + 1} ${m[0]}`] : []
      }),
    )
}

describe('real organization names', () => {
  it.each(SCANNED)('none in %s', (dir) => {
    expect(files(join(ROOT, dir)).flatMap(hits)).toEqual([])
  })

  it('the deny-list catches what it is meant to', () => {
    const sample = ['Delta Air Lines', 'FBI Cleveland', 'Free Browns Tickets', 'ISIS rumor']
    for (const s of sample) expect(DENY.some((re) => re.test(s))).toBe(true)
    for (const s of ['TSA FSD', 'FBI field office', '.delta { }', 'Skyline Air']) {
      expect(DENY.some((re) => re.test(s))).toBe(false)
    }
  })
})
