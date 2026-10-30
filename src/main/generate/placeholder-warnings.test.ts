// Invented redaction placeholders become scenario warnings (#502).
import { describe, expect, it, vi } from 'vitest'
import type { Scenario } from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import {
  REDACTION_UNKNOWN,
  recordPlaceholderWarnings,
  unknownPlaceholderLog,
  watchPlaceholders,
} from './placeholder-warnings'

const scenario = (): Scenario => ({ warnings: [] }) as unknown as Scenario

describe('watchPlaceholders', () => {
  it('passes every line through and remembers only the unknown-placeholder ones', () => {
    const log = vi.fn()
    const { ctx, found } = watchPlaceholders({ log } as unknown as JobContext)
    ctx.log('Row R1 renamed', 'warn')
    ctx.log(unknownPlaceholderLog(['PERSON_ZZZZ']), 'warn', { stage: 'msel_phase', itemId: 'P1' })
    expect(log).toHaveBeenCalledTimes(2)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ itemId: 'P1' })
  })
})

describe('recordPlaceholderWarnings', () => {
  const found = [{ message: unknownPlaceholderLog(['PERSON_ZZZZ']) }]

  it('adds one warning naming the step and the placeholder', () => {
    const s = scenario()
    recordPlaceholderWarnings(s, 'Overview', [...found, ...found])
    expect(s.warnings).toHaveLength(1)
    expect(s.warnings[0]).toMatchObject({ code: REDACTION_UNKNOWN, severity: 'warning' })
    expect(s.warnings[0]!.message).toMatch(/^Overview: the reply used placeholders.*PERSON_ZZZZ/)
  })

  it('replaces a step earlier warnings when it runs again and clears them when none are found', () => {
    const s = scenario()
    recordPlaceholderWarnings(s, 'Overview', found)
    recordPlaceholderWarnings(s, 'Overview', found)
    expect(s.warnings).toHaveLength(1)
    recordPlaceholderWarnings(s, 'Overview', [])
    expect(s.warnings).toEqual([])
  })
})
