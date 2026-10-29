// Transcript editor reducers (#425 FR-10). Pure functions over the transcript: text, speaker,
// quote marks and links, merge and split. Model output (`originalText`) is never changed by an
// edit; main keeps it and refuses edits to redacted segments when the transcript is saved.
import type { Transcript, TranscriptQuote, TranscriptSegment } from '@shared/schemas/hotwash'

type Seg = TranscriptSegment

function mapSegment(t: Transcript, id: string, fn: (s: Seg) => Seg): Transcript {
  return { ...t, segments: t.segments.map((s) => (s.id === id && !s.redacted ? fn(s) : s)) }
}

export function setText(t: Transcript, id: string, text: string): Transcript {
  return mapSegment(t, id, (s) => ({ ...s, text }))
}

export function setSpeaker(
  t: Transcript,
  id: string,
  speaker: { label: string; roleId?: string } | undefined,
): Transcript {
  return mapSegment(t, id, (s) => {
    const { speaker: _old, ...rest } = s
    const label = speaker?.label.trim()
    return label
      ? { ...rest, speaker: { label, ...(speaker?.roleId ? { roleId: speaker.roleId } : {}) } }
      : rest
  })
}

/** Mark a segment as a quote for the AAR, or unmark it (its links go with the mark). */
export function setQuoted(t: Transcript, id: string, quoted: boolean): Transcript {
  return mapSegment(t, id, (s) => {
    const { quote: _old, ...rest } = s
    return quoted ? { ...rest, quote: s.quote ?? { objectiveIds: [], rowIds: [] } } : rest
  })
}

export function setQuoteLinks(
  t: Transcript,
  id: string,
  patch: Partial<TranscriptQuote>,
): Transcript {
  return mapSegment(t, id, (s) => {
    if (!s.quote) return s
    const next: TranscriptQuote = { ...s.quote, ...patch }
    if (!next.capability) delete next.capability
    if (!next.note) delete next.note
    return { ...s, quote: next }
  })
}

/** Row ids typed as "I-07, I-09" → ["I-07", "I-09"]. */
export function parseRowIds(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 50)
}

export function canMerge(t: Transcript, id: string): boolean {
  const i = t.segments.findIndex((s) => s.id === id)
  const a = t.segments[i]
  const b = t.segments[i + 1]
  return !!a && !!b && !a.redacted && !b.redacted
}

/** Join a segment with the next one: times span both, texts and model outputs are joined. */
export function mergeWithNext(t: Transcript, id: string): Transcript {
  if (!canMerge(t, id)) return t
  const i = t.segments.findIndex((s) => s.id === id)
  const a = t.segments[i]!
  const b = t.segments[i + 1]!
  const merged: Seg = {
    ...a,
    endSec: Math.max(a.endSec, b.endSec),
    text: `${a.text} ${b.text}`.trim(),
    originalText: `${a.originalText} ${b.originalText}`.trim(),
    lowConfidence: a.lowConfidence || b.lowConfidence,
    ...(a.speaker || b.speaker ? { speaker: (a.speaker ?? b.speaker)! } : {}),
    ...(a.quote || b.quote ? { quote: (a.quote ?? b.quote)! } : {}),
  }
  return { ...t, segments: [...t.segments.slice(0, i), merged, ...t.segments.slice(i + 2)] }
}

/**
 * Split a segment at a character position. The time is divided in proportion to the text;
 * the first part keeps the model output, speaker and quote mark, the second part starts
 * unmarked with no model output of its own.
 */
export function splitAt(t: Transcript, id: string, at: number, newId: string): Transcript {
  const i = t.segments.findIndex((s) => s.id === id)
  const s = t.segments[i]
  if (!s || s.redacted) return t
  const head = s.text.slice(0, at).trim()
  const tail = s.text.slice(at).trim()
  if (!head || !tail) return t
  const share = Math.min(1, Math.max(0, at / Math.max(1, s.text.length)))
  const cut = Math.round((s.startSec + (s.endSec - s.startSec) * share) * 100) / 100
  const first: Seg = { ...s, text: head, endSec: cut }
  const { quote: _q, ...rest } = s
  const second: Seg = { ...rest, id: newId, text: tail, originalText: '', startSec: cut }
  return { ...t, segments: [...t.segments.slice(0, i), first, second, ...t.segments.slice(i + 1)] }
}

/** The text differs from what the model wrote (a split-off part has no model text). */
export const isEdited = (s: Seg): boolean =>
  !s.redacted && s.originalText !== '' && s.text !== s.originalText

export type SegmentFilter = 'all' | 'quotes' | 'edited'

export function filterSegments(segments: Seg[], filter: SegmentFilter, search: string): Seg[] {
  const q = search.trim().toLowerCase()
  return segments.filter(
    (s) =>
      (filter === 'all' || (filter === 'quotes' ? !!s.quote : isEdited(s))) &&
      (!q || s.text.toLowerCase().includes(q) || s.speaker?.label.toLowerCase().includes(q)),
  )
}
