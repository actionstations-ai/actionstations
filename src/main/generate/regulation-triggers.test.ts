// Regulation triggers in generation (spec 0426): the prompt list, and the mapper keeping only
// references to real triggers of the enabled regulations.
import { describe, expect, it } from 'vitest'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../tests/fixtures/scenarios/scenario-3.json'
import { mselRow } from '@shared/branching/fixture'
import { applyMselPhase } from './mappers'
import {
  MAX_TRIGGERS_PER_ROW,
  triggerNotes,
  triggerPromptVars,
  validTriggers,
  type TriggerChoice,
} from './regulation-triggers'

const choices: TriggerChoice[] = [
  {
    regulationId: 'sec_8k_105',
    triggerId: 'material',
    regulation: 'SEC Form 8-K Item 1.05',
    label: 'The company determines the incident is material',
    hint: '',
  },
  {
    regulationId: 'circia',
    triggerId: 'ransom_paid',
    regulation: 'CIRCIA',
    label: 'A ransom payment is made',
    hint: '',
  },
  {
    regulationId: 'circia',
    triggerId: 'aware',
    regulation: 'CIRCIA',
    label: 'The entity reasonably believes a covered incident occurred',
    hint: '',
  },
]

describe('validTriggers', () => {
  it('keeps references to listed triggers and drops invented regulations and trigger ids', () => {
    const got = validTriggers(
      [
        { regulationId: 'sec_8k_105', triggerId: 'material' },
        { regulationId: 'made_up', triggerId: 'material' },
        { regulationId: 'sec_8k_105', triggerId: 'nonsense' },
      ],
      choices,
    )
    expect(got).toEqual([{ regulationId: 'sec_8k_105', triggerId: 'material' }])
  })

  it('removes repeats, trims ids and caps the number per row', () => {
    const got = validTriggers(
      [
        { regulationId: ' circia ', triggerId: 'ransom_paid' },
        { regulationId: 'circia', triggerId: 'ransom_paid' },
        { regulationId: 'circia', triggerId: 'aware' },
        { regulationId: 'sec_8k_105', triggerId: 'material' },
      ],
      choices,
    )
    expect(got).toHaveLength(MAX_TRIGGERS_PER_ROW)
    expect(got[0]).toEqual({ regulationId: 'circia', triggerId: 'ransom_paid' })
  })

  it('returns nothing when no regulation is switched on', () => {
    expect(validTriggers([{ regulationId: 'circia', triggerId: 'aware' }], [])).toEqual([])
    expect(validTriggers(undefined, choices)).toEqual([])
  })
})

describe('validTriggers against the row', () => {
  const ref = [{ regulationId: 'circia', triggerId: 'ransom_paid' }]
  const row = (over: Partial<{ event: string; expectedAction: string; purposeTag: string }>) => ({
    event: 'The CFO approves the ransom payment to the attackers.',
    expectedAction: 'Decide who is told.',
    purposeTag: 'DECISION_POINT',
    ...over,
  })

  it('keeps a trigger on a row whose text is that moment', () => {
    expect(validTriggers(ref, choices, row({}))).toEqual(ref)
  })

  it('drops a trigger from a row that does not mention the moment', () => {
    const email = row({ event: 'An FBI email asks for the forensic images.' })
    expect(validTriggers(ref, choices, email)).toEqual([])
  })

  it('matches whole words from the start, so "recovery" does not stand for "covered"', () => {
    const aware = [{ regulationId: 'circia', triggerId: 'aware' }]
    const log = row({ event: 'Recovery is complete and displays are back.' })
    expect(validTriggers(aware, choices, log)).toEqual([])
    const believed = row({ event: 'Counsel believes this is a covered incident.' })
    expect(validTriggers(aware, choices, believed)).toEqual(aware)
  })

  it('never starts a clock on a STARTEX, TIME_JUMP or ENDEX row', () => {
    for (const purposeTag of ['STARTEX', 'TIME_JUMP', 'ENDEX']) {
      expect(validTriggers(ref, choices, row({ purposeTag }))).toEqual([])
    }
  })
})

describe('triggerNotes', () => {
  it('flags each model-placed trigger once, naming the clock and the row', () => {
    const rows = [
      mselRow('I-17', '2:00', { triggers: [{ regulationId: 'circia', triggerId: 'ransom_paid' }] }),
      mselRow('I-18', '2:10'),
    ]
    const notes = triggerNotes(rows, choices)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ code: 'TRIGGER_PROPOSED', severity: 'info', rowId: 'I-17' })
    expect(notes[0]!.message).toContain('A ransom payment is made')
  })

  it('ignores a trigger that is not in the enabled list', () => {
    const rows = [mselRow('I-17', '2:00', { triggers: [{ regulationId: 'x', triggerId: 'y' }] })]
    expect(triggerNotes(rows, choices)).toEqual([])
  })
})

describe('triggerPromptVars', () => {
  it('carries the ids the model must copy, the regulation and the moment', () => {
    expect(triggerPromptVars(choices)[0]).toEqual({
      regulationId: 'sec_8k_105',
      triggerId: 'material',
      regulation: 'SEC Form 8-K Item 1.05',
      label: 'The company determines the incident is material',
      hint: '',
    })
  })
})

describe('applyMselPhase with triggers', () => {
  const s = Scenario.parse(fixture)
  const phase = s.phases[1]!
  const row = (id: string, extra: object = {}) => ({
    id,
    time: phase.startTime,
    from: 'Legal counsel',
    to: ['all'],
    event: 'Counsel tells the incident lead the outage is material to investors.',
    expectedAction: 'Decide who files and when.',
    purposeTag: 'CORE_NARRATIVE' as const,
    format: 'phone_call',
    citations: [],
    ...extra,
  })

  it('stores the valid triggers on the row and ignores them without a regulation list', () => {
    const withTriggers = structuredClone(s)
    const out = {
      rows: [
        row('I-90', {
          triggers: [
            { regulationId: 'sec_8k_105', triggerId: 'material' },
            { regulationId: 'ghost', triggerId: 'x' },
          ],
        }),
      ],
    }
    applyMselPhase(withTriggers, phase, out, [], { triggers: choices })
    expect(withTriggers.msel.find((r) => r.id === 'I-90')!.triggers).toEqual([
      { regulationId: 'sec_8k_105', triggerId: 'material' },
    ])
    const without = structuredClone(s)
    applyMselPhase(without, phase, out, [])
    expect(without.msel.find((r) => r.id === 'I-90')!.triggers).toBeUndefined()
  })
})
