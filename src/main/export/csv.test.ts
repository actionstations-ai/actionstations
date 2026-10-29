import { describe, expect, it } from 'vitest'
import { CSV_BOM, csvCell, toCsv } from './csv'

describe('csvCell', () => {
  it('leaves plain text alone', () => expect(csvCell('hello')).toBe('hello'))

  it('quotes commas, quotes and line breaks, doubling quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('one\ntwo')).toBe('"one\ntwo"')
  })

  it.each(['=1+1', '+SUM(A1)', '-2', '@cmd'])('guards the formula start %j', (v) => {
    expect(csvCell(v)).toBe(`'${v}`)
  })

  it('writes empty for undefined and null, and numbers as text', () => {
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(null)).toBe('')
    expect(csvCell(12)).toBe('12')
  })
})

describe('toCsv', () => {
  it('starts with a byte order mark and ends rows with CRLF', () => {
    const out = toCsv(['a', 'b'], [[1, 'x,y']])
    expect(out.startsWith(CSV_BOM)).toBe(true)
    expect(out.slice(1)).toBe('a,b\r\n1,"x,y"\r\n')
  })
})
