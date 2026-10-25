import { describe, expect, it } from 'vitest'
import {
  bindingsFromRows,
  initialValueText,
  missingSummary,
  optionalSummary,
  parseLiteral,
  rowKey,
  rowsFromBindings,
} from './workflow-utils'

describe('workflow-utils', () => {
  it('round-trips a lighting binding with its per-lighting values (#162)', () => {
    const bindings = [
      {
        target: ['3', 'inputs', 'denoise'] as ['3', 'inputs', string],
        source: 'lighting' as const,
        value: { dark: 0.92 },
      },
    ]
    const rows = rowsFromBindings(bindings)
    expect(rows[rowKey({ nodeId: '3', inputName: 'denoise' })]).toEqual({
      source: 'lighting',
      literal: '{"dark":0.92}',
    })
    expect(bindingsFromRows(rows)).toEqual(bindings)
  })

  it('starts a lighting row from the workflow value under "dark"', () => {
    const none = { source: '' as const, literal: '' }
    expect(initialValueText('lighting', none, 1)).toBe('{"dark":1}')
    const lit = { source: 'lighting' as const, literal: '{"dark":0.5}' }
    expect(initialValueText('lighting', lit, 1)).toBe('{"dark":0.5}')
    expect(initialValueText('literal', lit, 25)).toBe('25')
    expect(initialValueText('literal', { source: 'literal', literal: '30' }, 25)).toBe('30')
  })

  it('round-trips bindings through editor rows', () => {
    const bindings = [
      {
        target: ['3', 'inputs', 'steps'] as ['3', 'inputs', string],
        source: 'literal' as const,
        value: 30,
      },
      {
        target: ['6', 'inputs', 'text'] as ['6', 'inputs', string],
        source: 'imagePrompt' as const,
      },
    ]
    const rows = rowsFromBindings(bindings)
    expect(rows[rowKey({ nodeId: '3', inputName: 'steps' })]).toEqual({
      source: 'literal',
      literal: '30',
    })
    expect(bindingsFromRows(rows)).toEqual(bindings)
  })

  it('drops rows set back to "keep workflow value"', () => {
    expect(
      bindingsFromRows({ [rowKey({ nodeId: '1', inputName: 'x' })]: { source: '', literal: '' } }),
    ).toEqual([])
  })

  it('parses fixed values as JSON when possible', () => {
    expect(parseLiteral('30')).toBe(30)
    expect(parseLiteral('true')).toBe(true)
    expect(parseLiteral('euler')).toBe('euler')
    expect(parseLiteral('[1, 2]')).toEqual([1, 2])
  })

  it('summarises missing nodes', () => {
    const w = { missingNodes: ['A', 'B', 'C', 'D', 'E', 'F'] } as never
    expect(missingSummary(w)).toBe('Missing nodes: A, B, C, D and 2 more')
    expect(missingSummary({ missingNodes: [] } as never)).toBeUndefined()
  })

  it('names optional nodes ComfyUI lacks without calling them missing (#356)', () => {
    const w = { missingOptionalNodes: ['Florence2ModelLoader', 'Florence2Run'] } as never
    expect(optionalSummary(w)).toBe(
      'Optional, not installed: Florence2ModelLoader, Florence2Run (runs without them)',
    )
    expect(optionalSummary({ missingOptionalNodes: [] } as never)).toBeUndefined()
    expect(optionalSummary({} as never)).toBeUndefined()
  })
})
