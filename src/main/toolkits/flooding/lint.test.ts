import { describe, expect, it } from 'vitest'
import {
  categoryAtStage,
  lintCategoryClaim,
  lintFlashFloodWarning,
  lintProductOrder,
  lintStageUnits,
} from './lint'

const leveed = { action: 12, moderate: 18, major: 22 }

describe('flood categories', () => {
  it('uses only the thresholds a point has', () => {
    expect(categoryAtStage(leveed, 13)).toBe('action')
    expect(categoryAtStage(leveed, 18)).toBe('moderate')
    expect(categoryAtStage(leveed, 5)).toBe('none')
  })
  it('treats flood stage as the start of minor flooding when no separate minor stage is given', () => {
    const table = { action: 12, flood: 14, moderate: 17 }
    expect(categoryAtStage(table, 13)).toBe('action')
    expect(categoryAtStage(table, 15)).toBe('minor')
    expect(lintCategoryClaim(table, 15, 'minor')).toEqual([])
  })
  it('flags a category the point does not define', () => {
    expect(lintCategoryClaim(leveed, 14, 'minor')[0]?.message).toMatch(/no minor category/)
  })
  it('flags a claim that disagrees with the stage and accepts a matching one', () => {
    expect(lintCategoryClaim(leveed, 19, 'major')[0]?.message).toMatch(/moderate at this point/)
    expect(lintCategoryClaim(leveed, 23, 'major')).toEqual([])
  })
})

describe('flash flood tags', () => {
  it('requires emergency language for CATASTROPHIC and the reverse', () => {
    expect(lintFlashFloodWarning({ tag: 'catastrophic', text: 'Flash flooding.' })).toHaveLength(1)
    expect(
      lintFlashFloodWarning({ tag: 'catastrophic', text: 'FLASH FLOOD EMERGENCY for Kerrville' }),
    ).toEqual([])
    expect(
      lintFlashFloodWarning({ tag: 'considerable', text: 'Flash flood emergency' }),
    ).toHaveLength(1)
  })
  it('allows a WEA only for CONSIDERABLE or CATASTROPHIC', () => {
    expect(lintFlashFloodWarning({ tag: 'base', text: 'x', wea: true })).toHaveLength(1)
    expect(lintFlashFloodWarning({ tag: 'considerable', text: 'x', wea: true })).toEqual([])
  })
})

describe('product order and stage units', () => {
  it('flags a watch before its outlook', () => {
    const issues = lintProductOrder([
      { kind: 'watch', issuedAt: '2026-11-05T10:00:00Z' },
      { kind: 'outlook', issuedAt: '2026-11-05T12:00:00Z' },
    ])
    expect(issues).toHaveLength(1)
    expect(
      lintProductOrder([
        { kind: 'outlook', issuedAt: '2026-11-04T10:00:00Z' },
        { kind: 'warning', issuedAt: '2026-11-05T10:00:00Z' },
      ]),
    ).toEqual([])
  })
  it('flags a stage without feet', () => {
    expect(lintStageUnits('The river stage is 14.2 at Riverbend.')).toHaveLength(1)
    expect(lintStageUnits('The river stage is 14.2 ft at Riverbend.')).toEqual([])
    expect(lintStageUnits('Stage of 14.2 feet')).toEqual([])
  })
})
