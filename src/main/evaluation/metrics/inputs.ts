// Where metric inputs come from (spec 0448 FR-12, FR-13). Both readers are adapters over plain
// data so this module depends on neither the case-data store nor the structured-decision frames:
// ground truth is read from a JSON dataset (an array of events, or `{ "events": [...] }`), and
// decisions from session log entries that carry a structured decision in `data.structured`.
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import {
  GroundTruthEvent,
  MetricDecision,
  ModeledSeries,
  type GroundTruthEvent as GroundTruth,
} from '@shared/schemas/metrics'
import { AppError } from '../../lib/errors'
import { safeJoin } from '../../lib/fs'

const EventFile = z.union([
  z.array(GroundTruthEvent),
  z.object({ events: z.array(GroundTruthEvent) }).transform((o) => o.events),
])

/** Read ground-truth events from a dataset file inside `caseDir` (never outside it). */
export async function readGroundTruth(
  caseDir: string,
  datasetPath: string,
): Promise<GroundTruth[]> {
  const file = safeJoin(caseDir, datasetPath)
  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      throw new AppError('NOT_FOUND', `Ground-truth dataset not found: ${datasetPath}`)
    throw e
  }
  const parsed = EventFile.safeParse(JSON.parse(text))
  if (!parsed.success)
    throw new AppError('VALIDATION', `Ground-truth dataset ${datasetPath} is not a list of events`)
  return parsed.data
}

const SeriesFile = z.union([
  z.array(ModeledSeries),
  z.object({ series: z.array(ModeledSeries) }).transform((o) => o.series),
])

/** Read modeled series (one per zone) from a dataset file inside `caseDir`. */
export async function readModeledSeries(
  caseDir: string,
  datasetPath: string,
): Promise<ModeledSeries[]> {
  const file = safeJoin(caseDir, datasetPath)
  const parsed = SeriesFile.safeParse(JSON.parse(await fs.readFile(file, 'utf8')))
  if (!parsed.success)
    throw new AppError('VALIDATION', `Series dataset ${datasetPath} is not a list of series`)
  return parsed.data
}

/** The slice of a session log entry the adapter reads. */
export interface LogEntryLike {
  i: number
  at: string
  kind: string
  data: Record<string, unknown>
}

const Structured = z.object({
  kind: z.string().min(1),
  area: z.string().optional(),
  fields: z.record(z.string(), z.unknown()).default({}),
  /** When the decision took effect, if the form recorded a time other than the entry's. */
  time: z.string().optional(),
})

/**
 * Timestamped decisions from log entries that carry `data.structured`. An entry without it is
 * skipped; an entry whose structured part does not fit is skipped too, never guessed at.
 */
export function decisionsFromLog(entries: LogEntryLike[]): MetricDecision[] {
  const out: MetricDecision[] = []
  for (const e of entries) {
    const parsed = Structured.safeParse(e.data.structured)
    if (!parsed.success) continue
    const d = MetricDecision.safeParse({
      id: `log:${e.i}`,
      time: parsed.data.time ?? e.at,
      kind: parsed.data.kind,
      ...(parsed.data.area ? { area: parsed.data.area } : {}),
      fields: parsed.data.fields,
    })
    if (d.success) out.push(d.data)
  }
  return out
}
