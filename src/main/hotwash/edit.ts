// Saving transcript edits (#425). The renderer sends the whole transcript with the revision
// it loaded; main keeps what the editor may not change: the model output of known segments,
// redactions (a redacted segment stays redacted, with no text and no quote mark), the
// redaction log and the transcription progress.
import type { Transcript, TranscriptSegment } from '@shared/schemas/hotwash'
import { AppError } from '../lib/errors'

export const REDACTED_TEXT = '[redacted]'

function keepProtected(
  incoming: TranscriptSegment,
  known: TranscriptSegment | undefined,
): TranscriptSegment {
  if (!known) return { ...incoming, redacted: false }
  if (known.redacted) {
    const { quote: _q, ...rest } = known
    return { ...rest, text: REDACTED_TEXT, originalText: REDACTED_TEXT, redacted: true }
  }
  return { ...incoming, originalText: known.originalText, redacted: false }
}

/** The transcript to write for an editor save; CONFLICT when someone saved since. */
export function applyEditorSave(
  current: Transcript | undefined,
  incoming: Transcript,
  revision: number,
  at: string,
): Transcript {
  if (!current) throw new AppError('NOT_FOUND', 'This recording has no transcript yet.')
  if (incoming.id !== current.id || incoming.recordingId !== current.recordingId)
    throw new AppError('VALIDATION', 'The transcript does not belong to this recording.')
  if (revision !== current.revision)
    throw new AppError(
      'CONFLICT',
      'The transcript changed since you opened it (for example, transcription added more). Reload to see the latest version.',
    )
  const known = new Map(current.segments.map((s) => [s.id, s]))
  const segments = incoming.segments.map((s) => keepProtected(s, known.get(s.id)))
  // A redacted segment cannot be removed by an edit (merge, delete): it stays as a marker.
  const kept = new Set(segments.map((s) => s.id))
  for (const s of current.segments)
    if (s.redacted && !kept.has(s.id)) segments.push(keepProtected(s, s))
  segments.sort((a, b) => a.startSec - b.startSec)
  return {
    ...current,
    segments,
    updatedAt: at,
  }
}

/** Redact one segment: its text and model output are replaced and its quote mark dropped. */
export function applyRedaction(
  current: Transcript | undefined,
  segmentId: string,
  at: string,
): Transcript {
  if (!current) throw new AppError('NOT_FOUND', 'This recording has no transcript yet.')
  const target = current.segments.find((s) => s.id === segmentId)
  if (!target) throw new AppError('NOT_FOUND', 'That segment is not in the transcript.')
  const segments = current.segments.map((s) => {
    if (s.id !== segmentId) return s
    const { quote: _q, speaker: _sp, ...rest } = s
    return { ...rest, text: REDACTED_TEXT, originalText: REDACTED_TEXT, redacted: true }
  })
  return {
    ...current,
    segments,
    updatedAt: at,
    redactions: [...current.redactions, { at, segmentId, kind: 'text' as const }],
  }
}
