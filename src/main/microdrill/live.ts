// A micro-drill on players' devices (#437, FR-17). The facilitator opens a drill over the running
// live session; each device that answers gets its own run (solo, labelled "Participant N"), the
// controller's app checks the answer or hands out the drill's prewritten hint, and the reply
// goes to that device only. The open frame carries the situation and questions, never the
// expected points, hints or model answers. Answers are saved in the project's run files as in a
// run on this computer; the session log keeps counts and labels, never answer text.
import { randomBytes } from 'node:crypto'
import type { Destination, DrillAnswerPayload } from '@shared/live/schemas'
import type { HintLevel, MicroDrill, MicroDrillRun } from '@shared/schemas'
import type { LiveDrillView, SessionLogInput } from '@shared/schemas/live'
import { AppError, toAppError } from '../lib/errors'
import { seatDestinations, type DeliverySeat } from '../live/releases'
import type { AnswerInput, HintResult } from './run'

/** Devices per drill and answers checked per device: caps against a flood. */
export const MAX_DRILL_DEVICES = 60
export const MAX_CHECKS_PER_DEVICE = 60

export interface DrillSeat extends DeliverySeat {
  online: boolean
}

export interface DrillRuns {
  getDrill: (drillId: string) => Promise<MicroDrill>
  /** Whether a model or a checklist will check answers (the same decision a run makes). */
  mode: () => Promise<{ assessment: 'model' | 'checklist'; reason?: string }>
  start: (drillId: string, label: string) => Promise<MicroDrillRun>
  answer: (input: AnswerInput) => Promise<{ run: MicroDrillRun; hintOffer: HintLevel | null }>
  hint: (runId: string, stepId: string) => Promise<{ run: MicroDrillRun; hint: HintResult }>
  finish: (runId: string) => Promise<MicroDrillRun>
  /** After runs finish: refresh the program snapshot. */
  report: () => Promise<void>
}

export interface LiveDrillDeps {
  send: (
    type: 'drill.open' | 'drill.feedback' | 'drill.close',
    to: Destination,
    payload: Record<string, unknown>,
  ) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  runs: DrillRuns
  seats: () => DrillSeat[]
  now: () => number
  changed: () => void
}

interface Participant {
  label: string
  runId: string
  run: MicroDrillRun
  checks: number
}

interface Delivery {
  liveId: string
  drill: MicroDrill
  assessment: 'model' | 'checklist'
  targets: string[]
  openedAt: number
  status: 'open' | 'closed'
  /** Device id to its participant. Memory only. */
  participants: Map<string, Participant>
}

const newId = (bytes: number): string => randomBytes(bytes).toString('base64url')

function inScope(seat: DeliverySeat, targets: readonly string[]): boolean {
  if (seat.kind !== 'player') return false
  const mine = seatDestinations(seat)
  return targets.some((t) => mine.has(t))
}

const pointTexts = (step: MicroDrill['steps'][number], ids: string[]) =>
  step.expectedPoints.filter((p) => ids.includes(p.id)).map((p) => p.text)

export class LiveDrills {
  private readonly deliveries: Delivery[] = []
  /** One request at a time per device, so a double tap cannot start two runs. */
  private readonly queues = new Map<string, Promise<void>>()

  constructor(private readonly deps: LiveDrillDeps) {}

  private find(liveId: string): Delivery {
    const d = this.deliveries.find((x) => x.liveId === liveId)
    if (!d) throw new AppError('NOT_FOUND', 'No such drill in this session')
    return d
  }

  private view(d: Delivery): LiveDrillView {
    const online = new Set(
      this.deps
        .seats()
        .filter((s) => s.online)
        .map((s) => s.clientId),
    )
    return {
      liveId: d.liveId,
      drillId: d.drill.id,
      title: d.drill.title,
      status: d.status,
      assessment: d.assessment,
      targets: d.targets,
      openedAt: d.openedAt,
      stepCount: d.drill.steps.length,
      participants: [...d.participants].map(([clientId, p]) => ({
        label: p.label,
        online: online.has(clientId),
        answered: p.run.steps.filter((s) => s.attempts.length > 0).length,
        hints: p.run.steps.reduce((n, s) => n + s.hintsUsed.length, 0),
        runId: p.runId,
      })),
    }
  }

