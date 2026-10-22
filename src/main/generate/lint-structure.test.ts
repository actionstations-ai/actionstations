// Structural lints (#164, #174) against rows shaped like the ones the live acceptance runs
// produced: a player's own decision written as the inject, whatever `from` says, and the
// same resident phone call written twice.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MselRow, Role, Scenario } from '@shared/schemas'
import { lintScenario } from './lint'
import {
  DUPLICATE_EVENT,
  INJECT_PLAYER_VOICE,
  eventSimilarity,
  lintDuplicateEvents,
  lintPlayerVoice,
  namedPlayers,
  sameInject,
} from './lint-structure'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const role = (id: string, name: string, abbreviation: string, description = ''): Role => ({
  id,
  name,
  abbreviation,
  team: 'Team A',
  description: description || `Owns ${name}.`,
  standingOrders: [],
})

/** A scenario with the given roles and rows, all rows in the fixture's phase 3. */
function scenarioWith(roles: Role[], rows: Partial<MselRow>[]): Scenario {
  const s = structuredClone(FIXTURE)
  const phaseId = s.phases[2]!.id
  s.roles = roles
  s.msel = rows.map((r, i) => ({
    id: `I-${20 + i}`,
    phaseId,
    time: '2:30',
    from: 'Outside Caller',
    toRoleIds: [roles[0]!.id],
    toLabel: roles[0]!.abbreviation,
    event: '',
    expectedAction: '',
    purposeTag: 'CORE_NARRATIVE',
    citations: [],
    locked: false,
    ...r,
  }))
  return s
}

const flagged = (s: Scenario): string[] => lintPlayerVoice(s).map((w) => w.rowId!)

const DAM_ROLES = [
  role('ops', 'Dam Operations Manager (Incident Commander)', 'Ops'),
  role('it', 'SCADA / IT Security Lead (Technical Lead)', 'IT'),
  role('pio', 'Public Affairs Officer', 'PIO'),
]
const TRANSIT_ROLES = [
  role('ops', 'Director of Transportation (Incident Commander)', 'Ops'),
  role('pio', 'Communications Director (Public Information Officer)', 'PIO'),
  role('police', 'Chief of Transit Police (Security)', 'TPD'),
]
const UAS_ROLES = [
  role('dom', 'Director of Flight Operations (DOM)', 'DOM'),
  role('it', 'Systems & Cybersecurity Lead (Technical Lead)', 'IT'),
  role('pio', 'Communications Lead (PIO)', 'PIO'),
]

