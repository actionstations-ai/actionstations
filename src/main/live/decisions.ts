/**
 * Structured decisions of a running session (spec 0448 FR-14): send the forms to the seats that
 * may use them, take a submitted decision, check it against its form, log it, and let the
 * facilitator record one by hand. The log line is the record; the same line is written for a
 * player's device and for the facilitator, with the attribution rules of votes: the role is
 * always kept, a name only when the session is named (the log writer drops it at role level).
 */
import { decisionLogData, DECISION_LOG_KIND } from '@shared/decisions/records'
import type { Destination, DecisionSubmitPayload } from '@shared/live/schemas'
import {
  buildDecisionRecord,
  checkSubmission,
  DECISION_LIMITS,
  formsForSeat,
  type DecisionForm,
  type DecisionRecord,
  type DecisionSeat,
  type DecisionValue,
  type AreaValue,
} from '@shared/schemas/decisions'
import type { SessionLogInput } from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import type { DeliverySeat } from './releases'

export interface DecisionSeatView extends DeliverySeat {
  online: boolean
}

export interface DecisionDeps {
  send: (
    type: 'decision.form',
    to: Destination,
    payload: { form: DecisionForm },
  ) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  seatOf: (clientId: string) => DecisionSeatView | undefined
  clientRef: (clientId: string) => Promise<string>
  /** The forms of the scenario's toolkits. */
  forms: () => Promise<DecisionForm[]>
  roleLabel: (roleId: string) => string | undefined
  /** Exercise clock as "H:MM". */
  exerciseTime: () => Promise<string>
  now: () => number
  newId: () => string
  changed: () => void
}

/** What the facilitator enters (the same pieces a device sends). */
export interface FacilitatorEntry {
  formId: string
  fields: Readonly<Record<string, DecisionValue | undefined>>
  area?: AreaValue | undefined
  /** The role that made the decision, when known. */
  roleId?: string | undefined
}

export class Decisions {
  private forms: DecisionForm[] = []
  private readonly records: DecisionRecord[] = []
  /** `clientRef:decisionId` of every decision taken, so a resend counts once. */
  private readonly seen = new Set<string>()
  private readonly perDevice = new Map<string, number>()

  constructor(private readonly deps: DecisionDeps) {}

  /** Load the forms of the scenario's toolkits. Safe to call again. */
  async load(): Promise<DecisionForm[]> {
    this.forms = await this.deps.forms()
    return this.forms
  }

  /**
   * Send a device the forms its seat may use (after it joins or moves seats). Sent to that
   * device alone, so a reload of the page or a late joiner gets them without a catch-up.
   */
  async onJoin(clientId: string): Promise<void> {
    const seat = this.deps.seatOf(clientId)
    if (!seat || seat.kind !== 'player') return
    for (const form of formsForSeat(this.forms, seat.roleId))
      await this.deps.send('decision.form', `client:${clientId}`, { form })
  }

  /** After a resume: bring back the decisions the log holds, so the panel and the limits agree. */
  restore(records: readonly DecisionRecord[]): void {
    for (const r of records) if (!this.records.some((x) => x.id === r.id)) this.records.push(r)
    this.deps.changed()
  }

  list(): DecisionRecord[] {
    return this.records.map((r) => ({ ...r }))
  }

  availableForms(): DecisionForm[] {
    return [...this.forms]
  }

  // ---- from a device ----

  async onSubmit(from: string, seq: number, p: DecisionSubmitPayload): Promise<void> {
    const ref = await this.deps.clientRef(from)
    const reject = (what: string) => this.anomaly(ref, seq, what)
    const seat = this.deps.seatOf(from)
    if (!seat || seat.kind !== 'player')
      return reject('decision from a device without a player seat')
    const key = `${ref}:${p.decisionId}`
    if (this.seen.has(key)) return
    const form = this.forms.find((f) => f.id === p.formId)
    if (!form) return reject('decision for a form that was not sent')
    if (formsForSeat([form], seat.roleId).length === 0)
      return reject('decision from a seat the form is not for')
    if (this.records.length >= DECISION_LIMITS.perSession) return reject('session decision limit')
    if ((this.perDevice.get(ref) ?? 0) >= DECISION_LIMITS.perDevice)
      return reject('device decision limit')
    const fields = Object.fromEntries(p.fields.map((f) => [f.fieldId, f.value]))
    if (Object.keys(fields).length !== p.fields.length) return reject('decision repeats a field')
    const checked = checkSubmission(form, { fields, area: p.area })
    if (!checked.ok) return reject(`decision refused: ${checked.error}`)
    this.seen.add(key)
    this.perDevice.set(ref, (this.perDevice.get(ref) ?? 0) + 1)
    const seatInfo: DecisionSeat = {
      kind: 'player',
      ...(seat.roleId ? { roleId: seat.roleId } : {}),
      ...(seat.teamId ? { teamId: seat.teamId } : {}),
      label: seat.label,
      ...(seat.displayName ? { name: seat.displayName } : {}),
    }
    await this.write(
      buildDecisionRecord({
        id: p.decisionId,
        form,
        checked,
        seat: seatInfo,
        source: 'device',
        time: new Date(this.deps.now()).toISOString(),
        exerciseTime: await this.deps.exerciseTime(),
      }),
      { ref, seq },
    )
  }

  // ---- from the facilitator ----

  /** Check and log a decision the facilitator entered. Throws a validation error naming the field. */
  async record(entry: FacilitatorEntry): Promise<DecisionRecord> {
    const form = this.forms.find((f) => f.id === entry.formId)
    if (!form) throw new AppError('NOT_FOUND', 'No such decision form')
    const checked = checkSubmission(form, { fields: entry.fields, area: entry.area })
    if (!checked.ok) throw new AppError('VALIDATION', checked.error)
    if (this.records.length >= DECISION_LIMITS.perSession)
      throw new AppError('CONFLICT', 'This session has reached its decision limit')
    const record = buildDecisionRecord({
      id: this.deps.newId(),
      form,
      checked,
      seat: this.facilitatorSeat(entry.roleId),
      source: 'facilitator',
      time: new Date(this.deps.now()).toISOString(),
      exerciseTime: await this.deps.exerciseTime(),
    })
    await this.write(record)
    return record
  }

  private facilitatorSeat(roleId: string | undefined): DecisionSeat {
    const label = roleId ? this.deps.roleLabel(roleId) : undefined
    return {
      kind: 'facilitator',
      ...(roleId ? { roleId } : {}),
      ...(label ? { label } : {}),
    }
  }

  // ---- shared ----

  private async write(record: DecisionRecord, env?: { ref: string; seq: number }): Promise<void> {
    const { seat } = record
    await this.deps.log.append({
      kind: DECISION_LOG_KIND,
      ...(record.exerciseTime ? { ex: record.exerciseTime } : {}),
      actor: env
        ? {
            kind: 'client',
            clientRef: env.ref,
            seat: {
              kind: 'player',
              ...(seat.roleId ? { roleId: seat.roleId } : {}),
              ...(seat.teamId ? { teamId: seat.teamId } : {}),
            },
            ...(seat.name ? { displayName: seat.name } : {}),
          }
        : { kind: 'controller' },
      ref: { decisionId: record.id },
      data: decisionLogData(record),
      ...(env ? { env: { from: env.ref, seq: env.seq } } : {}),
    })
    this.records.push(record)
    this.deps.changed()
  }

  private async anomaly(ref: string, seq: number, what: string): Promise<void> {
    await this.deps.log.append({
      kind: 'anomaly',
      actor: { kind: 'client', clientRef: ref },
      data: { what },
      env: { from: ref, seq },
    })
  }
}
