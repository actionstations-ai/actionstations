// Access log and backup status generators (spec 0466 FR-8). The access log is a day of badge
// events at one door for a few fictional staff, with anomalies the designer asks for (an
// after-hours entry, a door held open, a forced door, a denied badge). The backup status is the
// hours since each research system last had a good backup, with a gap for a system whose backup
// failed. Seeded, simulated, fictional.
import { z } from 'zod'
import { fictionalName, makeRng } from '../../epidemiology/simulate/rng'

const MIN_MS = 60_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')

export const ANOMALIES = ['after_hours_entry', 'door_held_open', 'forced_open', 'denied'] as const

export const AccessParams = z.object({
  seed: z.number().int().default(1),
  door: z.string().min(1).max(80).default('Whitfield Hall Room 118, door 1'),
  /** Midnight of the day to log (UTC). */
  day: z.iso.datetime().default('2026-10-20T00:00:00Z'),
  staff: z.number().int().min(1).max(12).default(5),
  anomalies: z.array(z.enum(ANOMALIES)).max(6).default(['after_hours_entry']),
  /** Normal hours, as minutes from midnight. */
  openMin: z
    .number()
    .int()
    .min(0)
    .max(1439)
    .default(7 * 60),
  closeMin: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(19 * 60),
})
export type AccessParams = z.infer<typeof AccessParams>

export interface AccessRow {
  time: string
  person: string
  event: 'entry' | 'exit' | 'door_held_open' | 'forced_open' | 'denied'
  afterHours: boolean
  note: string
}

export function runAccessLog(raw: z.input<typeof AccessParams>): AccessRow[] {
  const p = AccessParams.parse(raw)
  const rng = makeRng(p.seed)
  const t0 = Date.parse(p.day)
  const people = Array.from({ length: p.staff }, () => fictionalName(rng))
  const rows: { at: number; row: AccessRow }[] = []
  const add = (minute: number, person: string, event: AccessRow['event'], note = '') => {
    const at = t0 + minute * MIN_MS
    const afterHours = minute < p.openMin || minute > p.closeMin
    rows.push({ at, row: { time: iso(at), person, event, afterHours, note } })
  }
  for (const person of people) {
    const inMin = p.openMin + rng.int(180)
    const outMin = Math.min(p.closeMin, inMin + 240 + rng.int(240))
    add(inMin, person, 'entry')
    add(outMin, person, 'exit')
  }
  for (const a of p.anomalies) {
    const who = rng.pick(people)
    if (a === 'after_hours_entry')
      add(p.closeMin + 120 + rng.int(180), who, 'entry', 'Badge in; no scheduled work')
    if (a === 'door_held_open')
      add(p.openMin + 200 + rng.int(60), who, 'door_held_open', 'Door open for 4 minutes')
    if (a === 'forced_open')
      add(p.closeMin + 60 + rng.int(60), 'Unknown', 'forced_open', 'Door contact alarm; no badge')
    if (a === 'denied')
      add(p.openMin + 90 + rng.int(60), who, 'denied', 'Badge not on the access list')
  }
  return rows.sort((a, b) => a.at - b.at).map((r) => r.row)
}

export const BackupParams = z.object({
  seed: z.number().int().default(1),
  systems: z
    .array(z.string().min(1).max(80))
    .min(1)
    .max(12)
    .default([
      'Instrument computer A',
      'Instrument computer B',
      'Electronic lab notebook',
      'Study database',
    ]),
  start: z.iso.datetime().default('2026-10-21T00:00:00Z'),
  hours: z.number().int().min(6).max(240).default(72),
  /** Systems whose backup stops at `failsAtHour` and stays down. */
  failing: z.array(z.string()).max(12).default(['Instrument computer B']),
  failsAtHour: z.number().min(0).max(240).default(20),
  /** The nightly backup runs every this many hours. */
  everyHours: z.number().int().min(1).max(48).default(24),
})
export type BackupParams = z.infer<typeof BackupParams>

/** Hours since the last good backup, hourly, per system. */
export function runBackupStatus(
  raw: z.input<typeof BackupParams>,
): { zone: string; points: { time: string; hours: number }[] }[] {
  const p = BackupParams.parse(raw)
  const rng = makeRng(p.seed)
  const t0 = Date.parse(p.start)
  return p.systems.map((zone) => {
    const offset = rng.int(p.everyHours)
    const fails = p.failing.includes(zone)
    const points = Array.from({ length: p.hours + 1 }, (_, h) => {
      const lastRun = Math.floor((h + offset) / p.everyHours) * p.everyHours - offset
      const last =
        fails && h >= p.failsAtHour
          ? Math.min(
              lastRun,
              Math.floor((p.failsAtHour + offset) / p.everyHours) * p.everyHours - offset,
            )
          : lastRun
      return { time: iso(t0 + h * 60 * MIN_MS), hours: h - last }
    })
    return { zone, points }
  })
}
