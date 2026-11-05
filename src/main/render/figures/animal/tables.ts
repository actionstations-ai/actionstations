// animal_premises_table, animal_sampling_schedule and animal_depop_tracker (spec 0460 FR-5):
// the premises list, the sampling schedule by designation and the depopulation and disposal
// status board. They compose the generic table and status board so layout, accessibility and
// determinism come from those kinds; this file turns the field's data into their rows.
import { z } from 'zod'
import {
  DESIGNATION_ABBREVIATION,
  FMD_PLAN,
  FMD_SAMPLING,
  HPAI_DEPOPULATION_GOAL_HOURS,
  type Designation,
} from '@shared/animal-disease/plan-rules'
import { statusBoardKind } from '../status-board'
import { tableKind } from '../table'
import type { FigureKind, FigureResult } from '../types'
import { DesignationSchema, Title } from './common'

interface Opts {
  width: number
  height: number
}

// ---- animal_premises_table ----------------------------------------------------------------------

export const AnimalPremisesTableData = z.object({
  title: Title,
  asOf: z.string().max(60).optional(),
  premises: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        species: z.string().max(40).default(''),
        head: z.number().int().min(0).max(10_000_000),
        designation: DesignationSchema,
        status: z.string().max(60).default(''),
        zone: z.string().max(40).default(''),
        lastSample: z.string().max(40).default(''),
      }),
    )
    .min(1)
    .max(60),
})
export type AnimalPremisesTableData = z.infer<typeof AnimalPremisesTableData>

function premisesTable(d: AnimalPremisesTableData, o: Opts): FigureResult {
  const r = tableKind.render(
    {
      title: d.title,
      caption: `Fictional premises${d.asOf ? `, as of ${d.asOf}` : ''}. Designations follow the response plans.`,
      columns: ['Premises', 'Species', 'Head', 'Designation', 'Zone', 'Status', 'Last sample'],
      rows: d.premises.map((p) => [
        p.id,
        p.species,
        p.head,
        `${p.designation} (${DESIGNATION_ABBREVIATION[p.designation]})`,
        p.zone,
        p.status,
        p.lastSample,
      ]),
    },
    o,
  )
  return r
}

export const animalPremisesTableKind: FigureKind<AnimalPremisesTableData> = {
  kind: 'animal_premises_table',
  schema: AnimalPremisesTableData,
  render: premisesTable,
}

// ---- animal_sampling_schedule -----------------------------------------------------------------

const duration = (r: (typeof FMD_SAMPLING)[number]): string =>
  'days' in r.duration
    ? `${r.duration.days} days`
    : `until ${r.duration.daysAfterLastCase} days after the last detected case`

const label = (d: Designation | 'surveillance-zone'): string =>
  d === 'surveillance-zone'
    ? 'Surveillance zone premises'
    : `${d[0]!.toUpperCase()}${d.slice(1)} premises`

export const AnimalSamplingScheduleData = z.object({
  title: Title,
  /** Rows to show; absent, the FMD Red Book table is shown. */
  rows: z
    .array(
      z.object({
        designation: z.string().min(1).max(60),
        intervalDays: z.number().int().positive().max(365),
        duration: z.string().min(1).max(120),
        premisesDue: z.number().int().min(0).max(100_000).optional(),
      }),
    )
    .max(12)
    .optional(),
  plan: z.string().max(80).default(FMD_PLAN.label),
})
export type AnimalSamplingScheduleData = z.infer<typeof AnimalSamplingScheduleData>

function samplingSchedule(d: AnimalSamplingScheduleData, o: Opts): FigureResult {
  const rows =
    d.rows ??
    FMD_SAMPLING.map((r) => ({
      designation: label(r.designation),
      intervalDays: r.intervalDays,
      duration: duration(r),
      premisesDue: undefined as number | undefined,
    }))
  const withDue = rows.some((r) => r.premisesDue !== undefined)
  return tableKind.render(
    {
      title: d.title ?? 'Sampling schedule by designation',
      caption: `${d.plan}. A guideline; follow the state plan.`,
      columns: [
        'Designation',
        'Sample every (days)',
        'Until',
        ...(withDue ? ['Premises due'] : []),
      ],
      rows: rows.map((r) => [
        r.designation,
        r.intervalDays,
        r.duration,
        ...(withDue ? [r.premisesDue ?? 0] : []),
      ]),
    },
    o,
  )
}

