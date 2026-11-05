// Contact network generator (spec 0457 FR-8): the settings an index case passed through
// (household, workplace, school, flight, hospital unit), the people exposed in each, how long
// they overlapped with the case while infectious, who counts as a close contact, and when each
// contact can be reached. A contact is close when the overlap with the infectious period lasts
// at least `closeContactMinutes` (a designer's rule, not a national one). Some contacts are
// never reachable (`unreachableFraction`), which is what the contact reach metric reports.
import { z } from 'zod'
import {
  DAY_MS,
  HOUR_MS,
  infectiousWindow,
  monitoringWindowAfterExposure,
  pathogenById,
} from '@shared/epidemiology/arithmetic'
import { fictionalName, makeRng } from './rng'

export const SETTING_KINDS = [
  'household',
  'workplace',
  'school',
  'flight',
  'unit',
  'clinic',
] as const

const SettingSpec = z.object({
  kind: z.enum(SETTING_KINDS),
  name: z.string().min(1).max(80),
  people: z.number().int().min(1).max(500),
  /** When the index case was there (ISO). */
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  /** Mean minutes of overlap per contact within the stay (shorter for a waiting room, longer for a household). */
  meanOverlapMinutes: z.number().min(1).max(2880).default(60),
})

export const ContactParams = z
  .object({
    seed: z.number().int().default(1),
    pathogenId: z.string().default('measles'),
    /** Symptom (rash) onset of the index case. */
    onset: z.iso.datetime().default('2026-10-19T00:00:00Z'),
    closeContactMinutes: z.number().min(0).max(1440).default(15),
    unreachableFraction: z.number().min(0).max(1).default(0.12),
    /** Contacts are reached within this many days of the notification at the latest. */
    maxReachDay: z.number().int().min(1).max(30).default(5),
    /** Probability a close contact becomes a secondary case (generation 2). */
    secondaryAttackRate: z.number().min(0).max(1).default(0.1),
    notificationAt: z.iso.datetime().default('2026-10-21T15:00:00Z'),
    settings: z
      .array(SettingSpec)
      .min(1)
      .max(12)
      .default([
        {
          kind: 'clinic',
          name: 'Riverbend Urgent Care waiting room',
          people: 18,
          from: '2026-10-16T14:00:00Z',
          to: '2026-10-16T16:30:00Z',
          meanOverlapMinutes: 40,
        },
        {
          kind: 'school',
          name: 'Cedar Heights Elementary, room 12',
          people: 26,
          from: '2026-10-17T13:30:00Z',
          to: '2026-10-17T20:30:00Z',
          meanOverlapMinutes: 300,
        },
        {
          kind: 'flight',
          name: 'Flight 4417, rows 8 to 14',
          people: 30,
          from: '2026-10-19T11:10:00Z',
          to: '2026-10-19T14:00:00Z',
          meanOverlapMinutes: 170,
        },
        {
          kind: 'household',
          name: 'Index household',
          people: 4,
          from: '2026-10-15T00:00:00Z',
          to: '2026-10-21T00:00:00Z',
          meanOverlapMinutes: 1200,
        },
      ]),
  })
  .refine((p) => pathogenById(p.pathogenId) !== undefined, {
    message: 'unknown pathogen',
    path: ['pathogenId'],
  })
export type ContactParams = z.input<typeof ContactParams>

export type ContactStatus = 'reached' | 'pending' | 'unreachable' | 'cleared'

export interface Contact {
  code: string
  /** Fictional. */
  name: string
  setting: string
  settingKind: (typeof SETTING_KINDS)[number]
  exposureStartMs: number
  exposureEndMs: number
  /** Minutes that overlapped the infectious period and the case's presence. */
  overlapMinutes: number
  close: boolean
  /** Day after notification the contact is reached; null when unreachable. */
  reachedOnDay: number | null
  /** Monitoring span after exposure: shortest to longest incubation. */
  monitorFromMs: number
  monitorToMs: number
  generation: 1 | 2
  /** Whether this contact became a case (generation 2 of the network). */
  secondaryCase: boolean
}

export interface ContactNetwork {
  contacts: Contact[]
  close: number
  reachable: number
  unreachable: number
  /** Daily follow-up checks needed: one per day of each close, reachable contact's monitoring span. */
  followUpChecks: number
}

export function generateContactNetwork(raw: ContactParams = {}): ContactNetwork {
  const p = ContactParams.parse(raw)
  const pathogen = pathogenById(p.pathogenId)!
  const infectious = infectiousWindow(Date.parse(p.onset), pathogen)
  const rng = makeRng(p.seed)
  const contacts: Contact[] = []
  let serial = 0
  for (const s of p.settings) {
    const from = Date.parse(s.from)
    const to = Date.parse(s.to)
    for (let i = 0; i < s.people; i++) {
      serial++
      const stayMs = Math.max(0, to - from)
      const overlap = Math.min(stayMs / 60_000, rng.lognormal(s.meanOverlapMinutes, 0.6))
      const startOffset = rng.uniform(0, Math.max(0, stayMs - overlap * 60_000))
      const start = from + startOffset
      const end = start + overlap * 60_000
      // Only time inside the infectious period counts; a fixed-period pathogen clips the span.
      const clippedMin = infectious
        ? Math.max(
            0,
            (Math.min(end, infectious.endMs) - Math.max(start, infectious.startMs)) / 60_000,
          )
        : overlap
      const close = clippedMin >= p.closeContactMinutes
      const monitor = monitoringWindowAfterExposure(end, pathogen)
      const unreachable = rng.chance(p.unreachableFraction)
      contacts.push({
        code: `K${String(serial).padStart(3, '0')}`,
        name: fictionalName(rng),
        setting: s.name,
        settingKind: s.kind,
        exposureStartMs: start,
        exposureEndMs: end,
        overlapMinutes: Math.round(clippedMin),
        close,
        reachedOnDay: unreachable ? null : rng.int(p.maxReachDay + 1),
        monitorFromMs: monitor.startMs,
        monitorToMs: monitor.endMs,
        generation: 1,
        secondaryCase: close && rng.chance(p.secondaryAttackRate),
      })
    }
  }
  const close = contacts.filter((c) => c.close)
  const reachable = close.filter((c) => c.reachedOnDay !== null)
  return {
    contacts,
    close: close.length,
    reachable: reachable.length,
    unreachable: close.length - reachable.length,
    followUpChecks: reachable.reduce(
      (n, c) => n + Math.max(0, Math.ceil((c.monitorToMs - c.monitorFromMs) / DAY_MS)),
      0,
    ),
  }
}

/** The people still to be followed on `dayMs`: close, reached, with the day inside the monitoring span. */
export function dueOn(network: ContactNetwork, dayMs: number): Contact[] {
  return network.contacts.filter(
    (c) =>
      c.close &&
      c.reachedOnDay !== null &&
      dayMs >= c.monitorFromMs &&
      dayMs <= c.monitorToMs + HOUR_MS,
  )
}
