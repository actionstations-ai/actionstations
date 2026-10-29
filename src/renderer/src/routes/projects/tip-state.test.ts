import { describe, expect, it } from 'vitest'
import { advance, currentTip, wrapIndex } from './tip-state'

describe('tip position', () => {
  it('shows the stored position while it is in range', () => {
    expect(wrapIndex(3, 5)).toBe(3)
    expect(currentTip(['a', 'b', 'c'], 2)).toBe('c')
  })

  it('starts over at the first tip when the stored position is out of range', () => {
    expect(wrapIndex(7, 5)).toBe(0)
    expect(wrapIndex(-1, 5)).toBe(0)
    expect(currentTip(['a', 'b'], 9)).toBe('a')
  })

  it('advances one tip at a time and wraps at the end', () => {
    expect(advance(0, 3)).toBe(1)
    expect(advance(2, 3)).toBe(0)
    expect(advance(10, 3)).toBe(1)
  })

  it('has nothing to show with no tips', () => {
    expect(currentTip([], 0)).toBeNull()
    expect(advance(0, 0)).toBe(0)
  })
})
