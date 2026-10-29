// Hot wash transcripts as an AAR source (#425 → #419). Quotes (and, when asked, every other
// segment) come back with a T<n> cite key, recording time, wall clock and links, numbered
// across the scenario's recordings in the order they were made. Redacted segments are never
// returned, so a redaction keeps that text out of every prompt.
import type {
  AarTranscriptCite,
  HotwashRecording,
  Transcript,
  TranscriptSegment,
} from '@shared/schemas/hotwash'
import { hhmm, recordingClock as clock, wallTimeAt } from '@shared/hotwash-time'
import { listHotwash } from './store'

function cite(
  n: number,
  rec: HotwashRecording,
  t: Transcript,
  s: TranscriptSegment,
): AarTranscriptCite {
  const wall = wallTimeAt(rec, s.startSec)
  return {
    citeKey: `T${n}`,
    ref: `transcript:${t.id}#${s.id}`,
    recordingTitle: rec.title,
    at: clock(s.startSec),
    ...(wall ? { wallClock: hhmm(wall) } : {}),
    ...(s.speaker?.label ? { speakerLabel: s.speaker.label } : {}),
    text: s.text,
    quote: !!s.quote,
    objectiveIds: s.quote?.objectiveIds ?? [],
    rowIds: s.quote?.rowIds ?? [],
    ...(s.quote?.capability ? { capability: s.quote.capability } : {}),
  }
}

/** The AAR input for a scenario: marked quotes, or every non-redacted segment. */
export async function transcriptsForAar(
  root: string,
  scenarioId: string,
  quotesOnly = true,
): Promise<AarTranscriptCite[]> {
  const { recordings, transcripts } = await listHotwash(root, scenarioId)
  const byRecording = new Map(transcripts.map((t) => [t.recordingId, t]))
  const ordered = [...recordings].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const out: AarTranscriptCite[] = []
  for (const rec of ordered) {
    const t = byRecording.get(rec.id)
    if (!t) continue
    for (const s of t.segments) {
      if (s.redacted || (quotesOnly && !s.quote)) continue
      out.push(cite(out.length + 1, rec, t, s))
    }
  }
  return out
}
