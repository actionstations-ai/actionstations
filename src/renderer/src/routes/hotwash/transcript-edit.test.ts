// Transcript editor reducers (#425 FR-10): text, speaker, quotes, merge, split, filters.
import { describe, expect, it } from 'vitest'
import { Transcript, type TranscriptSegment } from '@shared/schemas/hotwash'
import {
  canMerge,
  filterSegments,
  isEdited,
  mergeWithNext,
  parseRowIds,
  setQuoteLinks,
  setQuoted,
  setSpeaker,
  setText,
  splitAt,
} from './transcript-edit'

const AT = '2026-10-28T14:30:00.000Z'
const seg = (id: string, start: number, text: string, extra: Partial<TranscriptSegment> = {}) => ({
  id,
  startSec: start,
  endSec: start + 4,
  text,
  originalText: text,
  redacted: false,
  lowConfidence: false,
  ...extra,
})
const t0 = () =>
  Transcript.parse({
    id: 'T1',
    recordingId: 'R1',
    model: 'whisper-base',
    providerId: 'local-whisper',
    language: 'en',
    createdAt: AT,
    updatedAt: AT,
    segments: [
      seg('a', 0, 'We lost twenty minutes.'),
      seg('b', 4, 'Nobody knew who calls the airlines.'),
      seg('c', 8, '[redacted]', { redacted: true, originalText: '[redacted]' }),
    ],
  })

describe('transcript edits', () => {
  it('edits text but keeps the model output, and marks it edited', () => {
    const t = setText(t0(), 'a', 'We lost 20 minutes.')
    expect(t.segments[0]).toMatchObject({
      text: 'We lost 20 minutes.',
      originalText: 'We lost twenty minutes.',
    })
    expect(isEdited(t.segments[0]!)).toBe(true)
    expect(isEdited(t.segments[1]!)).toBe(false)
  })

  it('never edits a redacted segment', () => {
    const before = t0()
    const t = setQuoted(setText(before, 'c', 'secret'), 'c', true)
    expect(t.segments[2]).toEqual(before.segments[2])
  })

  it('sets and clears the speaker', () => {
    let t = setSpeaker(t0(), 'a', { label: ' Ops Director ', roleId: 'ops' })
    expect(t.segments[0]!.speaker).toEqual({ label: 'Ops Director', roleId: 'ops' })
    t = setSpeaker(t, 'a', { label: '  ' })
    expect(t.segments[0]!.speaker).toBeUndefined()
  })

  it('marks a quote, links it, and unmarking drops the links', () => {
    let t = setQuoted(t0(), 'b', true)
    t = setQuoteLinks(t, 'b', { objectiveIds: ['OBJ2'], rowIds: parseRowIds('I-07, I-09;I-07') })
    expect(t.segments[1]!.quote).toEqual({ objectiveIds: ['OBJ2'], rowIds: ['I-07', 'I-09'] })
    t = setQuoteLinks(t, 'b', { capability: '' })
    expect(t.segments[1]!.quote).not.toHaveProperty('capability')
    t = setQuoted(t, 'b', false)
    expect(t.segments[1]!.quote).toBeUndefined()
  })

  it('merges with the next segment, joining times, texts and model outputs', () => {
    const t = mergeWithNext(setQuoted(t0(), 'b', true), 'a')
    expect(t.segments).toHaveLength(2)
    expect(t.segments[0]).toMatchObject({
      id: 'a',
      startSec: 0,
      endSec: 8,
      text: 'We lost twenty minutes. Nobody knew who calls the airlines.',
      originalText: 'We lost twenty minutes. Nobody knew who calls the airlines.',
      quote: { objectiveIds: [], rowIds: [] },
    })
  })

  it('does not merge into a redacted segment', () => {
    expect(canMerge(t0(), 'b')).toBe(false)
    expect(mergeWithNext(t0(), 'b')).toEqual(t0())
    expect(canMerge(t0(), 'c')).toBe(false)
  })

  it('splits at a character, sharing the time by text length', () => {
    const t = splitAt(setQuoted(t0(), 'b', true), 'b', 'Nobody knew'.length, 'b2')
    expect(t.segments.map((s) => [s.id, s.text, s.startSec, s.endSec])).toEqual([
      ['a', 'We lost twenty minutes.', 0, 4],
      ['b', 'Nobody knew', 4, 5.26],
      ['b2', 'who calls the airlines.', 5.26, 8],
      ['c', '[redacted]', 8, 12],
    ])
    expect(t.segments[1]!.quote).toBeDefined()
    expect(t.segments[2]!.quote).toBeUndefined()
    expect(t.segments[2]!.originalText).toBe('')
    expect(splitAt(t0(), 'b', 0, 'x')).toEqual(t0())
  })

  it('filters by quotes, edits and search text', () => {
    const t = setText(setQuoted(t0(), 'b', true), 'a', 'We lost 20 minutes.')
    expect(filterSegments(t.segments, 'quotes', '').map((s) => s.id)).toEqual(['b'])
    expect(filterSegments(t.segments, 'edited', '').map((s) => s.id)).toEqual(['a'])
    expect(filterSegments(t.segments, 'all', 'AIRLINES').map((s) => s.id)).toEqual(['b'])
  })
})