export const animalSamplingScheduleKind: FigureKind<AnimalSamplingScheduleData> = {
  kind: 'animal_sampling_schedule',
  schema: AnimalSamplingScheduleData,
  render: samplingSchedule,
}

// ---- animal_depop_tracker ---------------------------------------------------------------------

const STATES = ['queued', 'in progress', 'depopulated', 'disposed'] as const

export const AnimalDepopTrackerData = z.object({
  title: Title,
  asOf: z.string().max(60).optional(),
  goalHours: z.number().positive().max(240).default(HPAI_DEPOPULATION_GOAL_HOURS),
  premises: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        species: z.string().max(40).default(''),
        head: z.number().int().min(0).max(10_000_000),
        method: z.string().max(60).default(''),
        state: z.enum(STATES),
        /** Hours from the presumptive positive: elapsed while open, total when complete. */
        hours: z.number().min(0).max(1000),
        site: z.string().max(60).optional(),
      }),
    )
    .min(1)
    .max(30),
  sites: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        capacityPerDay: z.number().positive(),
        usedToday: z.number().min(0),
      }),
    )
    .max(8)
    .default([]),
})
export type AnimalDepopTrackerData = z.infer<typeof AnimalDepopTrackerData>

function depopTracker(d: AnimalDepopTrackerData, o: Opts): FigureResult {
  const open = (s: (typeof STATES)[number]): boolean => s === 'queued' || s === 'in progress'
  const rows = d.premises.map((p) => {
    const late = p.hours > d.goalHours
    const state: 'ok' | 'degraded' | 'down' | 'unknown' = open(p.state)
      ? late
        ? 'down'
        : p.state === 'queued'
          ? 'unknown'
          : 'degraded'
      : late
        ? 'degraded'
        : 'ok'
    const head = p.head.toLocaleString('en-US')
    const timing = open(p.state)
      ? `${p.hours} h since presumptive positive${late ? `, past the ${d.goalHours} h goal` : ''}`
      : `done in ${p.hours} h${late ? `, past the ${d.goalHours} h goal` : ', within the goal'}`
    return {
      name: `${p.id} ${p.species}`.trim(),
      state,
      detail: `${p.state}: ${head} head${p.method ? `, ${p.method}` : ''}. ${timing}.${p.site ? ` Disposal: ${p.site}.` : ''}`,
    }
  })
  const siteRows = d.sites.map((s) => {
    const pct = Math.round((s.usedToday / s.capacityPerDay) * 100)
    return {
      name: s.name,
      state: (pct > 100 ? 'down' : pct >= 80 ? 'degraded' : 'ok') as 'ok' | 'degraded' | 'down',
      detail: `${s.usedToday.toLocaleString('en-US')} of ${s.capacityPerDay.toLocaleString('en-US')} head today (${pct}% of capacity).`,
    }
  })
  const waiting = d.premises.filter((p) => open(p.state)).reduce((n, p) => n + p.head, 0)
  const result = statusBoardKind.render(
    {
      title: d.title ?? 'Depopulation and disposal tracker',
      asOf: d.asOf,
      rows: [...rows, ...siteRows],
    },
    o,
  )
  const summary = `${d.title ?? 'Depopulation and disposal tracker'}: ${d.premises.length} premises, ${waiting.toLocaleString('en-US')} head waiting, goal ${d.goalHours} hours from the presumptive positive. ${result.summary}`
  return { ...result, summary }
}

export const animalDepopTrackerKind: FigureKind<AnimalDepopTrackerData> = {
  kind: 'animal_depop_tracker',
  schema: AnimalDepopTrackerData,
  render: depopTracker,
}
