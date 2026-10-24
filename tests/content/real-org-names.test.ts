// Released content (templates, examples, prompts, domain profiles) and the generation fixtures
// simulate the exercising organization and its people, airlines, private businesses (local
// media, sports teams and venues, regional utilities, national consumer brands in the facility,
// cargo carriers, banks) and the street addresses of real properties (#278, #283, #335). Real
// cities, counties, regions and geography stay real, and so do city and county agencies as
// outside parties (Akron Fire Department, Summit County EMS), airports run by local government
// as outside parties (Cleveland Hopkins), products and vendors, sector organizations (ISACs,
// mutual-aid networks, the Red Cross), federal and state agencies and real threat groups.
// examples/simulated-names.json maps the simulated ones for the example builds. Matching is
// case-sensitive on whole words so CSS/HTML identifiers such as `delta` pass.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SCANNED = [
  'templates',
  'examples',
  'prompts',
  'src/shared/domains',
  'packs/domains',
  'packs/readmes',
  'tests/fixtures/injects',
  'tests/fixtures/generate',
  'tests/fixtures/scenarios',
]
const TEXT = new Set(['.json', '.md', '.html', '.ts', '.txt'])
/** The map itself names what it replaces. */
const SKIP = new Set(['examples/simulated-names.json'])

const DENY: RegExp[] = [
  // Airlines (names, upper-case FIDS spellings, flight codes and look-alike domains)
  /\b(Delta|DELTA|United Airlines|UNITED|American Airlines|AMERICAN|SkyWest)\b/,
  /\b(Southwest Airlines|SOUTHWEST|JetBlue|JETBLUE|Air Canada|AIR CANADA|Spirit Airlines)\b/,
  /\b(DL|UA) \d{2,4}\b/,
  /\bdelta(-airlines[\w-]*)?\.(com|net)\b/,
  // Street addresses of real properties (5300 Riverside Drive, Cleveland, Ohio 44135 is
  // Cleveland Hopkins; the exercised airport must not sit at its address or ZIP)
  /\b5300 Riverside Drive\b/,
  /\bOhio 44135\b/,
  // Local media, teams and venues
  /\b(Browns|browns|Steelers|Raiders|Huntington Bank)\b/,
  /\b(Plain Dealer|Beacon Journal|Fox 8|WKYC|WEWS)\b/,
  // Regional utilities, national consumer brands and cargo carriers
  /\b(Dominion Energy|FirstEnergy|Starbucks|Hudson News|FedEx|Coke|Pepsi|Coca-Cola|PepsiCo)\b/,
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return TEXT.has(extname(name)) && !SKIP.has(relative(ROOT, path)) ? [path] : []
  })
}

function hits(path: string): string[] {
  // JSON escapes count as breaks, so "\nDelta" inside a JSON string is still caught.
  return readFileSync(path, 'utf8')
    .replace(/\\[ntr]/g, ' ')
    .split('\n')
    .flatMap((line, i) =>
      DENY.flatMap((re) => {
        const m = re.exec(line)
        return m ? [`${relative(ROOT, path)}:${i + 1} ${m[0]}`] : []
      }),
    )
}

describe('simulated names in released content', () => {
  it.each(SCANNED)('none of the simulated-only names in %s', (dir) => {
    expect(files(join(ROOT, dir)).flatMap(hits)).toEqual([])
  })

  it('the deny-list catches what it is meant to', () => {
    const caught = [
      'Delta Air Lines',
      'UA 2401',
      '5300 Riverside Drive',
      'Cleveland, Ohio 44135',
      'Free Browns Tickets',
      'Akron Beacon Journal',
      'Starbucks line',
      'The Coke machines',
    ]
    for (const s of caught) expect(DENY.some((re) => re.test(s))).toBe(true)
  })

  it('leaves real places, agencies, products, sector organizations and threat groups alone', () => {
    const kept = [
      'Cleveland',
      'Akron Fire Department',
      'Summit County EMS',
      '#Cleveland',
      'diverted to Cleveland Hopkins International',
      'TSA FSD',
      'FBI Cleveland Field Office, Cyber Squad',
      'FBI Cleveland (Cyber)',
      '| FBI | Cleveland-area field office |',
      '1501 Lakeside Avenue, Cleveland, Ohio 44114',
      'Lenel OnGuard on a Cisco 2960',
      'the WaterISAC portal',
      'AT&T fiber',
      'the ISIS rumor',
      '.delta { }',
      'Skyline Air',
    ]
    for (const s of kept) expect(DENY.some((re) => re.test(s))).toBe(false)
  })
})
