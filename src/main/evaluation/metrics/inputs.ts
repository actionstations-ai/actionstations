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

/**
 * Events carried as text entries (the case data `reports` shape, so every reader of case data
 * still reads the file): the entry's time is the event time and its text is JSON with the event's
 * `id`, `kind`, optional `area` and `attrs`. An entry that does not parse is left out.
 */
const EventsAsText = z
  .array(z.object({ t: z.string(), title: z.string().optional(), text: z.string() }))
  .transform((entries) =>
    entries.flatMap((e, i) => {
      try {
        const o = JSON.parse(e.text) as Record<string, unknown>
        const parsed = GroundTruthEvent.safeParse({
          id: o.id ?? e.title ?? `event-${i + 1}`,
          time: e.t,
          kind: o.kind,
          ...(typeof o.area === 'string' ? { area: o.area } : {}),
          attrs: o.attrs ?? {},
        })
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    }),
  )

const EventFile = z.union([
  z.array(GroundTruthEvent),
  z.object({ events: z.array(GroundTruthEvent) }).transform((o) => o.events),
  EventsAsText,
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
  /** A name, or the recorded area of a decision (`{ id?, name, polygon? }`): its name is used. */
  area: z
    .union([z.string(), z.object({ name: z.string() })])
    .transform((a) => (typeof a === 'string' ? a : a.name))
    .optional(),
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
