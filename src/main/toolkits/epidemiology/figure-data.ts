// Figure data built from the simulations (spec 0457): the glue between a simulated outbreak and
// the epi figure kinds, so an inject's figure always agrees with the line list it came from.
// Pure functions; the output is plain JSON that goes into `fields.figures.<name>.data`.
import type { CommonSourceOutbreak } from './simulate/common-source'
import type { Contact, ContactNetwork } from './simulate/contacts'
import type { DispensingRun, WastewaterPoint } from './simulate/wastewater-dispensing'

const iso = (ms: number): string => new Date(ms).toISOString()

/** Epidemic curve data from a line list: counted by onset, never by report date. */
export function curveDataFromOutbreak(
  o: CommonSourceOutbreak,
  opts: {
    binHours: number
    title?: string
    markers?: { time: string; label: string; kind: 'exposure' | 'intervention' | 'report' }[]
  },
): Record<string, unknown> {
  const binMs = opts.binHours * 3_600_000
  const first = Math.min(
    ...o.cases.map((c) => c.onsetMs!),
    ...(opts.markers ?? []).map((m) => Date.parse(m.time)),
  )
  const start = Math.floor(first / binMs) * binMs
  return {
    ...(opts.title ? { title: opts.title } : {}),
    start: iso(start),
    binHours: opts.binHours,
    cases: o.cases.map((c) => ({ onset: iso(c.onsetMs!), status: c.status })),
    markers: opts.markers ?? [],
  }
}

export function lineListDataFromOutbreak(
  o: CommonSourceOutbreak,
  opts: { title?: string; identifiers?: 'codes' | 'names' | 'hidden'; setting?: string } = {},
): Record<string, unknown> {
  return {
    ...(opts.title ? { title: opts.title } : {}),
    identifiers: opts.identifiers ?? 'codes',
    rows: o.cases.map((c) => ({
      id: c.code,
      name: c.name,
      age: c.age,
      sex: c.sex,
      onset: iso(c.onsetMs!),
      status: c.status,
      ...(opts.setting ? { setting: opts.setting } : {}),
    })),
  }
}

export function attackRatesDataFromOutbreak(
  o: CommonSourceOutbreak,
  title?: string,
): Record<string, unknown> {
  return {
    ...(title ? { title } : {}),
    exposures: o.associations.map((a) => ({
      name: a.food,
      illExposed: a.a,
      wellExposed: a.b,
      illUnexposed: a.c,
      wellUnexposed: a.d,
    })),
  }
}

/** Index case, then every close contact of generation 1 and the secondary cases among them. */
export function networkDataFromContacts(
  net: ContactNetwork,
  opts: { title?: string; indexLabel?: string; maxContacts?: number } = {},
): Record<string, unknown> {
  const close = net.contacts.filter((c) => c.close).slice(0, opts.maxContacts ?? 40)
  const status = (c: Contact): string =>
    c.secondaryCase
      ? 'case'
      : c.reachedOnDay === null
        ? 'unreachable'
        : c.reachedOnDay === 0
          ? 'cleared'
          : 'reached'
  return {
    ...(opts.title ? { title: opts.title } : {}),
    nodes: [
      { id: 'index', label: opts.indexLabel ?? 'Index case', generation: 0, status: 'index' },
      ...close.map((c) => ({ id: c.code, label: c.code, generation: 1, status: status(c) })),
    ],
    edges: close.map((c) => ({ from: 'index', to: c.code })),
  }
}

export function wastewaterDataFromSim(
  points: readonly WastewaterPoint[],
  opts: {
    startDate: string
    title?: string
    site?: string
    pathogen?: string
    levels?: { name: string; from: number }[]
    unit?: string
  },
): Record<string, unknown> {
  const t0 = Date.parse(opts.startDate)
  return {
    ...(opts.title ? { title: opts.title } : {}),
    ...(opts.site ? { site: opts.site } : {}),
    ...(opts.pathogen ? { pathogen: opts.pathogen } : {}),
    unit: opts.unit ?? 'relative units',
    points: points.map((p) => ({ date: iso(t0 + p.day * 86_400_000), value: p.concentration })),
    levels: opts.levels ?? [],
    origin: 'Simulated by Action Stations. Not a record of a real event.',
  }
}

export function dispensingDataFromRun(
  run: DispensingRun,
  opts: { title?: string; stations: number; planPerHour?: number; intervalMinutes: number },
): Record<string, unknown> {
  return {
    ...(opts.title ? { title: opts.title } : {}),
    intervalMinutes: opts.intervalMinutes,
    stations: opts.stations,
    ...(opts.planPerHour === undefined ? {} : { planPerHour: opts.planPerHour }),
    intervals: run.intervals.map((i) => ({
      startMin: i.startMin,
      arrivals: i.arrivals,
      served: i.served,
      queue: i.queueEnd,
    })),
  }
}
