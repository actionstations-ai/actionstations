/**
 * The account-wide daily session counter (spec 0408 FR-5): one Durable Object named `quota`,
 * one row per UTC day. `POST /take` costs one request per session creation; an alarm at the
 * next UTC midnight drops yesterday's rows so the table never grows.
 */
import { SESSIONS_PER_DAY, nextUtcMidnight, utcDay, type Env } from './env'
import { errorResponse, json } from './errors'

export interface QuotaResult {
  ok: boolean
  remaining: number
  /** When the counter resets (next UTC midnight). */
  resetAt: number
}

export class QuotaObject {
  constructor(
    private readonly state: DurableObjectState,
    _env: Env,
    private readonly limit = SESSIONS_PER_DAY,
    private readonly now: () => number = () => Date.now(),
  ) {
    state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS quota (day TEXT PRIMARY KEY, count INTEGER NOT NULL)`,
    )
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/take') return json(await this.take())
      if (request.method === 'GET' && url.pathname === '/peek') return json(this.peek())
      return json({ error: { code: 'NOT_FOUND', message: 'No such route' } }, 404)
    } catch (err) {
      return errorResponse(err, this.now())
    }
  }

  /** Today's count without taking one. */
  peek(): QuotaResult {
    const now = this.now()
    const count = this.countFor(utcDay(now))
    return {
      ok: count < this.limit,
      remaining: Math.max(0, this.limit - count),
      resetAt: nextUtcMidnight(now),
    }
  }

  /** Takes one of today's sessions, or says no when the day's cap is reached. */
  async take(): Promise<QuotaResult> {
    const now = this.now()
    const day = utcDay(now)
    const count = this.countFor(day)
    const resetAt = nextUtcMidnight(now)
    if (count >= this.limit) return { ok: false, remaining: 0, resetAt }
    this.state.storage.sql.exec(
      `INSERT INTO quota (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1`,
      day,
    )
    if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(resetAt)
    return { ok: true, remaining: this.limit - count - 1, resetAt }
  }

  private countFor(day: string): number {
    const rows = this.state.storage.sql.exec(`SELECT count FROM quota WHERE day = ?`, day).toArray()
    return rows.length ? Number(rows[0]!.count) : 0
  }

  /** Midnight: forget earlier days. */
  async alarm(): Promise<void> {
    this.state.storage.sql.exec(`DELETE FROM quota WHERE day < ?`, utcDay(this.now()))
  }
}
