// Rules learned from the first live run against Scenario 3 (tests/fixtures/injects/sample-run).
import { describe, expect, it } from 'vitest'
import type { MselRow } from '@shared/schemas'
import { factsSoFar } from './facts'
import { positivePrompt } from './media-plan'
import { dropUnknownFields, exerciseDate, scenarioDate, scrubTags } from './text-stage'

const row = (id: string, event: string): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:15',
  from: 'x',
  toRoleIds: [],
  event,
  expectedAction: '',
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  locked: false,
})

describe('image prompt hygiene', () => {
  it('drops quoted on-screen strings and "in … text" phrases (SDXL would paint them)', () => {
    const p = positivePrompt(
      "A glowing departures monitor is visible to the right, showing 'TG 4105' and 'Gate A1' in bright green text, but the gate is empty. A sign reading \"Exit\" above.",
    )
    expect(p).not.toMatch(/TG 4105|Gate A1|Exit|bright green text/)
    expect(
      positivePrompt(
        'plain glass walls, no readable signs, and the ceiling has no visible branding.',
      ),
    ).toBe('plain glass walls')
    expect(p).toMatch(/A glowing departures monitor is visible to the right/)
    expect(p).toMatch(/but the gate is empty/)
  })
})

describe('facts hygiene', () => {
  it('does not mistake radio talkgroups, cameras or call ids for flights', () => {
    const rows = [
      row(
        'I-03',
        'Radio on TG 4105 / 460.275 MHz from CAM 14; call CR 2026; flight UA 1245 to Chicago',
      ),
    ]
    const flights = factsSoFar(rows, rows[0]!, []).filter((f) => f.kind === 'flight')
    expect(flights.map((f) => f.value)).toEqual(['UA 1245'])
  })
})

describe('scrubTags', () => {
  it('removes purpose tags the model wrote into content, leaving ordinary words alone', () => {
    expect(
      scrubTags({
        subject: 'CORE_NARRATIVE: AODB Restoration Verification Plan Requested',
        body: 'The noise at the gate was a clue; a DECISION_POINT follows.',
        tags: ['PRESSURE — Channel 5 going live', 'STARTEX'],
      }),
    ).toEqual({
      subject: 'AODB Restoration Verification Plan Requested',
      body: 'The noise at the gate was a clue; a follows.',
      tags: ['Channel 5 going live', 'STARTEX'],
    })
    expect(scrubTags('NOISE')).toBe('NOISE')
  })
})

describe('dropUnknownFields', () => {
  it('removes top-level keys the template schema does not declare and reports them', () => {
    const out = {
      type: 'endex_card',
      title: 't',
      deliveryMode: 'read_aloud' as const,
      fields: { resolution: 'x', instructorNote: 'leaked', finalState: ['a'] },
      citations: [],
    }
    expect(dropUnknownFields(out, ['resolution', 'finalState'])).toEqual(['instructorNote'])
    expect(out.fields).toEqual({ resolution: 'x', finalState: ['a'] })
    expect(dropUnknownFields(out, [])).toEqual([])
  })
})

describe('exerciseDate', () => {
  it('is a full en-US date the artifacts can agree on', () => {
    expect(exerciseDate(new Date('2026-10-21T15:00:00Z'))).toBe('Wednesday, October 21, 2026')
  })
})

describe('scenarioDate', () => {
  const today = new Date('2026-10-30T15:00:00Z')
  const scenario = (startex: string, threat = '') =>
    ({ msel: [{ event: startex }], overview: { threat } }) as unknown as Parameters<
      typeof scenarioDate
    >[0]

  it('uses the date the STARTEX row states, not today', () => {
    const s = scenario('STARTEX: It is 05:40 on Tuesday, March 3, 2026. The EHR will not open.')
    expect(scenarioDate(s, today)).toBe('Tuesday, March 3, 2026')
  })

  it('falls back to the threat summary when the STARTEX row has no date', () => {
    const s = scenario(
      'STARTEX: The EHR will not open.',
      'On Friday, March 13, 2026 a switch fails.',
    )
    expect(scenarioDate(s, today)).toBe('Friday, March 13, 2026')
  })

  it('uses today when the scenario states no date', () => {
    expect(scenarioDate(scenario('STARTEX: It is 09:00.'), today)).toBe('Friday, October 30, 2026')
  })
})
