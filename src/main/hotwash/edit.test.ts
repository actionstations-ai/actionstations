// Saving transcript edits (#425): stale revisions refused, model output and redactions kept.
import { describe, expect, it } from 'vitest'
import { Transcript, type TranscriptSegment } from '@shared/schemas/hotwash'
import { REDACTED_TEXT, applyEditorSave, applyRedaction } from './edit'

const AT = '2026-10-28T14:30:00.000Z'
const seg = (
  id: string,
  text: string,
  extra: Partial<TranscriptSegment> = {},
): TranscriptSegment => ({
  id,
  startSec: Number(id.slice(1)) * 5,
  endSec: Number(id.slice(1)) * 5 + 4,
  text,
  originalText: text,
  redacted: false,
  lowConfidence: false,
  ...extra,
})

const transcript = (segments: TranscriptSegment[], revision = 3) =>
  Transcript.parse({
    id: 'T1',
    recordingId: 'R1',
    model: 'whisper-base',
    providerId: 'local-whisper',
    language: 'en',
    createdAt: AT,
    updatedAt: AT,
    doneUntilSec: 30,
    complete: true,
    revision,
    segments,
    futureField: { kept: true },
  })

describe('applyEditorSave', () => {
  it('saves edited text, speaker and quote marks but never the model output', () => {
    const cur = transcript([seg('s1', 'We lost twenty minutes.'), seg('s2', 'Nobody knew.')])
    const incoming = transcript([
      {
        ...seg('s1', 'We lost 20 minutes.'),
        originalText: 'tampered',
        speaker: { label: 'Ops Director' },
        quote: { objectiveIds: ['OBJ2'], rowIds: ['I-07'] },
      },
      seg('s2', 'Nobody knew.'),
    ])
    const out = applyEditorSave(cur, incoming, 3, AT)
    expect(out.segments[0]).toMatchObject({
      text: 'We lost 20 minutes.',
      originalText: 'We lost twenty minutes.',
      speaker: { label: 'Ops Director' },
      quote: { objectiveIds: ['OBJ2'], rowIds: ['I-07'] },
    })
    expect((out as Record<string, unknown>).futureField).toEqual({ kept: true })
  })

  it('refuses a save made from an older revision', () => {
    const cur = transcript([seg('s1', 'a')], 5)
    expect(() => applyEditorSave(cur, transcript([seg('s1', 'b')]), 4, AT)).toThrow(
      expect.objectContaining({ code: 'CONFLICT' }),
    )
  })

  it('refuses a transcript of another recording', () => {
    const cur = transcript([seg('s1', 'a')])
    const other = { ...transcript([seg('s1', 'a')]), recordingId: 'R2' }
    expect(() => applyEditorSave(cur, other, 3, AT)).toThrow(/does not belong/)
  })

  it('keeps a redacted segment redacted, even when the editor drops or rewrites it', () => {
    const cur = transcript([
      seg('s1', REDACTED_TEXT, { originalText: REDACTED_TEXT, redacted: true }),
      seg('s2', 'Kept.'),
    ])
    const rewritten = applyEditorSave(
      cur,
      transcript([
        { ...seg('s1', 'the secret again'), quote: { objectiveIds: [], rowIds: [] } },
        seg('s2', 'Kept.'),
      ]),
      3,
      AT,
    )
    expect(rewritten.segments[0]).toMatchObject({ text: REDACTED_TEXT, redacted: true })
    expect(rewritten.segments[0]!.quote).toBeUndefined()
    const dropped = applyEditorSave(cur, transcript([seg('s2', 'Kept.')]), 3, AT)
    expect(dropped.segments.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('accepts new segments from a split', () => {
    const cur = transcript([seg('s1', 'One. Two.')])
    const split = transcript([
      { ...seg('s1', 'One.'), endSec: 7 },
      { ...seg('s1', 'Two.'), id: 'new1', originalText: '', startSec: 7 },
    ])
    const out = applyEditorSave(cur, split, 3, AT)
    expect(out.segments.map((s) => [s.id, s.text, s.originalText])).toEqual([
      ['s1', 'One.', 'One. Two.'],
      ['new1', 'Two.', ''],
    ])
  })
})

describe('applyRedaction', () => {
  it('replaces the text and model output, drops the quote and speaker, and logs it', () => {
    const cur = transcript([
      seg('s1', 'Call me on 555 0100.', {
        quote: { objectiveIds: [], rowIds: [] },
        speaker: { label: 'PIO' },
      }),
    ])
    const out = applyRedaction(cur, 's1', AT)
    expect(out.segments[0]).toMatchObject({
      text: REDACTED_TEXT,
      originalText: REDACTED_TEXT,
      redacted: true,
    })
    expect(out.segments[0]!.quote).toBeUndefined()
    expect(out.segments[0]!.speaker).toBeUndefined()
    expect(out.redactions).toEqual([{ at: AT, segmentId: 's1', kind: 'text' }])
    expect(JSON.stringify(out)).not.toContain('555')
  })

  it('refuses an unknown segment', () => {
    expect(() => applyRedaction(transcript([]), 'nope', AT)).toThrow(/not in the transcript/)
  })
})
