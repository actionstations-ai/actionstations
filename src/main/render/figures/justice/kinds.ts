// The justice figure kinds (spec 0465 FR-8, ADR-0131). Importing `./index` registers them.
// Each is a pure function from data; counts, times and statuses are drawn, never generated as
// pixels. Locations are building-level names only. Ids carry the field prefix.
import { z } from 'zod'
import { annotatedTimelineKind } from '../annotated-timeline'
import { barKind } from '../bar'
import type { FigureKind } from '../types'
import { renderBoard, type BoardRow } from './board'

const Name = z.string().min(1).max(80)
const Short = z.string().max(120)

// ---- CAD unit status board -------------------------------------------------------------------

const UNIT_STATES = {
  available: { state: 'ok', word: 'Available' },
  on_scene: { state: 'ok', word: 'On scene' },
  en_route: { state: 'degraded', word: 'En route' },
  staged: { state: 'degraded', word: 'Staged' },
  out_of_service: { state: 'down', word: 'Out of service' },
  unknown: { state: 'unknown', word: 'Status unknown' },
} as const

export const UnitStatusData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  units: z
    .array(
      z.object({
        unit: Name,
        agency: Name.optional(),
        status: z.enum([
          'available',
          'on_scene',
          'en_route',
          'staged',
          'out_of_service',
          'unknown',
        ]),
        location: Short.optional(),
        since: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(24),
})
export type UnitStatusData = z.infer<typeof UnitStatusData>

export const justiceUnitStatusKind: FigureKind<UnitStatusData> = {
  kind: 'justice_unit_status',
  schema: UnitStatusData,
  render(d, o) {
    const rows: BoardRow[] = d.units.map((u) => ({
      name: u.unit,
      state: UNIT_STATES[u.status].state,
      word: UNIT_STATES[u.status].word,
      detail: [u.agency, u.location, u.since ? `since ${u.since}` : ''].filter(Boolean).join('; '),
    }))
    const count = (s: keyof typeof UNIT_STATES) => d.units.filter((u) => u.status === s).length
    return renderBoard(
      {
        title: d.title ?? 'Unit status',
        asOf: d.asOf,
        nameHeader: 'Unit',
        columns: ['Unit', 'Status', 'Agency and building-level location'],
        rows,
        lead:
          `Unit status${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.units.length} units, ` +
          `${count('on_scene')} on scene, ${count('en_route')} en route, ${count('staged')} staged, ` +
          `${count('available')} available, ${count('out_of_service')} out of service.`,
      },
      o.width,
    )
  },
}

// ---- jail population and count status -----------------------------------------------------------

export const JailPopulationData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  areas: z
    .array(
      z.object({
        area: Name,
        capacity: z.number().int().min(0),
        expected: z.number().int().min(0),
        counted: z.number().int().min(0).optional(),
        countStatus: z.enum(['clear', 'not_clear', 'pending']),
        note: Short.optional(),
      }),
    )
    .min(1)
    .max(24),
})
export type JailPopulationData = z.infer<typeof JailPopulationData>

export const justiceJailPopulationKind: FigureKind<JailPopulationData> = {
  kind: 'justice_jail_population',
  schema: JailPopulationData,
  render(d, o) {
    const rows: BoardRow[] = d.areas.map((a) => {
      const over = a.expected > a.capacity
      const base =
        a.countStatus === 'clear'
          ? { state: 'ok' as const, word: 'Count clear' }
          : a.countStatus === 'pending'
            ? { state: 'unknown' as const, word: 'Recount pending' }
            : { state: 'down' as const, word: 'Count not clear' }
      const state = base.state === 'ok' && over ? ('degraded' as const) : base.state
      const word = base.state === 'ok' && over ? 'Over capacity' : base.word
      const counted = a.counted === undefined ? 'not counted' : `counted ${a.counted}`
      return {
        name: a.area,
        state,
        word,
        detail:
          `expected ${a.expected}, ${counted}, capacity ${a.capacity}` +
          (a.note ? `; ${a.note}` : ''),
      }
    })
    const expected = d.areas.reduce((s, a) => s + a.expected, 0)
    const counted = d.areas.reduce((s, a) => s + (a.counted ?? 0), 0)
    const open = d.areas.filter((a) => a.countStatus !== 'clear').length
    return renderBoard(
      {
        title: d.title ?? 'Population and count status',
        asOf: d.asOf,
        nameHeader: 'Housing area',
        columns: ['Housing area', 'Count status', 'Population'],
        rows,
        lead:
          `Population by housing area${d.asOf ? ` as of ${d.asOf}` : ''}: ${expected} expected, ` +
          `${counted} counted, ${open} of ${d.areas.length} areas not yet clear.`,
      },
      o.width,
    )
  },
}

// ---- court continuity board -----------------------------------------------------------------------

export const CourtContinuityData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  /** Hours since the outage began that the board is drawn for. */
  elapsedHours: z.number().min(0).max(2000),
  functions: z
    .array(
      z.object({
        function: Name,
        rtoHours: z.number().min(0).max(2000),
        status: z.enum(['running', 'degraded', 'down', 'restored']),
        restoredAtHours: z.number().min(0).max(2000).optional(),
        dependsOn: Short.optional(),
      }),
    )
    .min(1)
    .max(20),
})
export type CourtContinuityData = z.infer<typeof CourtContinuityData>

const fh = (h: number): string => `${Math.round(h * 10) / 10} h`

