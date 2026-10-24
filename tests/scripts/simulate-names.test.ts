// examples/simulated-names.json (#283, #335): released examples simulate the exercising
// organization, airlines, private businesses (media, teams, venues, utilities, brands,
// carriers) and real street addresses; real places, city and county agencies, vendors, sector
// organizations, federal and state agencies and threat groups stay real.
// make-example applies the map to documents and seeds on the way in.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAMES_FILE, simulateFiles, simulateNames } from '../../scripts/simulate-names.mjs'
import { seedMarkdown, simulatedCopies } from '../../scripts/make-example.mjs'

describe('simulateNames', () => {
  it.each([
    ['Hey Ops, this is Delta at Gate B4.', 'Hey Ops, this is Skyline at Gate B4.'],
    ['"airline": "DELTA", "flight": "DL 301"', '"airline": "SKYLINE", "flight": "SX 301"'],
    ['United Airlines Cargo Facility (Bldg 4)', 'HWK Air Cargo Facility (Bldg 4)'],
    ['Delta, United, and American flights', 'Skyline, HWK Air, and Lakeshore flights'],
    ['5300 Riverside Drive · Cleveland, Ohio 44135', '5400 Airport Parkway · Akron, Ohio 44312'],
    ['Free Browns Tickets', 'Free Ironclads Tickets'],
    ['The Starbucks line', 'The Harbor Coffee line'],
    ['Primary: FirstEnergy', 'Primary: Northcoast Electric'],
  ])('%s', (input, expected) => {
    expect(simulateNames(input)).toBe(expected)
  })

  it.each([
    'FAA Advisory Circular AC 150/5200-31C',
    'the United States Coast Guard',
    'Americans with Disabilities Act',
    'TSA, FAA, FBI, CISA and the Ohio EPA',
    '.delta { color: red }',
    'UPS battery backup',
    'FBI Cleveland Field Office, Cyber Squad',
    '| FBI | Cleveland-area field office |',
    '1501 Lakeside Avenue, Cleveland, Ohio 44114',
    'PACS: Lenel OnGuard 7.5 on a Cisco 2960',
    'the WaterISAC portal and OHWARN',
    'She said ISIS has taken over',
    'American Red Cross',
    'Akron Fire Department (AFD)',
    'Summit County EMS',
    '#NCIA #Cleveland',
    'diverted to Cleveland Hopkins International',
    'Akron-Canton Travelers',
    '35 miles south of Cleveland',
    'CISA advisory AA22-103A and AA25-239A',
  ])('leaves "%s" alone', (text) => {
    expect(simulateNames(text)).toBe(text)
  })

  it('treats JSON escapes as word breaks', () => {
    expect(simulateNames('"James Morrison\\nVP\\nDelta Regional\\n(330) 555-7700"')).toBe(
      '"James Morrison\\nVP\\nSkyline Regional\\n(330) 555-7700"',
    )
  })

  it('is idempotent', () => {
    const once = simulateNames('Delta and United at Akron; #Cleveland; Starbucks; DL 666; AA 12')
    expect(simulateNames(once)).toBe(once)
  })
})

describe('applying the map to files', () => {
  it('rewrites text files in place and reports the changed ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'names-'))
    writeFileSync(join(dir, 'a.md'), 'Delta at Gate B4')
    writeFileSync(join(dir, 'b.json'), '{"x":"no names"}')
    writeFileSync(join(dir, 'c.png'), 'Delta')
    expect(simulateFiles([dir]).map((f) => f.split('/').pop())).toEqual(['a.md'])
    expect(readFileSync(join(dir, 'a.md'), 'utf8')).toBe('Skyline at Gate B4')
    expect(readFileSync(join(dir, 'c.png'), 'utf8')).toBe('Delta')
  })

  it('never rewrites the names map itself', () => {
    const before = readFileSync(NAMES_FILE, 'utf8')
    expect(simulateFiles([NAMES_FILE])).toEqual([])
    expect(readFileSync(NAMES_FILE, 'utf8')).toBe(before)
  })

  it('make-example imports simulated copies and seeds simulated markdown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'names-'))
    const source = join(dir, 'plan.md')
    writeFileSync(source, 'Mutual aid: City of Akron Fire Dept.; ramp: Delta')
    const copy = simulatedCopies([source], join(dir, 'sources'))[0] ?? ''
    expect(copy.endsWith('sources/plan.md')).toBe(true)
    expect(readFileSync(copy, 'utf8')).toBe('Mutual aid: City of Akron Fire Dept.; ramp: Skyline')
    expect(readFileSync(source, 'utf8')).toContain('Delta')
    expect(seedMarkdown('plan.md', dir)).toBe('Mutual aid: City of Akron Fire Dept.; ramp: Skyline')
  })
})
