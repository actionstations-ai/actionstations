// A crisis line contact surge as a queue model (spec 0464 FR-9). Arrivals per interval follow a
// baseline with a surge multiplier that decays; a number of counselors per channel answers a
// fixed number of contacts per counselor hour; what is left waits. Contacts waiting longer than
// the rerouting timer move to backup (except the Spanish-language share, which cannot be
// rerouted), and contacts waiting past a patience limit abandon. Simple parametric code, not a
// calibrated model: the point is that wait grows with offered load and that rerouting timers move
// contacts when they say they do. Every number is simulated.
import { z } from 'zod'
import { makeRng } from './rng'

export const CONTACT_CHANNELS = ['calls', 'texts', 'chats'] as const
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]
export const CHANNEL_LABEL = {
  calls: 'Calls',
  texts: 'Texts',
  chats: 'Chats',
} as const satisfies Record<ContactChannel, string>

const perChannel = (calls: number, texts: number, chats: number) =>
  z.object({
    calls: z.number().min(0).max(100_000).default(calls),
    texts: z.number().min(0).max(100_000).default(texts),
    chats: z.number().min(0).max(100_000).default(chats),
  })

export const SurgeParams = z.object({
  seed: z.number().int().default(1),
  startTime: z.iso.datetime().default('2026-11-03T12:00:00Z'),
  hours: z.number().min(2).max(72).default(12),
  intervalMin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]).default(15),
  /** Contacts per hour before the surge. */
  baselinePerHour: perChannel(60, 35, 12).default({ calls: 60, texts: 35, chats: 12 }),
  /** Hours after the start when the surge begins. */
  surgeStartHour: z.number().min(0).max(70).default(4),
  /** Peak multiplier of the baseline for calls; texts and chats surge a little harder. */
  multiplier: z.number().min(1).max(10).default(2),
  /** Hours for the surge excess to fall to 37% of its peak. */
  decayHours: z.number().min(0.5).max(72).default(8),
  /** Counselors on each channel before any shortfall. */
  counselors: perChannel(11, 7, 3).default({ calls: 11, texts: 7, chats: 3 }),
  /** Counselors lost to call-outs, taken evenly from calls and texts. */
  shortfall: z
    .object({
      counselors: z.number().int().min(0).max(100).default(2),
      startHour: z.number().min(0).max(70).default(5),
      durationHours: z.number().min(0.25).max(72).default(6),
    })
    .default({ counselors: 2, startHour: 5, durationHours: 6 }),
  /** Contacts one counselor handles per hour on each channel. */
  contactsPerCounselorHour: perChannel(5, 4, 4).default({ calls: 5, texts: 4, chats: 4 }),
  rerouting: z
    .object({
      enabled: z.boolean().default(true),
      /** Calls reroute after about 2 minutes, texts and chats after about 5 (GAO-26-108114, March 2026). */
      callSec: z.number().min(10).max(3600).default(120),
      textChatSec: z.number().min(10).max(3600).default(300),
      /** Share of contacts in Spanish; they cannot be rerouted. */
      spanishShare: z.number().min(0).max(1).default(0.08),
    })
    .default({ enabled: true, callSec: 120, textChatSec: 300, spanishShare: 0.08 }),
  /** Seconds after which a waiting contact gives up. */
  abandonAfterSec: perChannel(300, 900, 600).default({ calls: 300, texts: 900, chats: 600 }),
})
export type SurgeParams = z.output<typeof SurgeParams>

export interface SurgeInterval {
  /** Minutes from the start. */
  startMin: number
  channel: ContactChannel
  offered: number
  /** Answered by this center. */
  answered: number
  abandoned: number
  /** Moved to a backup center. */
  rerouted: number
  /** Contacts still waiting at the end of the interval. */
  queueEnd: number
  avgWaitSec: number
  longestWaitSec: number
  staffOn: number
}

export interface SurgeRun {
  params: SurgeParams
  intervals: SurgeInterval[]
}

const WEIGHT: Record<ContactChannel, number> = { calls: 1, texts: 1.4, chats: 1.2 }
const BASE_ANSWER_SEC: Record<ContactChannel, number> = { calls: 30, texts: 90, chats: 45 }
const MAX_WAIT_SEC = 7200

