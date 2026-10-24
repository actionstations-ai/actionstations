// examples/simulated-names.json (#283): released examples simulate the exercising
// organization's world (city, local government, airlines, local businesses, brands, carriers);
// vendors, sector organizations, federal and state agencies and threat groups stay real.
// make-example applies the map to documents and seeds on the way in.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { simulateFiles, simulateNames } from '../../scripts/simulate-names.mjs'
import { seedMarkdown, simulatedCopies } from '../../scripts/make-example.mjs'

describe('simulateNames', () => {
  it.each([
    ['Hey Ops, this is Delta at Gate B4.', 'Hey Ops, this is Skyline at Gate B4.'],
    ['"airline": "DELTA", "flight": "DL 301"', '"airline": "SKYLINE", "flight": "SX 301"'],
    ['United Airlines Cargo Facility (Bldg 4)', 'HWK Air Cargo Facility (Bldg 4)'],
    ['Delta, United, and American flights', 'Skyline, HWK Air, and Lakeshore flights'],
    ['Akron Fire Department (AFD)', 'Lakeport Fire Department (AFD)'],
    ['Summit County EMS', 'Haldane County EMS'],
    ['#NCIA #Cleveland', '#NCIA #Lakeport'],
    ['5300 Riverside Drive · Cleveland, Ohio 44135', '5400 Airport Parkway · Lakeport, Ohio 44905'],
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
  ])('leaves "%s" alone', (text) => {
    expect(simulateNames(text)).toBe(text)
  })

  it('is idempotent', () => {
    const once = simulateNames('Delta and United at Akron; #Cleveland; Starbucks; DL 666')
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

  it('make-example imports simulated copies and seeds simulated markdown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'names-'))
    const source = join(dir, 'plan.md')
    writeFileSync(source, 'Mutual aid: City of Akron Fire Dept.')
    const copy = simulatedCopies([source], join(dir, 'sources'))[0] ?? ''
    expect(copy.endsWith('sources/plan.md')).toBe(true)
    expect(readFileSync(copy, 'utf8')).toBe('Mutual aid: City of Lakeport Fire Dept.')
    expect(readFileSync(source, 'utf8')).toContain('Akron')
    expect(seedMarkdown('plan.md', dir)).toBe('Mutual aid: City of Lakeport Fire Dept.')
  })
})
