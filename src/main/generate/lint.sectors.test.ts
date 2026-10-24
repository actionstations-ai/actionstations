// The sector domain packs of #322 (batch B) lint with their own threat-family rules: a project
// on the domain resolves the profile's default family, the clue rule of each family lands on
// the role the profile's words name (technical, security or operations), and the PIO gets the
// pressure rule. Roles come straight from the profile, as the objectives stage proposes them.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Scenario } from '@shared/schemas'
import { builtinProfile, threatFamily } from '@shared/domains'
import { domainContext, roleHeuristics } from './domain'
import { DECISION_POINT_SCOPE, findRole, lintScenario, phaseMixGaps } from './lint'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

/** The role keys each profile's words must find, by kind. */
const EXPECTED: Record<
  string,
  { technical: string; security: string; operations: string; public: string }
> = {
  k12_schools: { technical: 'cto', security: 'sro', operations: 'dss', public: 'pio' },
  commercial_facilities: { technical: 'ciso', security: 'sec', operations: 'gm', public: 'pio' },
  food_agriculture: { technical: 'it', security: 'sec', operations: 'gm', public: 'pio' },
  telecom: { technical: 'ciso', security: 'ciso', operations: 'coo', public: 'pio' },
  data_center_it: { technical: 'ciso', security: 'physec', operations: 'ic', public: 'comms' },
  financial_services: { technical: 'iso', security: 'bso', operations: 'coo', public: 'pio' },
}

/** Scenario 3's phases with the profile's roles and one narrative row per phase. */
function scenarioFor(domain: string, threat?: Scenario['brief']['threatFamily']): Scenario {
  const s = structuredClone(FIXTURE)
  s.brief = { ...s.brief, threatFamily: threat }
  s.roles = builtinProfile(domain).roles.map((r) => ({
    id: r.key,
    name: r.name,
    abbreviation: r.abbreviation,
    team: r.team,
    description: r.description,
    standingOrders: [],
  }))
  const template = s.msel.find((r) => r.purposeTag === 'CORE_NARRATIVE')!
  s.msel = s.phases.map((p, i) => ({
    ...template,
    id: `I-${String(i + 1).padStart(2, '0')}`,
    phaseId: p.id,
    toRoleIds: [s.roles[0]!.id],
    event: 'The situation develops.',
    expectedAction: 'Players assess.',
  }))
  return s
}

describe.each(Object.keys(EXPECTED))('%s lint', (domain) => {
  const profile = builtinProfile(domain)
  const expected = EXPECTED[domain]!

  it('finds each kind of role through the profile words', () => {
    const roles = scenarioFor(domain).roles
    const heur = roleHeuristics(profile)
    for (const kind of ['technical', 'security', 'operations', 'public'] as const)
      expect(findRole(roles, heur[kind])?.id, `${domain} ${kind}`).toBe(expected[kind])
  })

  it("lints with the profile's default family when the brief names none", () => {
    const s = scenarioFor(domain)
    const ctx = domainContext({ orgType: domain }, s)
    expect(ctx.profile.id).toBe(domain)
    expect(ctx.threat.id).toBe(profile.threatFamilies[0])
    const gaps = phaseMixGaps(s, s.phases[0]!, ctx)
    const clue = gaps.find((g) => g.code === 'MIX_NO_IT_CLUE' || g.code === 'MIX_NO_CLUE')
    expect(clue?.roleId).toBe(expected[ctx.threat.lint.clueRole])
    expect(gaps.find((g) => g.code === 'MIX_NO_PIO_PRESSURE')?.roleId).toBe(expected.public)
  })

  it.each(profile.threatFamilies)('applies the %s clue rule to the right role', (family) => {
    const s = scenarioFor(domain, family)
    const ctx = domainContext({ orgType: domain }, s)
    expect(ctx.threat.id).toBe(family)
    const rule = threatFamily(family).lint
    const gaps = phaseMixGaps(s, s.phases[0]!, ctx)
    const clue = gaps.filter((g) => g.code === 'MIX_NO_IT_CLUE' || g.code === 'MIX_NO_CLUE')
    if (!rule.clueRequired) expect(clue).toEqual([])
    else expect(clue.map((g) => g.roleId)).toEqual([expected[rule.clueRole]])
  })

  it.runIf(profile.threatFamilies.includes('uas_drone'))(
    'requires a drone decision point to involve law enforcement',
    () => {
      const s = scenarioFor(domain, 'uas_drone')
      const row = s.msel[2]!
      row.purposeTag = 'DECISION_POINT'
      row.event = 'The drone is back.'
      row.expectedAction = 'DECISION POINT: the commander decides whether to keep operating.'
      const ctx = domainContext({ orgType: domain }, s)
      expect(lintScenario(s, ctx).map((w) => w.code)).toContain(DECISION_POINT_SCOPE)
      row.expectedAction =
        'DECISION POINT: the commander keeps operating while police locate the operator.'
      expect(lintScenario(s, ctx).map((w) => w.code)).not.toContain(DECISION_POINT_SCOPE)
    },
  )
})
