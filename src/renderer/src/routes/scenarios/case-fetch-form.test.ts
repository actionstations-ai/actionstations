// The fetch form's query (#1139): what the person typed, checked against what the connector
// declares, becomes the query main estimates and fetches; problems come back in words.
import { describe, expect, it } from 'vitest'
import type { ConnectorInfo } from '@shared/ipc/case-data'
import { initialForm, sizeText, toQuery } from './case-fetch-form'

const gdacs: ConnectorInfo = {
  id: 'gdacs-events',
  label: 'GDACS disaster events',
  source: 'GDACS',
  terms: 'Cite GDACS.',
  hosts: ['www.gdacs.org'],
  options: [
    { key: 'location', label: 'Country code', type: 'text', required: true, example: 'TUR' },
    { key: 'includeGreen', label: 'Include green alerts', type: 'boolean', example: true },
    { key: 'limit', label: 'Most events', type: 'number', default: 50, example: 10 },
  ],
}
const boxed: ConnectorInfo = {
  ...gdacs,
  options: [],
  area: { bbox: 'required', label: 'optional' },
}

describe('the fetch form', () => {
  it('starts with the week before today, the defaults and booleans off', () => {
    const f = initialForm(gdacs, new Date('2026-11-12T15:30:00Z'))
    expect(f.start).toBe('2026-11-05T00:00')
    expect(f.end).toBe('2026-11-12T00:00')
    expect(f.options).toEqual({ location: '', includeGreen: false, limit: 50 })
  })

  it('builds the query with typed options and UTC times', () => {
    const f = initialForm(gdacs, new Date('2026-11-12T00:00:00Z'))
    f.options = { location: ' TUR ', includeGreen: true, limit: '25' }
    const { query, errors } = toQuery(gdacs, f)
    expect(errors).toEqual([])
    expect(query).toEqual({
      range: { start: '2026-11-05T00:00:00Z', end: '2026-11-12T00:00:00Z' },
      area: { label: '' },
      options: { location: 'TUR', includeGreen: true, limit: 25 },
    })
  })

  it('says what is missing or wrong', () => {
    const f = initialForm(gdacs)
    f.options.limit = 'many'
    f.end = f.start
    expect(toQuery(gdacs, f).errors).toEqual([
      'The end must be after the start.',
      'Country code is needed.',
      'Most events must be a number.',
    ])
  })

  it('needs all four edges of a required box, in order', () => {
    const f = initialForm(boxed)
    expect(toQuery(boxed, f).errors).toEqual(['Give the box: all four edges.'])
    f.bbox = ['-88.2', '30.2', '', '30.4']
    expect(toQuery(boxed, f).errors[0]).toMatch(/all four edges/)
    f.bbox = ['-88.0', '30.2', '-88.2', '30.4']
    expect(toQuery(boxed, f).errors).toEqual([
      'West must be less than east, and south less than north.',
    ])
    f.bbox = ['-88.2', '30.2', '-88.0', '30.4']
    f.areaLabel = 'Heron Bay'
    expect(toQuery(boxed, f)).toMatchObject({
      errors: [],
      query: { area: { label: 'Heron Bay', bbox: [-88.2, 30.2, -88, 30.4] } },
    })
  })

  it('writes sizes in words', () => {
    expect([sizeText(512), sizeText(740 * 1024), sizeText(3.25 * 1024 * 1024)]).toEqual([
      '512 bytes',
      '740 KB',
      '3.3 MB',
    ])
  })
})