describe('INJECT_PLAYER_VOICE (#164)', () => {
  it('flags the dam I-24 decision point: a named player announcing the decision "to all"', () => {
    const s = scenarioWith(DAM_ROLES, [
      {
        id: 'I-24',
        from: 'Spillway Operator',
        purposeTag: 'DECISION_POINT',
        format: 'phone_call',
        event:
          'Phone Call: "Glen Haskins to all. I am making a high-consequence operational decision under EAP 4.4: we open Gates 2 and 3 to 40 percent now."',
        expectedAction: 'DECISION POINT: Ops weighs the downstream release.',
      },
    ])
    const w = lintPlayerVoice(s)
    expect(w.map((x) => x.rowId)).toEqual(['I-24'])
    expect(w[0]!.code).toBe(INJECT_PLAYER_VOICE)
    expect(w[0]!.message).toMatch(/I am making a high-consequence operational decision/)
  })

  it('flags the transit I-13 PIO declaring CODE GRAYLINE although `from` is "Outside Caller"', () => {
    const s = scenarioWith(TRANSIT_ROLES, [
      {
        id: 'I-13',
        from: 'Outside Caller',
        format: 'phone_call',
        event:
          'Phone Call: "Luis, this is Marcus Bell. I\'m declaring CODE GRAYLINE for the whole bus network and pulling every route sign until we know what is on them."',
        expectedAction: 'Ops coordinates with the PIO.',
      },
    ])
    expect(flagged(s)).toEqual(['I-13'])
  })

  it('recognises a named player from the rest of the scenario ("PIO Marcus Bell")', () => {
    const s = scenarioWith(TRANSIT_ROLES, [
      {
        id: 'I-10',
        from: 'Local Media',
        event: 'Media Inquiry: Channel 8 wants a statement on the dark route signs by 11:00.',
        expectedAction: 'PIO Marcus Bell drafts a holding statement.',
      },
      {
        id: 'I-13',
        from: 'Outside Caller',
        event:
          'Phone Call: "Luis, this is Marcus Bell. Can you give me two minutes before the press call?"',
      },
    ])
    expect(namedPlayers(s).get('Marcus Bell')?.id).toBe('pio')
    expect(flagged(s)).toEqual(['I-13'])
  })

  it('flags the UAS I-23 "This is the DOM. I have made the decision…" from "Frontline Staff"', () => {
    const s = scenarioWith(UAS_ROLES, [
      {
        id: 'I-23',
        from: 'Frontline Staff',
        format: 'radio_call',
        event:
          'Radio Call: "This is the DOM. I have made the decision to ground the fleet and recover UAS-11 to the pad."',
      },
    ])
    expect(flagged(s)).toEqual(['I-23'])
    // The same voice is flagged when the decision sentence is missing: the speaker is a player.
    s.msel[0]!.event = 'Radio Call: "This is the DOM. Status check on all aircraft."'
    expect(flagged(s)).toEqual(['I-23'])
  })

  it('leaves outside parties, phone calls and facilitator prompts alone', () => {
    const s = scenarioWith(DAM_ROLES, [
      {
        from: 'Plant Operator',
        event:
          'Radio Call: "Control, this is Ridgeview Plant. The HMI reading jumped to 4.0 on its own."',
      },
      {
        from: 'Neighbor',
        event:
          'Phone Call: "Hi, I\'m calling to report water over the access road. I made a call to the sheriff too."',
      },
      {
        from: 'County Dispatch',
        event: 'Phone Call: "This is it, the river is at the bridge deck. Are you releasing more?"',
      },
      {
        from: 'Facilitator',
        event:
          'Facilitator prompt to Ops: the situation now demands a call. What is your call, who signs off, and who must be told?',
      },
      {
        from: 'Facilitator',
        purposeTag: 'TIME_JUMP',
        event: 'TIME JUMP: This is the Ops desk at 11:00.',
      },
    ])
    expect(flagged(s)).toEqual([])
  })

  it('finds nothing in the hand-built Scenario 3', () => {
    const codes = lintScenario(FIXTURE).map((w) => w.code)
    expect(codes).not.toContain(INJECT_PLAYER_VOICE)
    expect(codes).not.toContain(DUPLICATE_EVENT)
  })
})

describe('duplicate rows (#174)', () => {
  const call =
    '"My name is Dana Ortiz on Lakeview Road. A drone has been hovering over my back yard for ten minutes and it just dropped toward the lake. Is that yours?"'

  it('treats the same resident call under two channel labels as the same inject', () => {
    const s = scenarioWith(UAS_ROLES, [
      { id: 'I-22', from: 'Resident', event: `Phone Call: ${call}` },
      { id: 'I-25b', from: 'Neighbor', event: `Phone Call (resident, 911 transfer): ${call}` },
    ])
    expect(sameInject(s.msel[0]!, s.msel[1]!)).toBe(true)
    const w = lintDuplicateEvents(s)
    expect(w.map((x) => x.rowId)).toEqual(['I-25b'])
    expect(w[0]!.message).toMatch(/repeats row I-22/)
  })

  it('flags a near-verbatim repeat and keeps distinct injects apart', () => {
    const a = `Phone Call: ${call}`
    const b = a.replace('ten minutes', 'fifteen minutes')
    expect(eventSimilarity(a, b)).toBeGreaterThan(0.75)
    const s = scenarioWith(UAS_ROLES, [
      { id: 'I-22', event: a },
      { id: 'I-23', event: b },
      {
        id: 'I-24',
        event: 'Ticket #5120: the hangar badge reader rejects every card since 10:40.',
      },
    ])
    expect(lintDuplicateEvents(s).map((x) => x.rowId)).toEqual(['I-23'])
  })
})
