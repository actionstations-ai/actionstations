/**
 * Surveys on devices (spec 0422 FR-5, FR-7). Opening a survey sends `survey.open` (the wire
 * mapping in `../surveys/wire.ts`), each device answers once per opening (a second answer from
 * the same device replaces its first), answers are sealed to the controller and arrive without
 * a sender in the data: the log entry and the stored response carry the answers and the
 * minute, nothing that names a seat or a device. The device-to-response map that makes
 * "replace" possible lives in memory only and goes with the session.
 */
import { randomBytes } from 'node:crypto'
import type { ClientKind, Destination } from '@shared/live/schemas'
import type { Survey, SurveyChannel, SurveyResponse } from '@shared/schemas'
import type { SessionLogInput } from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import { fromWireResponse, toWireSurvey } from '../surveys/wire'
import { seatDestinations, type DeliverySeat } from './releases'

/** Responses kept per opening: a cap against a flood, far above any room. */
export const MAX_RESPONSES = 5000

export interface SurveySeat extends DeliverySeat {
  online: boolean
}

export interface SurveyDeps {
  send: (
    type: 'survey.open' | 'survey.close',
    to: Destination,
    payload: Record<string, unknown>,
  ) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  load: (surveyId: string) => Promise<Survey>
  /** Mirror a response into the survey's `.responses.jsonl`; returns the stored count. */
  store: (response: SurveyResponse) => Promise<number>
  seats: () => SurveySeat[]
  channel: Extract<SurveyChannel, 'live' | 'qr'>
  now: () => number
  changed: () => void
  timers?: {
    set: (fn: () => void, ms: number) => unknown
    clear: (handle: unknown) => void
  }
}

export interface LiveSurveyView {
  deliveryId: string
  surveyId: string
  title: string
  status: 'open' | 'closed'
  /** Answers received (one per device). */
  responses: number
  /** Devices in scope that are connected now (or have answered). */
  eligible: number
  targets: string[]
  openedAt: number
  closesAt?: number
}

interface Delivery {
  deliveryId: string
  survey: Survey
  targets: string[]
  openedAt: number
  closesAt?: number
  status: 'open' | 'closed'
  /** Device id to its response id. Memory only; never logged or stored. */
  answered: Map<string, string>
  timer?: unknown
}

const newId = (bytes: number): string => randomBytes(bytes).toString('base64url')
const ANSWERERS: ReadonlySet<ClientKind> = new Set(['player', 'evaluator', 'observer'])

function inScope(seat: DeliverySeat, targets: readonly string[]): boolean {
  if (!ANSWERERS.has(seat.kind)) return false
  const mine = seatDestinations(seat)
  return targets.some((t) => mine.has(t))
}

export class LiveSurveys {
  private readonly deliveries: Delivery[] = []
  private readonly timers: NonNullable<SurveyDeps['timers']>

  constructor(private readonly deps: SurveyDeps) {
    this.timers = deps.timers ?? {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (h) => clearTimeout(h as NodeJS.Timeout),
    }
  }

  private find(deliveryId: string): Delivery {
    const d = this.deliveries.find((x) => x.deliveryId === deliveryId)
    if (!d) throw new AppError('NOT_FOUND', 'No such survey in this session')
    return d
  }

  private openFor(surveyId: string): Delivery | undefined {
    return this.deliveries.find((d) => d.survey.id === surveyId && d.status === 'open')
  }

  private eligible(d: Delivery): number {
    const seats = this.deps.seats().filter((s) => inScope(s, d.targets))
    const online = seats.filter((s) => s.online || d.answered.has(s.clientId)).length
    return Math.max(online, d.answered.size)
  }

  private view(d: Delivery): LiveSurveyView {
    return {
      deliveryId: d.deliveryId,
      surveyId: d.survey.id,
      title: d.survey.title,
      status: d.status,
      responses: d.answered.size,
      eligible: this.eligible(d),
      targets: d.targets,
      openedAt: d.openedAt,
      ...(d.closesAt ? { closesAt: d.closesAt } : {}),
    }
  }

  list(): LiveSurveyView[] {
    return this.deliveries.map((d) => this.view(d))
  }

