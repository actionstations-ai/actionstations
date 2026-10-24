import { describe, expect, it } from 'vitest'
import { lineCount, paginate, rowGroups } from './paginate'

const ids = (pages: ReturnType<typeof paginate>) =>
  pages.map((p) =>
    p.groups.map(
      (g) => `${g.key}${g.continued ? '+' : ''}:${g.rows.map((r) => r.number).join(',')}`,
    ),
  )

describe('paper template pagination (#331)', () => {
  it('counts wrapped lines, explicit newlines included', () => {
    expect(lineCount('', 10)).toBe(1)
    expect(lineCount('x'.repeat(25), 10)).toBe(3)
    expect(lineCount('a\nb\n' + 'x'.repeat(11), 10)).toBe(4)
    expect(lineCount(undefined, 10)).toBe(1)
  })

  it('estimates row heights from the longest wrapped column, with a minimum', () => {
    const [g] = rowGroups([{ purpose: 'short' }, { purpose: 'x'.repeat(100) }], {
      key: 't',
      min: 38,
      line: 14,
      pad: 8,
      wrap: 'purpose:40',
    })
    expect(g!.rows.map((r) => r.cost)).toEqual([38, 8 + 14 * 3])
  })

  it('keeps everything on one page when it fits', () => {
    const groups = rowGroups([1, 2, 3], { key: 'a', heading: 50, min: 20 })
    const pages = paginate(groups, 200, 300)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ number: 1, total: 1, first: true, last: true })
    expect(ids(pages)).toEqual([['a:1,2,3']])
  })

  it('continues a list on later pages with the heading repeated and marked continued', () => {
    const groups = [
      ...rowGroups([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { key: 'a', heading: 40, min: 20 }),
      ...rowGroups('First paragraph.\n\nSecond paragraph.', { key: 'notes', heading: 30, min: 40 }),
    ]
    // Page 1: 40 + 3×20 = 100 ≤ 110. Later pages: 40 + 6×20 = 160 ≤ 170; notes need 30 + 40.
    const pages = paginate(groups, 110, 170)
    expect(ids(pages)).toEqual([['a:1,2,3'], ['a+:4,5,6,7,8,9'], ['a+:10', 'notes:1,2']])
    expect(pages.map((p) => p.groups.map((g) => g.continues))).toEqual([
      [true],
      [true],
      [false, false],
    ])
    expect(pages.map((p) => [p.number, p.total, p.first, p.last])).toEqual([
      [1, 3, true, false],
      [2, 3, false, false],
      [3, 3, false, true],
    ])
  })

  it('starts a group with at least two rows on the page', () => {
    const groups = [
      ...rowGroups([1, 2], { key: 'a', min: 40 }),
      ...rowGroups([1, 2, 3], { key: 'b', heading: 20, min: 30 }),
    ]
    // 80 used; b needs 20 + 30 + 30 = 80 > 140 - 80 although one row would fit.
    expect(ids(paginate(groups, 140, 140))).toEqual([['a:1,2'], ['b:1,2,3']])
  })

  it('never leaves a heading alone at the bottom of a page', () => {
    const groups = [
      ...rowGroups([1, 2], { key: 'a', min: 40 }),
      ...rowGroups([1], { key: 'b', heading: 30, min: 40 }),
    ]
    // 80 used; b needs 30 + 40 = 70 > 100 - 80, so it starts on page 2 with its heading.
    expect(ids(paginate(groups, 100, 100))).toEqual([['a:1,2'], ['b:1']])
  })

  it('splits nested sections into one group each and keeps empty kept groups', () => {
    const sections = [
      { heading: 'A', items: [{ v: 1 }, { v: 2 }] },
      { heading: 'B', items: [{ v: 3 }] },
    ]
    const groups = [
      ...rowGroups(sections, { key: 'sec', nested: 'items', heading: 30, min: 20 }),
      ...rowGroups([], { key: 'chain', heading: 50, keep: true }),
    ]
    const pages = paginate(groups, 1000, 1000)
    expect(ids(pages)).toEqual([['sec:1,2', 'sec:1', 'chain:']])
    expect(pages[0]!.groups[1]!.section).toEqual(sections[1])
    expect(rowGroups([], { key: 'x' })).toEqual([])
    expect(rowGroups(undefined, { key: 'x' })).toEqual([])
  })

  it('always returns at least one page', () => {
    expect(paginate([], 100, 100)).toEqual([
      { number: 1, total: 1, first: true, last: true, groups: [] },
    ])
  })
})
