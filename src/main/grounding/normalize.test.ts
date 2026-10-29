import { describe, expect, it } from 'vitest'
import {
  collapseSpace,
  containsPhrase,
  contentWords,
  digitsForWords,
  normalizeText,
  numberWord,
  stem,
} from './normalize'

describe('normalizeText', () => {
  it('turns number words into digits and time units into one spelling', () => {
    expect(normalizeText('Within twenty-four hrs')).toBe('within 24 hour')
    expect(normalizeText('within one hour')).toBe(normalizeText('within 1 hr'))
    expect(normalizeText('a 30-min window')).toBe('a 30 minute window')
  })

  it('keeps section numbers, tags, addresses and rate units whole', () => {
    expect(normalizeText('per EOP 7.5.1 (PLC-02) at 10.72.10.22, 38 mg/L')).toBe(
      'per eop 7.5.1 plc-02 at 10.72.10.22 38 mg/l',
    )
  })

  it('splits words joined by a slash', () => {
    expect(normalizeText('SCADA/IT Security Manager')).toBe('scada it security manager')
  })

  it('maps typographic quotes and dashes to plain ones', () => {
    expect(normalizeText('“Field over screen” — always')).toBe('field over screen always')
  })
})

describe('numbers and plurals', () => {
  it('reads number words', () => {
    expect(numberWord('seven')).toBe(7)
    expect(numberWord('forty-eight')).toBe(48)
    expect(numberWord('lots')).toBeUndefined()
    expect(digitsForWords('notify within two hours')).toBe('notify within 2 hours')
  })

  it('reduces plurals to the singular', () => {
    expect(stem('operators')).toBe('operator')
    expect(stem('policies')).toBe('policy')
    expect(stem('switches')).toBe('switch')
    expect(stem('status')).toBe('status')
    expect(stem('gas')).toBe('gas')
  })

  it('keeps content words and drops filler and generic action verbs', () => {
    expect(contentWords('The IC confirms the pumps are isolated per the plan')).toEqual([
      'pump',
      'isolated',
      'plan',
    ])
  })

  it('matches phrases on word boundaries only', () => {
    expect(containsPhrase('notify the state epa', 'state epa')).toBe(true)
    expect(containsPhrase('notify the state epa', 'ate ep')).toBe(false)
    expect(collapseSpace('  a\n b\t c ')).toBe('a b c')
  })
})
