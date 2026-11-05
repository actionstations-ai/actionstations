import { describe, expect, it } from 'vitest'
import {
  checkLotCodeShapes,
  checkRecallCounts,
  checkRecallLetter,
  lotShape,
  splitLots,
} from './lint'

describe('lot code shapes', () => {
  it('maps letters and digits', () => {
    expect(lotShape('MLW-261104-A')).toBe('AAA-999999-A')
  })

  it('accepts codes that share a shape and ignores placeholders', () => {
    expect(checkLotCodeShapes(splitLots('MLW-261104-A, MLW-261104-B, unknown'))).toEqual([])
  })

  it('flags a code whose format changed', () => {
    const out = checkLotCodeShapes(['MLW-261104-A', 'MLW-261104-B', 'L4411-0922'])
    expect(out).toHaveLength(1)
    expect(out[0]?.message).toContain('L4411-0922')
  })
})

describe('recall letter', () => {
  const good = {
    recallClass: 'Class I',
    urgent: true,
    lots: ['MLW-261104-A'],
    reason: 'positive test',
    hazard: 'serious illness',
    instructions: ['stop selling'],
    contact: 'recall@example.test',
    replyBy: 'Nov 6',
  }

  it('passes a complete urgent Class I letter', () => {
    expect(checkRecallLetter(good)).toEqual([])
  })

  it('requires urgent for Class I and II but not Class III', () => {
    expect(checkRecallLetter({ ...good, urgent: false })).toHaveLength(1)
    expect(checkRecallLetter({ ...good, recallClass: 'Class II', urgent: false })).toHaveLength(1)
    expect(checkRecallLetter({ ...good, recallClass: 'Class III', urgent: false })).toEqual([])
  })

  it('names each missing element', () => {
    const out = checkRecallLetter({ ...good, lots: [], hazard: '', instructions: [], contact: '' })
    expect(out).toHaveLength(4)
  })
})

describe('recall counts', () => {
  it('passes when product and consignee counts reconcile', () => {
    expect(
      checkRecallCounts({
        product: { distributed: 6200, recovered: 5100, outstanding: 1100 },
        consignees: { total: 42, notified: 42, responded: 37, withProduct: 19 },
      }),
    ).toEqual([])
  })

  it('flags product that does not add up and impossible consignee counts', () => {
    const out = checkRecallCounts({
      product: { distributed: 6200, recovered: 5100, outstanding: 900 },
      consignees: { total: 40, notified: 42, responded: 43 },
    })
    expect(out.map((p) => p.message).join(' ')).toMatch(/not recovered/)
    expect(out).toHaveLength(3)
  })
})
