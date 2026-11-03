import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findLoop, StreamGuard, streamGuardOption } from './stream-guard'

const OPTIONS = { firstTokenMs: 600_000, stallMs: 60_000, loopMinChars: 400, loopMinRepeats: 5 }

describe('streamGuardOption', () => {
  it('is off unless every limit is a positive number', () => {
    expect(streamGuardOption(undefined)).toBeUndefined()
    expect(streamGuardOption({})).toBeUndefined()
    expect(streamGuardOption({ streamGuard: { ...OPTIONS, stallMs: 0 } })).toBeUndefined()
    expect(streamGuardOption({ streamGuard: { ...OPTIONS, stallMs: 'x' } })).toBeUndefined()
    expect(streamGuardOption({ streamGuard: OPTIONS })).toEqual(OPTIONS)
  })
})

describe('findLoop', () => {
  it('finds a sentence repeated to the end of the text', () => {
    const unit = 'The valve stays closed until the operator confirms. '
    const loop = findLoop('Intro text. ' + unit.repeat(12), 400, 5)
    expect(loop?.unit.trim().length).toBeGreaterThan(0)
    expect(loop?.repeats).toBeGreaterThanOrEqual(5)
  })

  it('finds a single character repeated far enough', () => {
    expect(findLoop('data ' + '.'.repeat(500), 400, 5)).toBeDefined()
  })

  it('leaves ordinary prose, short repeats and blank runs alone', () => {
    const prose = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} says something new.`)
    expect(findLoop(prose.join(' '), 400, 5)).toBeUndefined()
    expect(findLoop('abc'.repeat(20), 400, 5)).toBeUndefined()
    expect(findLoop('{' + ' '.repeat(900), 400, 5)).toBeUndefined()
  })

  it('does not call text a loop once the repeat has ended', () => {
    const unit = 'Repeat this line please. '
    const text = unit.repeat(30) + 'and then the model moved on to something else entirely.'
    expect(findLoop(text, 400, 5)).toBeUndefined()
  })
})

describe('StreamGuard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('lets a slow reply run for as long as tokens keep arriving', () => {
    const guard = new StreamGuard(OPTIONS)
    guard.arm()
    vi.advanceTimersByTime(9 * 60_000)
    guard.token('first words ')
    for (let i = 0; i < 100; i++) {
      vi.advanceTimersByTime(50_000)
      guard.token(`word${i} `)
    }
    expect(guard.tripped).toBeUndefined()
    expect(guard.signal.aborted).toBe(false)
    guard.stop()
  })

  it('stops when the prompt is read for longer than the first-token window', () => {
    const guard = new StreamGuard(OPTIONS)
    guard.arm()
    vi.advanceTimersByTime(600_000)
    expect(guard.signal.aborted).toBe(true)
    expect(guard.tripped?.message).toMatch(/stalled: no output for 600 s while the prompt was read/)
  })

  it('stops when no token arrives for the stall window and keeps the raw tail', () => {
    const guard = new StreamGuard(OPTIONS)
    guard.arm()
    guard.token('{"rows":[{"id":"I-01","event":"The pump trips and')
    vi.advanceTimersByTime(60_000)
    expect(guard.signal.aborted).toBe(true)
    expect(guard.tripped?.message).toMatch(/no new output for 60 s after the reply started/)
    expect(guard.tripped?.message).toContain('The pump trips and')
    expect(guard.tripped?.details).toMatchObject({ guard: 'stall' })
  })

  it('stops a reply that repeats itself and records the tail', () => {
    const guard = new StreamGuard(OPTIONS)
    guard.arm()
    for (let i = 0; i < 20; i++) guard.token('Notify the county health office immediately. ')
    expect(guard.signal.aborted).toBe(true)
    expect(guard.tripped?.message).toMatch(/looped: repeating the same text/)
    expect((guard.tripped?.details as { tail: string }).tail).toContain('county health office')
  })
})
