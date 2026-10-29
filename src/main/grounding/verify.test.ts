// Model verification rules (#423, FR-7): quotes must be in the cited passage; the model can
// lower Grounded to Needs review or raise a label to Grounded only with validated quotes.
import { describe, expect, it } from 'vitest'
import { checkVerdicts, modelLabel, quoteInPassages, type Verdict } from './verify'

const passages = [
  {
    text: 'The Public Information Officer approves and releases all public statements.\nThe Director   signs the Do Not Drink notice.',
  },
]
const v = (claim: string, verdict: Verdict['verdict'], quote: string): Verdict => ({
  claim,
  verdict,
  quote,
})

describe('quote validation', () => {
  it('accepts a quote that is in the passage, whitespace aside', () => {
    expect(quoteInPassages('The Director signs the Do Not Drink notice.', passages)).toBe(true)
    expect(quoteInPassages('“approves and releases all public statements”', passages)).toBe(true)
  })

  it('accepts a quote copied from the escaped prompt text', () => {
    expect(
      quoteInPassages('A &lt;b> tag &amp; more text here', [
        { text: 'A <b> tag & more text here' },
      ]),
    ).toBe(true)
  })

  it('discards a fabricated, paraphrased or too short quote', () => {
    const checked = checkVerdicts(
      [
        v('a', 'supported', 'The Director approves all public statements.'),
        v('b', 'supported', 'releases'),
        v(
          'c',
          'supported',
          'The Public Information Officer approves and releases all public statements.',
        ),
      ],
      passages,
    )
    expect(checked.valid.map((x) => x.claim)).toEqual(['c'])
    expect(checked.discarded.map((x) => x.claim)).toEqual(['a', 'b'])
  })
})

describe('model label', () => {
  const claims = 'The PIO releases the statement. The Director signs the notice.'
  const one = 'The PIO releases the statement.'
  const two = 'The Director signs the notice.'

  it('raises to grounded only when every claim is supported with a validated quote', () => {
    expect(modelLabel('review', claims, [v(one, 'supported', 'x'), v(two, 'supported', 'y')])).toBe(
      'grounded',
    )
    expect(modelLabel('review', claims, [v(one, 'supported', 'x')])).toBe('review')
  })

  it('lowers grounded to review when a validated verdict disagrees', () => {
    expect(
      modelLabel('grounded', claims, [v(one, 'supported', 'x'), v(two, 'contradicted', 'y')]),
    ).toBe('review')
    expect(modelLabel('grounded', claims, [v(one, 'partial', 'x')])).toBe('review')
  })

  it('never raises unsupported without validated quotes', () => {
    expect(modelLabel('unsupported', claims, [])).toBe('unsupported')
    expect(modelLabel('unsupported', claims, [v(one, 'supported', 'x')])).toBe('unsupported')
  })
})
