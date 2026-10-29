// Record lines from sources that are computed elsewhere: the tracker report (#428), the
// regulatory clock results (#426) and the marked hot wash quotes (#425). Pure mappers first, then
// one reader that never lets a damaged source stop the draft (a warning says what was skipped).
import type { CoverageClock } from '@shared/compliance/coverage'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { TrackerReport as TrackerReportSchema } from '@shared/ipc/tracker'
import type { z } from 'zod'
import { trackerReport } from '@shared/facilitator/tracker'
import type { RecordLine } from '@shared/schemas/aar'
import type { AarTranscriptCite } from '@shared/schemas/hotwash'
import type { Scenario } from '@shared/schemas/scenario'
import { scenarioCoverage } from '../../compliance/coverage'
import { transcriptsForAar } from '../../hotwash/aar'

const MAX_LINES = 500

/** Unanswered injects, response times and commitments; refs `trk:R1`, `trk:U-I-07`, `trk:P1`. */
export function trackerLines(report: z.infer<typeof TrackerReportSchema>): RecordLine[] {
  const responses = report.responses.map((r) => ({
    ref: `trk:${r.cite}`,
    meta: r.rowId,
    text: `Answered ${r.rowId} ${r.responseMin} minute(s) after it was delivered${r.note ? `: ${r.note}` : ''}`,
  }))
  const unanswered = report.unanswered.map((rowId) => ({
    ref: `trk:U-${rowId}`,
    meta: rowId,
    text: `No response was recorded to ${rowId}, which expects one`,
  }))
  const commitments = report.commitments.map((c) => ({
    ref: `trk:${c.cite}`,
    meta: c.owner,
    text: `Commitment by ${c.owner || 'a player'}: ${c.text} (${c.status})`,
  }))
  return [...responses, ...unanswered, ...commitments].slice(0, MAX_LINES)
}

/** Clocks that started, with their result; refs `clk:K1`. */
export function clockLines(clocks: readonly CoverageClock[]): RecordLine[] {
  return clocks
    .filter((c) => c.triggeredAt)
    .map((c) => {
      const when = [
        `started ${c.triggeredAt}`,
        c.dueAt ? `due ${c.dueAt}` : '',
        c.filedAt ? `filed ${c.filedAt}` : '',
      ].filter(Boolean)
      return {
        ref: `clk:${c.cite}`,
        meta: c.regulation,
        text: `${c.clock} to ${c.recipient || 'the regulator'}: ${c.resultLabel} (${when.join(', ')})${c.note ? `. ${c.note}` : ''}`,
      }
    })
    .slice(0, MAX_LINES)
}

/** Marked quotes with their recording time and speaker label; refs `tr:T1`. */
export function transcriptLines(cites: readonly AarTranscriptCite[]): RecordLine[] {
  return cites.slice(0, MAX_LINES).map((c) => ({
    ref: `tr:${c.citeKey}`,
    meta: [c.recordingTitle, c.wallClock ?? c.at, c.speakerLabel].filter(Boolean).join(' · '),
    text: c.text,
  }))
}

export interface DerivedParts {
  tracker: RecordLine[]
  clocks: RecordLine[]
  transcripts: RecordLine[]
}

async function attempt<T>(label: string, warnings: string[], read: () => Promise<T>, empty: T) {
  try {
    return await read()
  } catch (e) {
    warnings.push(`${label} could not be read: ${(e as Error).message}`)
    return empty
  }
}

/** Read the three derived sources for a scenario. */
export async function readDerived(
  root: string,
  scenario: Scenario,
  state: FacilitatorState,
  warnings: string[],
): Promise<DerivedParts> {
  const [clocks, transcripts] = await Promise.all([
    attempt(
      'Regulatory clocks',
      warnings,
      async () => (await scenarioCoverage(root, scenario.id)).clocks,
      [],
    ),
    attempt('Hot wash transcripts', warnings, () => transcriptsForAar(root, scenario.id, true), []),
  ])
  return {
    tracker: trackerLines(trackerReport({ msel: scenario.msel, state, minutes: 0 })),
    clocks: clockLines(clocks),
    transcripts: transcriptLines(transcripts),
  }
}
