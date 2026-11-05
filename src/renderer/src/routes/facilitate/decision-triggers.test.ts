import { describe, expect, it } from 'vitest'
import type { FacilitatorState } from '@shared/ipc'
import { anchorsFrom, deadline } from '@shared/compliance/clock'
import { parseLocal } from '@shared/compliance/scenario-time'
import { Regulation, sessionOf } from '@shared/schemas/compliance'
import secRaw from '../../../../../packs/regulations/sec_8k_105.json'
import { fireDecisionTriggers } from './compliance'

const sec = Regulation.parse(secRaw)
const start = parseLocal('2026-10-22T09:00')
const base: FacilitatorState = {
  elapsedMin: 0,
  delivered: {},
  notes: {},
  generalNotes: '',
  hotwash: [],
  decisions: [],
}
const forms = [
  {
    id: 'gov_materiality_determination',
    fires: [
      {
        regulationId: 'sec_8k_105',
        triggerId: 'materiality_determined',
        fieldId: 'determination',
        optionId: 'material',
      },
    ],
  },
  { id: 'other_form' },
]
const decision = (id: string, determination: string, exerciseTime?: string) => ({
  id,
  formId: 'gov_materiality_determination',
  fields: { determination },
  ...(exerciseTime ? { exerciseTime } : {}),
})
const on = new Set(['sec_8k_105'])

describe('decisions fire regulatory clock triggers', () => {
  it('a "material" decision fires the trigger at its exercise time and starts the clock', () => {
    const s = fireDecisionTriggers(
      base,
      forms,
      [decision('d1', 'material', '1:30')],
      on,
      200,
      start,
    )
    const fired = sessionOf(s).fired
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({
      regulationId: 'sec_8k_105',
      triggerId: 'materiality_determined',
      exerciseMin: 90,
      by: 'live',
      note: 'decision:d1',
    })
    const due = deadline(sec, 'form_8k', anchorsFrom('sec_8k_105', sessionOf(s), start))
    expect('dueAt' in due).toBe(true)
  })

  it('uses the exercise minute now when the decision has no time', () => {
    const s = fireDecisionTriggers(base, forms, [decision('d1', 'material')], on, 200, start)
    expect(sessionOf(s).fired[0]!.exerciseMin).toBe(200)
  })

  it('fires nothing for another choice, another form, or a regulation that is off', () => {
    const notMaterial = [
      decision('d1', 'not_material'),
      { id: 'd2', formId: 'other_form', fields: {} },
    ]
    expect(fireDecisionTriggers(base, forms, notMaterial, on, 0, start)).toBe(base)
    expect(
      fireDecisionTriggers(base, forms, [decision('d3', 'material')], new Set(), 0, start),
    ).toBe(base)
  })

  it('fires once per decision however often it runs, and again for a new decision', () => {
    const once = fireDecisionTriggers(base, forms, [decision('d1', 'material')], on, 10, start)
    expect(fireDecisionTriggers(once, forms, [decision('d1', 'material')], on, 99, start)).toBe(
      once,
    )
    const twice = fireDecisionTriggers(
      once,
      forms,
      [decision('d1', 'material'), decision('d2', 'material')],
      on,
      99,
      start,
    )
    expect(sessionOf(twice).fired).toHaveLength(2)
  })
})
