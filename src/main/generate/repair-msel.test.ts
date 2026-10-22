// The deterministic repairs generate:repair runs on a saved MSEL (#185), each reproduced from
// the bundled examples' warnings: a truncated recipient key ("as" for ASO), a named site with a
// leading article ("The Lakeshore Flight Area"), a rogue ground station the row itself calls
// unknown ("No record of GCS-12 in fleet"), and a phase over the density limit whose trim must
// spare the rows the rubric scores.
import { describe, expect, it } from 'vitest'
import type { MselRow, Phase, Role, Scenario } from '@shared/schemas'
import { builtinProfile } from '@shared/domains'
import { categoriesForProfile, domainContext, patternId } from './domain'
import { extractFacilityFacts, lintRowFacility, unknownFacilityIds } from './facility'
import { facilityFieldIssues } from './injects/consistency'
import { lintScenario } from './lint'
import { resolveToRoles } from './mappers'
import {
  densityCap,
  densityTrim,
  recipientWarnings,
  relabelRecipients,
  keepControlCards,
  restoreDropped,
} from './repair-msel'

const role = (id: string, abbreviation: string, name: string): Role => ({
  id,
  abbreviation,
  name,
  team: '',
  description: '',
  standingOrders: [],
})
const UAS_ROLES = [
  role('ops', 'IC', 'Director of Flight Operations (Incident Commander)'),
  role('it', 'TL', 'Systems & Cybersecurity Lead (Technical Lead)'),
  role('safety', 'ASO', 'Aviation Safety Officer (ASO)'),
  role('pio', 'PIO', 'Communications Lead (PIO)'),
  role('security', 'Sec', 'Security / CCSO Liaison'),
  role('client', 'SPO', 'Client Liaison (CP&L Program Office)'),
]

const row = (id: string, over: Partial<MselRow> = {}): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:10',
  from: 'System Alert',
  toRoleIds: ['ops'],
  toLabel: 'IC',
  event: `Event ${id}`,
  expectedAction: '',
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  locked: false,
  ...over,
})

describe('recipient keys (ROLE_KEY_UNKNOWN in the UAS example)', () => {
  it('resolves a truncated abbreviation by a unique prefix', () => {
    const to = resolveToRoles(['TL', 'IC', 'as'], UAS_ROLES)
    expect(to.ids).toEqual(['it', 'ops', 'safety'])
    expect(to.label).toBe('TL, IC, ASO')
    expect(to.unresolved).toEqual([])
  })

  it('keeps an ambiguous or one-letter key unresolved', () => {
    // "s" could be SPO or Sec; "Sp" is SPO only, but an id prefix wins first.
    expect(resolveToRoles(['s'], UAS_ROLES).unresolved).toEqual(['s'])
    expect(resolveToRoles(['sec'], UAS_ROLES).ids).toEqual(['security'])
  })

  it('relabels the I-11 and I-27 rows and clears their warnings; other rows stay', () => {
    const s = {
      roles: UAS_ROLES,
      msel: [
        row('I-11', { toRoleIds: ['it', 'ops'], toLabel: 'TL, IC, as' }),
        row('I-27', { toRoleIds: ['pio', 'ops'], toLabel: 's, PIO, IC, as' }),
        row('I-30', { toRoleIds: ['it'], toLabel: 'TL, CCSO dispatcher' }),
        row('I-31', { toRoleIds: ['ops'], toLabel: 'IC' }),
      ],
    } as unknown as Scenario
    const untouched = structuredClone(s.msel.slice(2))
    // "as" resolves now; the one-letter "s" and the outside party do not.
    expect(recipientWarnings(s).map((w) => w.rowId)).toEqual(['I-27', 'I-30'])
    expect(relabelRecipients(s)).toEqual(['I-11', 'I-27'])
    expect(s.msel[0]).toMatchObject({ toRoleIds: ['it', 'ops', 'safety'], toLabel: 'TL, IC, ASO' })
    expect(s.msel[1]).toMatchObject({
      toRoleIds: ['pio', 'ops', 'safety'],
      toLabel: 'PIO, IC, ASO',
    })
    expect(s.msel.slice(2)).toEqual(untouched)
    // A real outside party in the label is still reported, never dropped.
    expect(recipientWarnings(s).map((w) => w.rowId)).toEqual(['I-30'])
  })
})

describe('facility lint on the UAS example rows', () => {
  const facts = extractFacilityFacts(
    [
      'Flights use the Lakeshore Flight Area, Creek Test Area and Horton Field.',
      'Ground control stations GCS-01, GCS-02 and GCS-03 are issued to crews.',
    ],
    categoriesForProfile(builtinProfile('unmanned_systems')),
  )

  it('reads "The Lakeshore Flight Area" as the documented site', () => {
    expect(patternId('The Lakeshore Flight Area')).toBe('LAKESHORE FLIGHT AREA')
    expect(patternId('The Range')).toBe('THE RANGE')
    const start = row('START', {
      event: "Startex Card: 'The Lakeshore Flight Area is under the Part 107 ceiling.'",
    })
    expect(lintRowFacility(start, facts)).toEqual([])
    expect(unknownFacilityIds('The Quarry Flight Area is closed.', facts)).toHaveLength(1)
    // "The Field" (the I-10 time jump of a first repair run) is a common noun, not a site.
    expect(unknownFacilityIds('The Field crew holds position.', facts)).toEqual([])
  })

  it('accepts a rogue station the row itself says is not in the fleet', () => {
    for (const event of [
      "System Log: 'New entry: GCS-12. No record of GCS-12 in fleet.'",
      'Radio Call: "It says New device ID: GCS-12. No GCS-12 exists in the fleet."',
      "Helpdesk Ticket: 'OEM app shows GCS-12. No GCS-12 in fleet.'",
    ])
      expect(lintRowFacility(row('I-02', { event }), facts), event).toEqual([])
    const plain = row('I-13', { event: 'Crew moves to GCS-12 for the next sortie.' })
    expect(lintRowFacility(plain, facts)).toHaveLength(1)
  })

  it('applies the same framing to inject fields', () => {
    const r = row('I-02', { event: "System Log: 'No record of GCS-12 in fleet.'" })
    expect(facilityFieldIssues({ lines: ['Device list: GCS-02, GCS-12'] }, facts, r)).toEqual([])
    const plain = row('I-13', { event: 'Crew report.' })
    expect(facilityFieldIssues({ lines: ['Moved to GCS-12'] }, facts, plain)).toHaveLength(1)
  })
})