  list(): LiveDrillView[] {
    return this.deliveries.map((d) => this.view(d))
  }

  /** Send a drill to devices. Opening one that is already open returns the open one. */
  async open(drillId: string, targets?: string[]): Promise<LiveDrillView> {
    const open = this.deliveries.find((d) => d.drill.id === drillId && d.status === 'open')
    if (open) return this.view(open)
    const drill = await this.deps.runs.getDrill(drillId)
    if (drill.status !== 'ready') {
      throw new AppError('VALIDATION', 'Mark the drill Ready before sending it to devices.')
    }
    const mode = await this.deps.runs.mode()
    const d: Delivery = {
      liveId: newId(16),
      drill,
      assessment: mode.assessment,
      targets: targets?.length ? targets : ['all'],
      openedAt: this.deps.now(),
      status: 'open',
      participants: new Map(),
    }
    const payload = {
      drillId: d.liveId,
      title: drill.title,
      situation: drill.situation,
      durationMin: drill.durationMin,
      assessment: d.assessment,
      steps: drill.steps.map((s) => ({ id: s.id, prompt: s.prompt })),
      targets: d.targets,
    }
    for (const to of d.targets) await this.deps.send('drill.open', to as Destination, payload)
    this.deliveries.push(d)
    await this.deps.log.append({
      kind: 'drill.open',
      actor: { kind: 'controller' },
      ref: { drillId: d.liveId },
      data: {
        drill: drill.id,
        title: drill.title,
        targets: d.targets,
        steps: drill.steps.length,
        assessment: d.assessment,
        ...(mode.reason ? { reason: mode.reason } : {}),
      },
    })
    this.deps.changed()
    return this.view(d)
  }

  /** Finish every device's run, report to the program, and tell devices. Closing twice is safe. */
  async close(liveId: string): Promise<LiveDrillView> {
    const d = this.find(liveId)
    if (d.status === 'closed') return this.view(d)
    d.status = 'closed'
    await this.finishRuns(d)
    await this.deps.send('drill.close', 'all', { drillId: d.liveId })
    this.deps.changed()
    return this.view(d)
  }

  private async finishRuns(d: Delivery): Promise<void> {
    for (const p of d.participants.values()) {
      p.run = await this.deps.runs.finish(p.runId).catch(() => p.run)
    }
    await this.deps.runs.report().catch(() => undefined)
    await this.deps.log.append({
      kind: 'drill.close',
      actor: { kind: 'controller' },
      ref: { drillId: d.liveId },
      data: { drill: d.drill.id, participants: d.participants.size },
    })
  }

  /** Session end: finish what is open (devices get `session.end`). */
  async closeAll(): Promise<void> {
    for (const d of this.deliveries) {
      if (d.status !== 'open') continue
      d.status = 'closed'
      await this.finishRuns(d)
    }
  }

  /** A `drill.answer` from a device, handled in order per device. */
  onAnswer(from: string, payload: DrillAnswerPayload): Promise<void> {
    const prior = this.queues.get(from) ?? Promise.resolve()
    const next = prior.then(() => this.handle(from, payload))
    this.queues.set(
      from,
      next.catch(() => undefined),
    )
    return next
  }

  private async handle(from: string, payload: DrillAnswerPayload): Promise<void> {
    const d = this.deliveries.find((x) => x.liveId === payload.drillId)
    const seat = this.deps.seats().find((s) => s.clientId === from)
    if (!d || d.status !== 'open' || !seat || !inScope(seat, d.targets))
      return void (await this.drop())
    const step = d.drill.steps.find((s) => s.id === payload.stepId)
    if (!step) return void (await this.drop())
    const reply = (body: Record<string, unknown>) =>
      this.deps.send('drill.feedback', `client:${from}` as Destination, {
        drillId: d.liveId,
        stepId: step.id,
        ...body,
      })
    try {
      const p = await this.participant(d, from)
      if (!p) return void (await reply({ kind: 'error', message: 'This drill is full.' }))
      await reply(await this.respond(d, p, step, payload))
    } catch (e) {
      await reply({ kind: 'error', message: await this.deviceMessage(e) })
    }
    this.deps.changed()
  }