  /** Send a survey to devices. Opening one that is already open returns the open one. */
  async open(
    surveyId: string,
    opts: { targets?: string[]; durationSec?: number } = {},
  ): Promise<LiveSurveyView> {
    const open = this.openFor(surveyId)
    if (open) return this.view(open)
    const survey = await this.deps.load(surveyId)
    if (survey.status === 'archived') {
      throw new AppError('VALIDATION', 'An archived survey cannot be sent to devices.')
    }
    const targets = opts.targets?.length ? opts.targets : ['all']
    const now = this.deps.now()
    const d: Delivery = {
      deliveryId: newId(16),
      survey,
      targets,
      openedAt: now,
      ...(opts.durationSec ? { closesAt: now + opts.durationSec * 1000 } : {}),
      status: 'open',
      answered: new Map(),
    }
    const wire = toWireSurvey(survey, d.deliveryId)
    const payload = { ...wire, targets, ...(d.closesAt ? { closesAt: d.closesAt } : {}) }
    for (const to of targets) await this.deps.send('survey.open', to as Destination, payload)
    this.deliveries.push(d)
    if (d.closesAt) {
      const close = () => void this.close(d.deliveryId).catch(() => undefined)
      d.timer = this.timers.set(close, d.closesAt - now)
    }
    await this.deps.log.append({
      kind: 'survey.open',
      actor: { kind: 'controller' },
      ref: { surveyId: d.deliveryId },
      data: { survey: survey.id, title: survey.title, targets, questions: wire.questions.length },
    })
    this.deps.changed()
    return this.view(d)
  }

  /** Stop taking answers and tell devices. Closing a closed survey changes nothing. */
  async close(deliveryId: string): Promise<LiveSurveyView> {
    const d = this.find(deliveryId)
    if (d.status === 'closed') return this.view(d)
    d.status = 'closed'
    if (d.timer) this.timers.clear(d.timer)
    await this.deps.send('survey.close', 'all', { surveyId: d.deliveryId })
    await this.logClose(d)
    this.deps.changed()
    return this.view(d)
  }

  private logClose(d: Delivery): Promise<unknown> {
    return this.deps.log.append({
      kind: 'survey.close',
      actor: { kind: 'controller' },
      ref: { surveyId: d.deliveryId },
      data: { survey: d.survey.id, responses: d.answered.size },
    })
  }

  /** A `survey.response` from a device. Nothing about the sender is logged or stored. */
  async onResponse(from: string, payload: unknown): Promise<void> {
    const id = (payload as { surveyId?: unknown } | null)?.surveyId
    const d = this.deliveries.find((x) => x.deliveryId === id)
    const seat = this.deps.seats().find((s) => s.clientId === from)
    if (!d || d.status !== 'open' || !seat || !inScope(seat, d.targets)) return this.drop()
    const responseId = d.answered.get(from) ?? `lr-${newId(9)}`
    if (!d.answered.has(from) && d.answered.size >= MAX_RESPONSES) return this.drop()
    const response = fromWireResponse(d.survey, payload, {
      deliveryId: d.deliveryId,
      responseId,
      channel: this.deps.channel,
      receivedAt: new Date(this.deps.now()).toISOString(),
    })
    if (!response) return this.drop()
    d.answered.set(from, responseId)
    await this.deps.log.append({
      kind: 'survey.response',
      actor: { kind: 'client' },
      ref: { surveyId: d.deliveryId },
      data: { responseId, answers: response.answers },
    })
    await this.deps.store(response)
    this.deps.changed()
  }

  private async drop(): Promise<void> {
    await this.deps.log.append({
      kind: 'anomaly',
      actor: { kind: 'system' },
      data: { what: 'survey response dropped' },
    })
  }

  /** Session end: close what is open in the log (devices get `session.end`). */
  async closeAll(): Promise<void> {
    for (const d of this.deliveries) {
      if (d.status !== 'open') continue
      d.status = 'closed'
      await this.logClose(d)
    }
    this.dispose()
  }

  dispose(): void {
    for (const d of this.deliveries) if (d.timer) this.timers.clear(d.timer)
  }
}
