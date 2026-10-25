// The audience list is the role list (#364 item 1). Cases are the six drafts built for the
// 0.5.0 examples (PR #363): each kept the domain profile's default roles and dropped one or
// two audience entries (Customer Service, Distribution, Leadership, Payload & Calibration,
// Fleet & Logistics) while the role count still matched.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { builtinProfile, type DomainProfile } from '@shared/domains'
import type { Role, Scenario } from '@shared/schemas'
import { domainContext } from './domain'
import { AUDIENCE_NOT_SEATED, audienceCoverage, lintAudience } from './lint-audience'
import { lintScenario } from './lint'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const WATER = builtinProfile('water_utility')
const UAS = builtinProfile('unmanned_systems')

/** The profile's default roles for these keys, as a draft writes them. */
const defaults = (profile: DomainProfile, keys: string[]): Role[] =>
  keys.map((key) => {
    const t = profile.roles.find((r) => r.key === key)!
    return { ...t, id: t.key, standingOrders: [] }
  })

const draft = (audience: string[], roles: Role[]): Scenario => ({
  ...structuredClone(FIXTURE),
  brief: { ...FIXTURE.brief, audience },
  roles,
})

const unseated = (s: Scenario, profile: DomainProfile): string[] =>
  lintAudience(s, profile).map((w) => w.message.match(/"(.+?)"/)![1]!)

describe('the profiles the drafts used', () => {
  it('are the bundled water utility and unmanned systems profiles', () => {
    expect(WATER.id).toBe('water_utility')
    expect(UAS.id).toBe('unmanned_systems')
  })
})

describe('audience entries without a role (#364 item 1)', () => {
  it('flags Customer Service when the draft seats Security instead (city-water ransomware)', () => {
    const s = draft(
      [
        'Water Operations',
        'SCADA / IT',
        'Public Information',
        'Water Quality / Lab',
        'Customer Service',
      ],
      defaults(WATER, ['ops', 'it', 'pio', 'wq', 'security']),
    )
    const w = lintAudience(s, WATER)
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ code: AUDIENCE_NOT_SEATED, severity: 'warning' })
    expect(w[0]!.message).toContain('"Customer Service"')
    // The fix names the role no audience entry asked for.
    expect(w[0]!.suggestion).toContain('Security & Emergency Manager')
  })

  it('flags Distribution when the draft seats SCADA / IT or Security instead (tank, main)', () => {
    const tank = draft(
      ['Water Operations', 'Distribution', 'Water Quality / Lab', 'Public Information', 'Security'],
      defaults(WATER, ['ops', 'it', 'pio', 'wq', 'security']),
    )
    expect(unseated(tank, WATER)).toEqual(['Distribution'])
    const main = draft(
      [
        'Water Operations',
        'Distribution',
        'SCADA / IT',
        'Water Quality / Lab',
        'Public Information',
      ],
      defaults(WATER, ['ops', 'it', 'pio', 'wq', 'security']),
    )
    expect(unseated(main, WATER)).toEqual(['Distribution'])
  })

  it('flags Leadership and Payload & Calibration (uas ransomware)', () => {
    const s = draft(
      [
        'Leadership',
        'Systems / Cybersecurity',
        'Flight Operations',
        'Payload & Calibration',
        'Corporate Communications',
      ],
      defaults(UAS, ['ops', 'it', 'safety', 'pio', 'security']),
    )
    expect(unseated(s, UAS)).toEqual(['Leadership', 'Payload & Calibration'])
  })

  it('flags Leadership (uas rogue drone) and Fleet & Logistics with it (uas flyaway)', () => {
    const rogue = draft(
      [
        'Flight Operations',
        'Aviation Safety',
        'Leadership',
        'Corporate Communications',
        'Security / Harwick Police liaison',
      ],
      defaults(UAS, ['ops', 'it', 'safety', 'pio', 'security']),
    )
    expect(unseated(rogue, UAS)).toEqual(['Leadership'])
    const flyaway = draft(
      [
        'Flight Operations',
        'Aviation Safety',
        'Systems / Cybersecurity',
        'Fleet & Logistics',
        'Leadership',
        'Corporate Communications',
      ],
      defaults(UAS, ['ops', 'it', 'safety', 'pio', 'security', 'cp']),
    )
    expect(unseated(flyaway, UAS)).toEqual(['Fleet & Logistics', 'Leadership'])
  })

  it('accepts the roles the shipped scenarios seat for the same audiences', () => {
    const s = draft(
      [
        'Water Operations',
        'SCADA / IT',
        'Public Information',
        'Water Quality / Lab',
        'Customer Service',
      ],
      [
        ...defaults(WATER, ['ops', 'it', 'pio', 'wq']),
        {
          id: 'cs',
          name: 'Customer Service Lead (Customer Service)',
          abbreviation: 'CS',
          team: 'Team E: Customer Service',
          description: '',
          standingOrders: [],
        },
      ],
    )
    expect(lintAudience(s, WATER)).toEqual([])
  })

  it('matches by a shared word, a longer form of it, or the same role kind', () => {
    const role = (name: string, team = ''): Role => ({
      id: name.toLowerCase().replace(/\W+/g, '_'),
      name,
      abbreviation: '',
      team,
      description: '',
      standingOrders: [],
    })
    const s = draft(
      ['Command', 'Public Information (PIO)', 'Systems / Cybersecurity', 'Field Agencies (Police)'],
      [
        role('VP Gas Operations (Incident Commander)'),
        role('Corporate Communications Manager', 'Team F: Communications (PIO)'),
        role('Systems & Cyber Lead'),
        role('Police / Sheriff Liaison'),
      ],
    )
    expect(lintAudience(s, undefined)).toEqual([])
    const { unasked } = audienceCoverage(s)
    expect(unasked).toEqual([])
  })

  it('does not match on rank words alone (Director, Manager, Liaison, Team)', () => {
    const s = draft(
      ['Leadership Team', 'Payload Liaison'],
      [
        {
          id: 'client',
          name: 'Client Liaison Director',
          abbreviation: 'CL',
          team: 'Team F: Client',
          description: '',
          standingOrders: [],
        },
      ],
    )
    expect(unseated(s, UAS)).toEqual(['Leadership Team', 'Payload Liaison'])
  })

  it('passes the hand-built Scenario 3 and a brief without an audience', () => {
    expect(lintAudience(FIXTURE)).toEqual([])
    expect(lintAudience(draft([], FIXTURE.roles))).toEqual([])
  })

  it('runs in lintScenario with the domain profile', () => {
    const s = draft(['Water Operations', 'Customer Service'], defaults(WATER, ['ops', 'security']))
    const codes = lintScenario(s, domainContext({ orgType: 'water_utility' }, s)).map((w) => w.code)
    expect(codes).toContain(AUDIENCE_NOT_SEATED)
  })
})