  /**
   * What a device may read about a failure. An AppError is written for people (a drill that is
   * not Ready, all hints used) and goes through; anything else may carry a local path or a
   * provider message, so the device gets a fixed sentence and the detail goes to the local log.
   */
  private async deviceMessage(e: unknown): Promise<string> {
    if (e instanceof AppError) return e.message.slice(0, 300)
    await this.deps.log
      .append({
        kind: 'anomaly',
        actor: { kind: 'system' },
        data: { what: 'drill answer failed', detail: toAppError(e).message.slice(0, 300) },
      })
      .catch(() => undefined)
    return 'The drill could not check that. Try again, or ask your facilitator.'
  }

  private async participant(d: Delivery, from: string): Promise<Participant | undefined> {
    const known = d.participants.get(from)
    if (known) return known
    if (d.participants.size >= MAX_DRILL_DEVICES) return undefined
    const label = `Participant ${d.participants.size + 1}`
    const run = await this.deps.runs.start(d.drill.id, label)
    const p: Participant = { label, runId: run.id, run, checks: 0 }
    d.participants.set(from, p)
    return p
  }

  private async respond(
    d: Delivery,
    p: Participant,
    step: MicroDrill['steps'][number],
    payload: DrillAnswerPayload,
  ): Promise<Record<string, unknown>> {
    const text = payload.text?.trim() ?? ''
    if (payload.ask === 'check' && !text)
      return { kind: 'error', message: 'Write an answer first.' }
    // Hints count toward the cap too: each one is a stored write and a reply.
    if (++p.checks > MAX_CHECKS_PER_DEVICE) {
      return {
        kind: 'error',
        message: 'That is enough answers for this drill. Ask your facilitator.',
      }
    }
    if (payload.ask === 'hint') return this.hintFeedback(d, p, step.id)
    if (p.run.assessment === 'checklist' && payload.ticked === undefined) {
      return {
        kind: 'checklist',
        points: step.expectedPoints.map((e) => ({ id: e.id, text: e.text })),
        modelAnswer: step.modelAnswer,
      }
    }
    const input = { runId: p.runId, stepId: step.id, participantLabel: p.label, text }
    const r = await this.deps.runs.answer(
      payload.ticked ? { ...input, ticked: payload.ticked } : input,
    )
    p.run = r.run
    const attempt = r.run.steps.find((s) => s.stepId === step.id)?.attempts.at(-1)
    await this.logAnswer(d, p, step.id, 'check')
    if (!attempt) return { kind: 'error', message: 'The answer was not recorded.' }
    return {
      kind: 'result',
      covered: pointTexts(step, attempt.covered),
      left: attempt.missing.length + attempt.partial.length,
      ...(attempt.followUp ? { followUp: attempt.followUp } : {}),
      ...(r.hintOffer ? { hintOffer: r.hintOffer } : {}),
    }
  }

  private async hintFeedback(d: Delivery, p: Participant, stepId: string) {
    const r = await this.deps.runs.hint(p.runId, stepId)
    p.run = r.run
    await this.logAnswer(d, p, stepId, 'hint')
    const { level, text, headingPath, page, quote } = r.hint
    const where = headingPath ? `${headingPath}${page ? `, page ${page}` : ''}` : undefined
    return {
      kind: 'hint',
      hint: {
        level,
        text,
        ...(where ? { where } : {}),
        ...(quote ? { quote } : {}),
      },
    }
  }

  private logAnswer(d: Delivery, p: Participant, stepId: string, ask: 'check' | 'hint') {
    return this.deps.log.append({
      kind: 'drill.answer',
      actor: { kind: 'client' },
      ref: { drillId: d.liveId },
      data: { label: p.label, step: stepId, ask },
    })
  }

  private drop(): Promise<unknown> {
    return this.deps.log.append({
      kind: 'anomaly',
      actor: { kind: 'system' },
      data: { what: 'drill answer dropped' },
    })
  }
}