/** Arrival rate multiplier at an hour: 1 before the surge, then 1 + excess that decays. */
export function surgeFactor(p: SurgeParams, channel: ContactChannel, hour: number): number {
  if (hour < p.surgeStartHour) return 1
  const peak = 1 + (p.multiplier - 1) * WEIGHT[channel]
  return 1 + (peak - 1) * Math.exp(-(hour - p.surgeStartHour) / p.decayHours)
}

function staffAt(p: SurgeParams, channel: ContactChannel, hour: number): number {
  const base = p.counselors[channel]
  const s = p.shortfall
  const active = hour >= s.startHour && hour < s.startHour + s.durationHours
  if (!active || channel === 'chats') return base
  return Math.max(0, base - Math.ceil(s.counselors / 2))
}

export function runSurge(raw: z.input<typeof SurgeParams>): SurgeRun {
  const p = SurgeParams.parse(raw)
  const rng = makeRng(p.seed)
  const stepH = p.intervalMin / 60
  const stepSec = p.intervalMin * 60
  const steps = Math.round(p.hours / stepH)
  const intervals: SurgeInterval[] = []
  const queue: Record<ContactChannel, number> = { calls: 0, texts: 0, chats: 0 }
  for (let i = 0; i < steps; i++) {
    const hour = i * stepH
    for (const ch of CONTACT_CHANNELS) {
      const lambda = p.baselinePerHour[ch] * surgeFactor(p, ch, hour) * stepH
      const offered = rng.poisson(lambda)
      const staff = staffAt(p, ch, hour)
      const capacity = staff * p.contactsPerCounselorHour[ch] * stepH
      const servePerSec = capacity / stepSec
      const waitStart = servePerSec > 0 ? queue[ch] / servePerSec : MAX_WAIT_SEC
      const demand = queue[ch] + offered
      const answered = Math.min(demand, Math.floor(capacity + rng.next()))
      let remaining = demand - answered
      const timer = ch === 'calls' ? p.rerouting.callSec : p.rerouting.textChatSec
      let rerouted = 0
      if (p.rerouting.enabled) {
        const servable = servePerSec * timer
        const excess = Math.max(0, remaining - servable)
        rerouted = Math.min(remaining, Math.round(excess * (1 - p.rerouting.spanishShare)))
        remaining -= rerouted
      }
      const patience = servePerSec * p.abandonAfterSec[ch]
      const giveUp = Math.max(0, remaining - patience)
      const abandoned = Math.min(remaining, Math.round(giveUp * 0.6))
      remaining -= abandoned
      const waitEnd = servePerSec > 0 ? remaining / servePerSec : MAX_WAIT_SEC
      queue[ch] = remaining
      const base = BASE_ANSWER_SEC[ch]
      intervals.push({
        startMin: i * p.intervalMin,
        channel: ch,
        offered,
        answered,
        abandoned,
        rerouted,
        queueEnd: remaining,
        avgWaitSec: Math.round(Math.min(MAX_WAIT_SEC, base + (waitStart + waitEnd) / 2)),
        longestWaitSec: Math.round(Math.min(MAX_WAIT_SEC, base + Math.max(waitStart, waitEnd))),
        staffOn: staff,
      })
    }
  }
  return { params: p, intervals }
}

/** The intervals of one channel, in time order. */
export const channelIntervals = (run: SurgeRun, ch: ContactChannel): SurgeInterval[] =>
  run.intervals.filter((i) => i.channel === ch)

export interface SurgeTotals {
  offered: number
  answered: number
  abandoned: number
  rerouted: number
  queueEnd: number
}

export function surgeTotals(run: SurgeRun, ch: ContactChannel): SurgeTotals {
  const rows = channelIntervals(run, ch)
  return {
    offered: rows.reduce((s, r) => s + r.offered, 0),
    answered: rows.reduce((s, r) => s + r.answered, 0),
    abandoned: rows.reduce((s, r) => s + r.abandoned, 0),
    rerouted: rows.reduce((s, r) => s + r.rerouted, 0),
    queueEnd: rows[rows.length - 1]?.queueEnd ?? 0,
  }
}
