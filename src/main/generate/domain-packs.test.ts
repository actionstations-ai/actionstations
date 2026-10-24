// The domain packs of #322 batch A (freight rail, gas pipeline, chemical, public health,
// emergency communications, elections): each profile extracts its identifiers from a short
// document of its kind, lints generated text against them, finds its own roles, and lints a
// scenario with its threat families' rules.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Scenario } from '@shared/schemas'
import { builtinProfile, chooseThreatFamily, threatFamily } from '@shared/domains'
import { categoriesForProfile, domainContext, roleHeuristics } from './domain'
import { extractFacilityFacts, factEntries, factIds, unknownFacilityIds } from './facility'
import { DECISION_POINT_SCOPE, findRole, lintScenario, phaseMixGaps } from './lint'

const factsFor = (domain: string, doc: string) =>
  extractFacilityFacts([doc], categoriesForProfile(builtinProfile(domain)))
const unknown = (text: string, facts: ReturnType<typeof factsFor>): string[] =>
  unknownFacilityIds(text, facts).map((u) => `${u.kind}:${u.id}`)

describe('fact extraction per domain', () => {
  it('freight_rail: subdivisions, yards, control points, bridges, mileposts, trains, cars', () => {
    const facts = factsFor(
      'freight_rail',
      `Lakeshore Junction Railroad dispatches the Sandhill Subdivision and the Prairie Sub
       between Hollis Yard and North Terminal. Interlockings are CP 214 and CP Ames.
       Bridge 87.2 crosses the river at MP 87.2. Train M-HOLNTR-24 carries tank car ABCX 123456
       on Main Tracks 1 and 2. Notify FRA, PHMSA, the TSOC and the National Response Center.`,
    )
    expect(factIds(facts, 'subdivisions')).toEqual(['PRAIRIE SUB', 'SANDHILL SUBDIVISION'])
    expect(factIds(facts, 'yards')).toEqual(['HOLLIS YARD', 'NORTH TERMINAL'])
    expect(factIds(facts, 'control_points')).toEqual(['CP 214', 'CP AMES'])
    expect(factIds(facts, 'bridges')).toEqual(['BRIDGE 87.2'])
    expect(factIds(facts, 'mileposts')).toEqual(['87.2'])
    expect(factIds(facts, 'trains')).toEqual(['M-HOLNTR-24'])
    expect(factIds(facts, 'cars')).toEqual(['ABCX 123456'])
    expect(factIds(facts, 'tracks')).toEqual(['1', '2'])
    expect(factEntries(facts, 'agencies')).toEqual(
      expect.arrayContaining(['FRA', 'PHMSA', 'TSOC', 'National Response Center']),
    )
    expect(
      unknown('Hold trains at CP 300 and CP 214; inspect Bridge 12 near Hollis Yard', facts),
    ).toEqual(['control point / interlocking:CP 300', 'bridge / tunnel:BRIDGE 12'])
  })

  it('gas_pipeline: compressor and regulator stations, valves, lines, districts, storage', () => {
    const facts = factsFor(
      'gas_pipeline',
      `Ridgeline Compressor Station and Station 210 feed Line 300 and Lateral 12.
       The Eastgate City Gate and Reg Station 47 supply the low-pressure districts: Pressure Districts 3 and 4
       run at 7 inches w.c. Mainline valves MLV 12-3 and RCV-07 isolate the segment near MP 143.6.
       Cedar Dome Storage Field balances winter load under OFO 2026-14. Call the
       National Response Center and PHMSA; the state PUC follows up.`,
    )
    expect(factIds(facts, 'compressor_stations')).toEqual([
      'RIDGELINE COMPRESSOR STATION',
      'STATION 210',
    ])
    expect(factIds(facts, 'regulator_stations')).toEqual(['EASTGATE CITY GATE', 'REG STATION 47'])
    expect(factIds(facts, 'valves')).toEqual(['MLV 12-3', 'RCV-07'])
    expect(factIds(facts, 'lines')).toEqual(['12', '300'])
    expect(factIds(facts, 'pressure_districts')).toEqual(['3', '4'])
    expect(factIds(facts, 'storage')).toEqual(['CEDAR DOME STORAGE FIELD'])
    expect(factIds(facts, 'mileposts')).toEqual(['143.6'])
    expect(factIds(facts, 'ofo')).toEqual(['OFO 2026-14'])
    expect(factEntries(facts, 'agencies')).toEqual(
      expect.arrayContaining(['PHMSA', 'National Response Center', 'PUC']),
    )
    expect(unknown('Close MLV 9 and RCV-07, then shut Station 450', facts)).toEqual([
      'compressor station:STATION 450',
      'mainline / block valve:MLV 9',
    ])
  })

  it('chemical: units, vessels, tanks, racks, CAS numbers, SIFs, muster points, gates', () => {
    const facts = factsFor(
      'chemical',
      `The Chlorine Process Unit and Process Units 200 and 300 feed reactor R-101 and column
       C-401. Anhydrous ammonia (CAS 7664-41-7) is stored in Tank 12 and Sphere 3, and loaded at
       Rack 2 and Rail Spot 7. Interlock SIF-115 trips the feed. Muster Points A and B; Gates 1
       and 3. Report to EPA, OSHA, the SERC and the LEPC.`,
    )
    expect(factIds(facts, 'units')).toEqual(['200', '300'])
    expect(factIds(facts, 'vessels')).toEqual(['C-401', 'R-101'])
    expect(factIds(facts, 'tanks')).toEqual(['SPHERE 3', 'TANK 12'])
    expect(factIds(facts, 'loading')).toEqual(['RACK 2', 'RAIL SPOT 7'])
    expect(factIds(facts, 'cas_numbers')).toEqual(['7664-41-7'])
    expect(factIds(facts, 'sis_functions')).toEqual(['SIF-115'])
    expect(factIds(facts, 'muster_points')).toEqual(['A', 'B'])
    expect(factIds(facts, 'gates')).toEqual(['1', '3'])
    expect(factEntries(facts, 'agencies')).toEqual(
      expect.arrayContaining(['EPA', 'OSHA', 'SERC', 'LEPC']),
    )
    expect(
      unknown('Tank 14 overflows; send everyone to Muster Point C through Gate 3', facts),
    ).toEqual(['storage tank / sphere:TANK 14', 'muster point:C'])
  })

  it('public_health: PODs, clinics, districts, outbreaks, accessions, water systems', () => {
    const facts = factsFor(
      'public_health',
      `PODs 1, 2 and 3 open at the high schools. The North District Clinic and the
       Riverside Health Center run vaccination. Health Districts 4 and 5 report cases of measles under
       OB-2026-0147 (Case 24-05581); specimen PHL-26-031882 went to the lab. The water system
       PWSID ST1234567 issued an advisory. Coordinate with CDC, ASPR and the
       Strategic National Stockpile.`,
    )
    expect(factIds(facts, 'pods')).toEqual(['1', '2', '3'])
    expect(factIds(facts, 'clinics')).toEqual(['NORTH DISTRICT CLINIC', 'RIVERSIDE HEALTH CENTER'])
    expect(factIds(facts, 'districts')).toEqual(['4', '5'])
    expect(factIds(facts, 'outbreaks')).toEqual(['CASE 24-05581', 'OB-2026-0147'])
    expect(factIds(facts, 'specimens')).toEqual(['PHL-26-031882'])
    expect(factIds(facts, 'water_systems')).toEqual(['ST1234567'])
    expect(factEntries(facts, 'agencies')).toEqual(
      expect.arrayContaining(['CDC', 'ASPR', 'Strategic National Stockpile']),
    )
    expect(unknown('Open POD 7 and staff the Westside Health Center', facts)).toEqual([
      'POD site:7',
      'clinic / district office:WESTSIDE HEALTH CENTER',
    ])
  })

  it('emergency_communications: positions, talkgroups, radio sites, units, CAD numbers, trunks', () => {
    const facts = factsFor(
      'emergency_communications',
      `Positions 1–8 are on the floor; Position 9 is the supervisor. Police use PD Main
       and PD TAC 3; mutual aid uses 8CALL90 and 8TAC91. Radio Site 4 and Tower Site 2 carry the
       zone. Engine 12 and Medic 4 were assigned to CAD #26-118734. CAMA trunk 3 and
       SIP trunk group B carry 911 calls. Report outages to the FCC and CJIS incidents to the state CSA.`,
    )
    expect(factIds(facts, 'positions')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(factIds(facts, 'talkgroups')).toEqual(['8CALL90', '8TAC91', 'PD MAIN', 'PD TAC 3'])
    expect(factIds(facts, 'radio_sites')).toEqual(['RADIO SITE 4', 'TOWER SITE 2'])
    expect(factIds(facts, 'apparatus')).toEqual(['ENGINE 12', 'MEDIC 4'])
    expect(factIds(facts, 'cad_incidents')).toEqual(['26-118734'])
    expect(factIds(facts, 'trunks')).toEqual(['CAMA TRUNK 3', 'SIP TRUNK GROUP B'])
    expect(factEntries(facts, 'agencies')).toEqual(expect.arrayContaining(['FCC', 'CJIS']))
    expect(
      unknown('Patch PD TAC 5 to 8CALL90 and move Position 12 to Radio Site 4', facts),
    ).toEqual(['console position:12', 'talkgroup / channel:PD TAC 5'])
  })

  it('elections: precincts, vote centers, drop boxes, districts, measures, devices, seals', () => {
    const facts = factsFor(
      'elections',
      `Precinct 0412 and Precinct 17-B vote at Vote Center 12; Vote Center 3 serves District 4.
       Drop Boxes 7 and 9 are emptied nightly. Measure B is on ballot style BS-034. Tabulator
       DS200-0457 was sealed with Seal #A0048213. Contacts: the EAC, USPIS and the
       Secretary of State.`,
    )
    expect(factIds(facts, 'precincts')).toEqual(['0412', '17-B'])
    expect(factIds(facts, 'vote_centers')).toEqual(['12', '3'])
    expect(factIds(facts, 'drop_boxes')).toEqual(['7', '9'])
    expect(factIds(facts, 'districts')).toEqual(['4'])
    expect(factIds(facts, 'measures')).toEqual(['B'])
    expect(factIds(facts, 'devices')).toEqual(['DS200-0457'])
    expect(factIds(facts, 'seals')).toEqual(['A0048213'])
    expect(factIds(facts, 'ballot_styles')).toEqual(['BS-034'])
    expect(factEntries(facts, 'agencies')).toEqual(
      expect.arrayContaining(['EAC', 'USPIS', 'Secretary of State']),
    )
    expect(
      unknown('Relocate Vote Center 15 and seal Drop Box 7; recount Measure C', facts),
    ).toEqual(['vote center / polling place:15', 'ballot measure:C'])
  })
})

// ---- roles and threat-family lint ---------------------------------------------------------

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

/** Scenario 3 recast with a domain's roles; phase 2 carries only narrative rows to the IC. */
function scenarioFor(domain: string): Scenario {
  const s = structuredClone(FIXTURE)
  const profile = builtinProfile(domain)
  s.roles = profile.roles.map((r) => ({
    id: r.key,
    name: r.name,
    abbreviation: r.abbreviation,
    team: r.team,
    description: r.description,
    standingOrders: [],
  }))
  const ic = profile.roles[0]!.key
  s.msel = s.msel.map((r) => ({ ...r, toRoleIds: [ic] }))
  const phase2 = s.phases[1]!.id
  s.msel = s.msel.map((r) =>
    r.phaseId === phase2 && r.purposeTag !== 'TIME_JUMP'
      ? { ...r, purposeTag: 'CORE_NARRATIVE' as const }
      : r,
  )
  return s
}

const DOMAINS: {
  id: string
  roles: { technical: string; security?: string; operations: string; public: string }
}[] = [
  {
    id: 'freight_rail',
    roles: { technical: 'ciso', security: 'rrpd', operations: 'coo', public: 'pio' },
  },
  {
    id: 'gas_pipeline',
    roles: { technical: 'cyb', security: 'sec', operations: 'vp', public: 'pio' },
  },
  { id: 'chemical', roles: { technical: 'ot', security: 'fso', operations: 'ic', public: 'comm' } },
  { id: 'public_health', roles: { technical: 'it', operations: 'ho', public: 'pio' } },
  {
    id: 'emergency_communications',
    roles: { technical: 'tech', security: 'le', operations: 'dir', public: 'pio' },
  },
  { id: 'elections', roles: { technical: 'it', security: 'sec', operations: 'eo', public: 'pio' } },
]

describe('roles and threat-family lint per domain', () => {
  it.each(DOMAINS)('$id: the role heuristics find the right player for each kind', (d) => {
    const s = scenarioFor(d.id)
    const heur = roleHeuristics(builtinProfile(d.id))
    expect(findRole(s.roles, heur.technical)?.id).toBe(d.roles.technical)
    expect(findRole(s.roles, heur.security)?.id).toBe(d.roles.security)
    expect(findRole(s.roles, heur.operations)?.id).toBe(d.roles.operations)
    expect(findRole(s.roles, heur.public)?.id).toBe(d.roles.public)
  })

  it.each(DOMAINS)("$id: lints a phase with the default family's clue rule", (d) => {
    const s = scenarioFor(d.id)
    const profile = builtinProfile(d.id)
    const ctx = domainContext({ orgType: d.id }, { brief: { ...s.brief, threatFamily: undefined } })
    expect(ctx.threat.id).toBe(profile.threatFamilies[0])
    const rule = threatFamily(profile.threatFamilies[0]!).lint
    const gaps = phaseMixGaps(s, s.phases[1]!, ctx)
    const clue = gaps.find((g) => g.code === 'MIX_NO_IT_CLUE' || g.code === 'MIX_NO_CLUE')
    expect(rule.clueRequired).toBe(true)
    expect(clue?.code).toBe(rule.clueRole === 'technical' ? 'MIX_NO_IT_CLUE' : 'MIX_NO_CLUE')
    expect(clue?.roleId).toBe(d.roles[rule.clueRole])
    // A natural-hazard exercise of the same domain needs no clue every phase.
    const hazard = domainContext(
      { orgType: d.id },
      { brief: { ...s.brief, threatFamily: 'natural_hazard' } },
    )
    expect(profile.threatFamilies).toContain('natural_hazard')
    expect(
      phaseMixGaps(s, s.phases[1]!, hazard).filter((g) => /MIX_NO_(IT_)?CLUE/.test(g.code)),
    ).toEqual([])
  })

  it.each(DOMAINS)('$id: never picks a family the profile does not list', (d) => {
    const profile = builtinProfile(d.id)
    for (const [text, family] of [
      ['A drone is hovering over the site', 'uas_drone'],
      ['A crowd crush at the concert', 'mass_gathering'],
    ] as const) {
      const chosen = chooseThreatFamily(profile, text)
      if (profile.threatFamilies.includes(family)) expect(chosen).toBe(family)
      else expect(chosen).not.toBe(family)
    }
  })

  it.each(DOMAINS.filter((d) => builtinProfile(d.id).threatFamilies.includes('uas_drone')))(
    '$id: a drone decision point must involve law enforcement or the airspace authority',
    (d) => {
      const s = scenarioFor(d.id)
      const dp = s.msel.find(
        (r) => r.purposeTag === 'CORE_NARRATIVE' && r.phaseId === s.phases[2]!.id,
      )!
      dp.purposeTag = 'DECISION_POINT'
      dp.event = 'The drone is back over the site.'
      dp.expectedAction = 'DECISION POINT: the incident commander decides whether to stop work.'
      const drone = domainContext(
        { orgType: d.id },
        { brief: { ...s.brief, threatFamily: 'uas_drone' } },
      )
      const codes = () => lintScenario(s, drone).map((w) => w.code)
      expect(codes()).toContain(DECISION_POINT_SCOPE)
      dp.expectedAction =
        'DECISION POINT: the incident commander stops work and asks local police and the FAA to locate the operator.'
      expect(codes()).not.toContain(DECISION_POINT_SCOPE)
    },
  )
})
