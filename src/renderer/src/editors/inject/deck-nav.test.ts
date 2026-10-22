import { describe, expect, it } from 'vitest'
import { nextDeckIndex } from './deck-nav'

describe('nextDeckIndex (10 cards, 3 columns)', () => {
  const move = (from: number, key: string) => nextDeckIndex(from, key, 10, 3)

  it('Left/Right step through cards in reading order and stop at the ends', () => {
    expect(move(2, 'ArrowRight')).toBe(3)
    expect(move(3, 'ArrowLeft')).toBe(2)
    expect(move(9, 'ArrowRight')).toBe(9)
    expect(move(0, 'ArrowLeft')).toBe(0)
  })

  it('Up/Down move one visual row and stay put when there is no card there', () => {
    expect(move(1, 'ArrowDown')).toBe(4)
    expect(move(4, 'ArrowUp')).toBe(1)
    expect(move(8, 'ArrowDown')).toBe(8)
    expect(move(2, 'ArrowUp')).toBe(2)
  })

  it('Home/End jump to the first and last card; other keys are not handled', () => {
    expect(move(5, 'Home')).toBe(0)
    expect(move(5, 'End')).toBe(9)
    expect(move(5, 'a')).toBeUndefined()
    expect(nextDeckIndex(0, 'ArrowDown', 0, 3)).toBeUndefined()
  })

  it('treats a missing or bogus column count as one column', () => {
    expect(nextDeckIndex(1, 'ArrowDown', 10, 0)).toBe(2)
  })
})
