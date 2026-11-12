// The simulation form's values (#1141): the generator's example becomes editable values, and the
// edited values become the inputs main checks against the generator's schema.
import { describe, expect, it } from 'vitest'
import type { GeneratorInfo } from '@shared/ipc/case-data'
import { toInputs, valuesFrom } from './case-simulate-form'

const info: GeneratorInfo = {
  id: 'clinical-downtime',
  label: 'Clinical systems downtime',
  toolkits: ['clinical_systems'],
  inputs: [
    { key: 'start', label: 'Failure time', kind: 'datetime', required: true },
    {
      key: 'beds',
      label: 'Beds',
      kind: 'number',
      integer: true,
      min: 10,
      max: 2000,
      required: false,
    },
    { key: 'dataLost', label: 'Queued messages lost', kind: 'boolean', required: false },
    {
      key: 'failedFeeds',
      label: 'Feeds that stop',
      kind: 'choices',
      required: false,
      choices: [
        { value: 'lab_results', label: 'lab results' },
        { value: 'orders', label: 'orders' },
      ],
    },
    { key: 'units', label: 'Units', kind: 'lines', required: false },
    {
      key: 'interval',
      label: 'Interval',
      kind: 'choice',
      required: false,
      choices: [
        { value: 5, label: '5' },
        { value: 15, label: '15' },
      ],
    },
    { key: 'shortfall', label: 'Shortfall', kind: 'json', required: false },
    { key: 'note', label: 'Note', kind: 'text', required: false },
  ],
  example: {
    start: '2026-11-03T02:15:00Z',
    beds: 300,
    dataLost: false,
    failedFeeds: ['lab_results'],
    units: ['4 West', 'Intensive care unit'],
    interval: 15,
    shortfall: { counselors: 2 },
  },
}

describe('the simulation form', () => {
  it('opens on the example and sends the same inputs back', () => {
    const values = valuesFrom(info)
    expect(values).toMatchObject({
      start: '2026-11-03T02:15',
      beds: '300',
      units: '4 West\nIntensive care unit',
      interval: '15',
      note: '',
    })
    const { inputs, errors } = toInputs(info, values)
    expect(errors).toEqual([])
    expect(inputs).toEqual({ ...info.example, start: '2026-11-03T02:15:00Z' })
  })

  it('says what is wrong in words', () => {
    const values = {
      ...valuesFrom(info),
      start: '',
      beds: '2.5',
      shortfall: '{ counselors: 2 ',
    }
    expect(toInputs(info, values).errors).toEqual([
      'Failure time is needed.',
      'Beds must be a whole number.',
      'Shortfall is not valid JSON. Check the brackets, quotes and commas.',
    ])
    expect(toInputs(info, { ...valuesFrom(info), beds: '5' }).errors).toEqual([
      'Beds must be at least 10.',
    ])
  })
})