export const justiceCourtContinuityKind: FigureKind<CourtContinuityData> = {
  kind: 'justice_court_continuity',
  schema: CourtContinuityData.refine(
    (d) => d.functions.every((f) => f.status !== 'restored' || f.restoredAtHours !== undefined),
    { message: 'a restored function needs restoredAtHours' },
  ),
  render(d, o) {
    const rows: BoardRow[] = d.functions.map((f) => {
      const down = f.status === 'down'
      const late = down && d.elapsedHours > f.rtoHours
      const restoredLate =
        f.status === 'restored' && f.restoredAtHours !== undefined && f.restoredAtHours > f.rtoHours
      const word =
        f.status === 'restored'
          ? restoredLate
            ? 'Restored late'
            : 'Restored in time'
          : f.status === 'running'
            ? 'Running'
            : f.status === 'degraded'
              ? 'Degraded'
              : late
                ? 'Down, past objective'
                : 'Down'
      const state =
        f.status === 'running' || (f.status === 'restored' && !restoredLate)
          ? ('ok' as const)
          : f.status === 'degraded' || restoredLate
            ? ('degraded' as const)
            : ('down' as const)
      const detail =
        `objective ${fh(f.rtoHours)}` +
        (f.restoredAtHours !== undefined ? `; restored at ${fh(f.restoredAtHours)}` : '') +
        (f.dependsOn ? `; needs ${f.dependsOn}` : '')
      return { name: f.function, state, word, detail }
    })
    const down = rows.filter((r) => r.state === 'down').length
    return renderBoard(
      {
        title: d.title ?? 'Court continuity',
        asOf: d.asOf,
        nameHeader: 'Essential function',
        columns: ['Essential function', 'Status', 'Recovery time objective'],
        rows,
        lead:
          `Court continuity ${fh(d.elapsedHours)} after the outage began: ${d.functions.length} ` +
          `essential functions, ${down} down.`,
      },
      o.width,
    )
  },
}

// ---- incident timeline ---------------------------------------------------------------------------

const LANES = ['Command', 'Agencies', 'Public information', 'Families'] as const

export const IncidentTimelineData = z.object({
  title: z.string().max(200).optional(),
  /** Minutes from the first report. */
  events: z
    .array(
      z.object({
        minute: z.number().min(0).max(10000),
        label: z.string().min(1).max(120),
        lane: z.enum(LANES),
        detail: z.string().max(240).optional(),
      }),
    )
    .min(1)
    .max(30),
})
export type IncidentTimelineData = z.infer<typeof IncidentTimelineData>

export const justiceIncidentTimelineKind: FigureKind<IncidentTimelineData> = {
  kind: 'justice_incident_timeline',
  schema: IncidentTimelineData,
  defaultHeight: 380,
  render(d, o) {
    return annotatedTimelineKind.render(
      annotatedTimelineKind.schema.parse({
        title: d.title ?? 'Incident timeline',
        xLabel: 'Minutes from the first report',
        lanes: [...LANES],
        events: d.events.map((e) => ({
          x: e.minute,
          label: e.label,
          lane: e.lane,
          detail: e.detail,
        })),
      }),
      o,
    )
  },
}

// ---- court recovery timeline (Gantt) ----------------------------------------------------------------

export const CourtRecoveryData = z.object({
  title: z.string().max(200).optional(),
  functions: z
    .array(
      z.object({
        function: Name,
        downFromHours: z.number().min(0).max(2000),
        restoredAtHours: z.number().min(0).max(2000),
      }),
    )
    .min(1)
    .max(8),
})
export type CourtRecoveryData = z.infer<typeof CourtRecoveryData>

export const justiceCourtRecoveryKind: FigureKind<CourtRecoveryData> = {
  kind: 'justice_court_recovery',
  schema: CourtRecoveryData.refine(
    (d) => d.functions.every((f) => f.restoredAtHours >= f.downFromHours),
    { message: 'a function must be restored after it went down' },
  ),
  render(d, o) {
    return annotatedTimelineKind.render(
      annotatedTimelineKind.schema.parse({
        title: d.title ?? 'Court function recovery',
        xLabel: 'Hours since the outage began',
        lanes: d.functions.map((f) => f.function),
        spans: d.functions.map((f) => ({
          from: f.downFromHours,
          to: f.restoredAtHours,
          label: `${f.function} down`,
          lane: f.function,
        })),
      }),
      o,
    )
  },
}

// ---- filings backlog -------------------------------------------------------------------------------

export const FilingsBacklogData = z.object({
  title: z.string().max(200).optional(),
  days: z
    .array(z.object({ label: z.string().min(1).max(40), backlog: z.number().int().min(0) }))
    .min(1)
    .max(24),
})
export type FilingsBacklogData = z.infer<typeof FilingsBacklogData>

export const justiceFilingsBacklogKind: FigureKind<FilingsBacklogData> = {
  kind: 'justice_filings_backlog',
  schema: FilingsBacklogData,
  render(d, o) {
    return barKind.render(
      barKind.schema.parse({
        title: d.title ?? 'Filings waiting for entry',
        yLabel: 'Filings',
        unit: 'filings',
        bars: d.days.map((x) => ({ label: x.label, value: x.backlog })),
      }),
      o,
    )
  },
}

export const JUSTICE_FIGURE_KINDS = [
  justiceUnitStatusKind,
  justiceIncidentTimelineKind,
  justiceJailPopulationKind,
  justiceCourtContinuityKind,
  justiceCourtRecoveryKind,
  justiceFilingsBacklogKind,
] as unknown as readonly FigureKind<unknown>[]