describe('density trim (DENSITY_HIGH in the water example)', () => {
  const phase: Phase = {
    id: 'p2',
    index: 1,
    title: 'Loss of Control',
    goal: '',
    beats: [],
    startTime: '1:00',
    endTime: '2:00',
  }
  const roles = [role('ops', 'IC', 'Ops'), role('it', 'TL', 'IT'), role('pio', 'PIO', 'PIO')]
  /** 13 rows in a 60-minute phase: one every 4.6 minutes. */
  const rows = (): MselRow[] => [
    row('I-10', {
      phaseId: 'p2',
      time: '1:00',
      purposeTag: 'TIME_JUMP',
      toRoleIds: ['ops', 'it', 'pio'],
    }),
    ...Array.from({ length: 10 }, (_, i) =>
      row(`I-1${i + 1}`, {
        phaseId: 'p2',
        time: `1:${String(5 + i * 4).padStart(2, '0')}`,
        purposeTag: i % 2 ? 'CORE_NARRATIVE' : 'TECH_HURDLE',
        toRoleIds: i % 3 ? ['ops', 'it'] : ['it', 'pio'],
      }),
    ),
    row('I-17', { phaseId: 'p2', time: '1:58', toRoleIds: ['ops', 'pio'] }),
    row('I-18', { phaseId: 'p2', time: '1:59', purposeTag: 'NOISE', toRoleIds: ['it'] }),
  ]
  const scenario = (): Scenario =>
    ({
      title: 'pH on the Edge',
      brief: { audience: [], startWallClock: '09:00' },
      roles,
      phases: [phase],
      msel: rows(),
      rubric: { metrics: [{ linkedInjectIds: ['I-17'] }] },
    }) as unknown as Scenario

  it('drops one row to fit one inject every 5 minutes, never a rubric-linked one', () => {
    const s = scenario()
    const domain = domainContext({ orgType: 'water_utility' } as never, s)
    expect(lintScenario(s, domain).map((w) => w.code)).toContain('DENSITY_HIGH')
    expect(densityCap(phase)).toBe(12)
    const dropped = densityTrim(s, domain)
    expect(dropped).toHaveLength(1)
    expect(dropped).not.toContain('I-17')
    expect(s.msel).toHaveLength(12)
    expect(s.msel.some((r) => r.id === 'I-17')).toBe(true)
    expect(lintScenario(s, domain).map((w) => w.code)).not.toContain('DENSITY_HIGH')
  })

  it('leaves a phase within the limit alone', () => {
    const s = scenario()
    s.msel = s.msel.slice(0, 12)
    const domain = domainContext({ orgType: 'water_utility' } as never, s)
    expect(densityTrim(s, domain)).toEqual([])
    expect(s.msel).toHaveLength(12)
  })
})

describe('restoreDropped (the water example lost its DECISION_POINT in a first run)', () => {
  it('puts back a row the revision dropped, in MSEL order, and logs it', () => {
    const phases = [{ id: 'p1', index: 0, startTime: '0:00', endTime: '1:00' }]
    const before = [
      row('I-19b', { time: '0:10' }),
      row('I-19c', { time: '0:15', purposeTag: 'DECISION_POINT' }),
      row('I-19d', { time: '0:20' }),
    ]
    const s = { phases, msel: [before[0]!, before[2]!] } as unknown as Scenario
    const logged: string[] = []
    const ctx = { log: (m: string) => logged.push(m) } as never
    expect(restoreDropped(s, structuredClone(before), ctx)).toEqual(['I-19c'])
    expect(s.msel.map((r) => r.id)).toEqual(['I-19b', 'I-19c', 'I-19d'])
    expect(s.msel[1]!.purposeTag).toBe('DECISION_POINT')
    expect(logged[0]).toMatch(/dropped row I-19c; the original row is kept/)
    expect(restoreDropped(s, before, ctx)).toEqual([])
  })
})

describe('keepControlCards (the UAS I-10 time jump came back as an alarm in a first run)', () => {
  it('restores the format and source of a control card, and only of control cards', () => {
    const before = [
      row('I-10', { purposeTag: 'TIME_JUMP', format: 'time_jump_card', from: 'Facilitator' }),
      row('I-12', { format: 'radio_call', from: 'Field Unit' }),
    ]
    const s = {
      msel: [
        { ...before[0]!, format: 'alarm', from: 'Field Surveillance System', event: 'It is 1:00.' },
        { ...before[1]!, format: 'phone_call', from: 'FAA FSDO' },
      ],
    } as unknown as Scenario
    expect(keepControlCards(s, before)).toEqual(['I-10'])
    expect(s.msel[0]).toMatchObject({
      format: 'time_jump_card',
      from: 'Facilitator',
      event: 'It is 1:00.',
    })
    expect(s.msel[1]).toMatchObject({ format: 'phone_call', from: 'FAA FSDO' })
  })
})
