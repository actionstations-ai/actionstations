import { describe, expect, it } from 'vitest'
import { isMetricId } from '../../evaluation/metrics/registry'
import { fieldLintIssues, fieldLintRuleIds } from '../lint-rules'
import { MEDIA_LINT_RULE_IDS } from './lint'

describe('media rules and metrics in the registries', () => {
  it('registers every media.* rule id the toolkit names', () => {
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining([...MEDIA_LINT_RULE_IDS]))
  })

  it('checks a correction notice but leaves other types alone', () => {
    expect(fieldLintIssues('correction_notice', {}).length).toBeGreaterThan(0)
    expect(fieldLintIssues('email', { body: 'Reuters says so' })).toEqual([])
  })

  it('runs the media metrics through the metric registry', () => {
    for (const id of [
      'holding_statement_time',
      'statement_accuracy',
      'corrections',
      'verification',
    ])
      expect(isMetricId(id)).toBe(true)
  })
})
