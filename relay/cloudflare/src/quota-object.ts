/**
 * The daily session counters (spec 0408 FR-5): one Durable Object named `quota`, one row per
 * UTC day for the account and one per address prefix per day, so neither the whole relay nor one
 * person can spend the day. `POST /take` costs one request per session creation; an alarm at the
 * next UTC midnight drops yesterday's rows so the table never grows.
 */
import { addressPrefix } from '@actionstations/relay-core'
import {
  SESSIONS_PER_ADDRESS_PER_DAY,
  SESSIONS_PER_DAY,
  nextUtcMidnight,
  utcDay,
  type Env,
} from './env'
import { errorResponse, json } from './errors'

export interface QuotaResult {
  ok: boolean
  /** Why not: the day's allowance, or this address's share of it. */
  reason?: 'day' | 'address'
  remaining: number
  /** When the counters reset (next UTC midnight). */
  resetAt: number
}

export interface QuotaLimits {
  perDay: number
  perAddress: number
}

export class QuotaObject {
  constructor(
    private readonly state: DurableObjectState,
    _env: Env,
    private readonly limits: QuotaLimits = {
      perDay: SESSIONS_PER_DAY,
      perAddress: SESSIONS_PER_ADDRESS_PER_DAY,
    },
    private readonly now: () => number = () => Date.now(),
  ) {
    state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS quota (day TEXT NOT NULL, who TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, who))`,
    )
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/take') {
        const body = (await request.json().catch(() => ({}))) as { address?: unknown }
        const address = typeof body.address === 'string' ? body.address : ''
        return json(await this.take(address))
      }
      if (request.method === 'GET' && url.pathname === '/peek') return json(this.peek())
      return json({ error: { code: 'NOT_FOUND', message: 'No such route' } }, 404)
    } catch (err) {
      return errorResponse(err, this.now())
    }
  }

  /** Today's account count without taking one. */
  peek(): QuotaResult {
    const now = this.now()
    const count = this.countFor(utcDay(now), '*')
    return {
      ok: count < this.limits.perDay,
      remaining: Math.max(0, this.limits.perDay - count),
      resetAt: nextUtcMidnight(now),
    }
  }

  /** Takes one of today's sessions for `address`, or says which cap stands in the way. */
  async take(address: string): Promise<QuotaResult> {
    const now = this.now()
    const day = utcDay(now)
    const resetAt = nextUtcMidnight(now)
    const who = addressPrefix(address || 'unknown')
    const total = this.countFor(day, '*')
    if (total >= this.limits.perDay) return { ok: false, reason: 'day', remaining: 0, resetAt }
    const mine = this.countFor(day, who)
    if (mine >= this.limits.perAddress) {
      return { ok: false, reason: 'address', remaining: this.limits.perDay - total, resetAt }
    }
    for (const key of ['*', who]) {
      this.state.storage.sql.exec(
        `INSERT INTO quota (day, who, count) VALUES (?, ?, 1) ON CONFLICT(day, who) DO UPDATE SET count = count + 1`,
        day,
        key,
      )
    }
    if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(resetAt)
    return { ok: true, remaining: this.limits.perDay - total - 1, resetAt }
  }

  private countFor(day: string, who: string): number {
    const rows = this.state.storage.sql
      .exec(`SELECT count FROM quota WHERE day = ? AND who = ?`, day, who)
      .toArray()
    return rows.length ? Number(rows[0]!.count) : 0
  }

  /** Midnight: forget earlier days. */
  async alarm(): Promise<void> {
    this.state.storage.sql.exec(`DELETE FROM quota WHERE day < ?`, utcDay(this.now()))
  }
}
