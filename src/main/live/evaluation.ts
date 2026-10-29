/**
 * Evaluator observations in a live session (spec 0416). The controller sends each evaluator
 * device an assignment (`eval.assign`: the EEG critical tasks, the watch list, a label) under
 * the staff key to that device only, and takes back `eval.observation` frames sealed to the
 * controller. Every revision is logged; the highest revision per observation is upserted into
 * `scenarios/<id>/evaluation.json` with `source: 'live'`, so the Evaluate panel, the hot wash
 * and the AAR read one record. Players are never sent an assignment, and an observation from a
 * device without a proven evaluator seat is dropped and logged.
 */
import { CoreCapabilityId } from '@shared/core-capabilities'
import type { Destination, EvalAssignPayload, EvalObservationPayload } from '@shared/live/schemas'
import type { Observation } from '@shared/schemas/evaluation'
import type {
  Attribution,
  CoverageView,
  EvaluatorWatch,
  SessionLogInput,
} from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { AppError } from '../lib/errors'
import { expectedCriterionId, rowCriteria } from '../generate/eeg-criteria'

/** Capability id the form groups per-row expected actions under. */
export const EXPECTED_GROUP = 'expected-actions'
/** Tasks one assignment carries (the protocol cap). */
export const MAX_ASSIGNED_TASKS = 120
/** Serialized size an assignment stays under, well inside the relay's 64 KiB envelope. */
export const MAX_ASSIGNMENT_BYTES = 40 * 1024
/** Distinct observations one evaluator may hold in a session, and all evaluators together. */
export const MAX_OBSERVATIONS_PER_EVALUATOR = 2000
export const MAX_OBSERVATIONS = 5000
const CITATION_PATH_MAX = 200
const LATEST = 50
const DAY_MS = 24 * 60 * 60 * 1000

type AssignedTask = EvalAssignPayload['tasks'][number]
type Scenes = Pick<Scenario, 'evaluation' | 'msel'>

/** The id a per-row expected action has on the wire (task ids cannot hold a colon). */
export const criterionTaskId = (rowId: string): string => `${rowId}_expected`

/** Keep the end of a long heading path: the section name matters more than the document root. */
export function truncateHeadingPath(path: string, max = CITATION_PATH_MAX): string {
  return path.length <= max ? path : `…${path.slice(path.length - (max - 1))}`
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

function taskOf(t: Scenario['evaluation']['eegs'][number]['criticalTasks'][number]): AssignedTask {
  return {
    id: t.id,
    capability: t.capability,
    task: t.task.slice(0, 500),
    citation: {
      documentTitle: t.citation.documentTitle.slice(0, CITATION_PATH_MAX),
      headingPath: truncateHeadingPath(t.citation.headingPath),
      ...(t.citation.page ? { page: t.citation.page } : {}),
    },
    ...(t.expectedBy ? { expectedBy: t.expectedBy } : {}),
    ...(t.timing ? { timing: t.timing.slice(0, 120) } : {}),
    rowIds: t.rowIds.filter((r) => SAFE_ID.test(r)).slice(0, 32),
  }
}

function criterionOf(c: { rowId: string; text: string }): AssignedTask | undefined {
  const id = criterionTaskId(c.rowId)
  if (!SAFE_ID.test(c.rowId) || !SAFE_ID.test(id)) return undefined
  return {
    id,
    capability: EXPECTED_GROUP,
    task: c.text.slice(0, 500),
    citation: { documentTitle: 'Exercise plan', headingPath: `Inject ${c.rowId}: expected action` },
    rowIds: [c.rowId],
    criterionId: expectedCriterionId(c.rowId),
  }
}

/**
 * The tasks an evaluator device is assigned: the EEG critical tasks, then (when shown) each
 * row's own expected action. Trimmed to the protocol cap and a byte budget, expected actions
 * first, so the frame always fits the relay.
 */
export function assignmentTasks(scenario: Scenes, showExpected: boolean): AssignedTask[] {
  const eeg = (scenario.evaluation?.eegs ?? []).flatMap((e) => e.criticalTasks.map(taskOf))
  const expected = showExpected
    ? rowCriteria(scenario)
        .filter((c) => !c.taskId)
        .map(criterionOf)
        .filter((t): t is AssignedTask => t !== undefined)
    : []
  const out: AssignedTask[] = []
  let bytes = 0
  for (const task of [...eeg, ...expected]) {
    const size = JSON.stringify(task).length + 1
    if (out.length >= MAX_ASSIGNED_TASKS || bytes + size > MAX_ASSIGNMENT_BYTES) break
    out.push(task)
    bytes += size
  }
  return out
}

export interface EvalSeat {
  clientId: string
  kind: string
  /** Proven holder of the staff key. */
  staff: boolean
  online: boolean
  name: string
}

export interface EvaluationDeps {
  send: (
    type: 'eval.assign' | 'controller.notice',
    to: Destination,
    payload: Record<string, unknown>,
  ) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  seats: () => EvalSeat[]
  seatOf: (clientId: string) => EvalSeat | undefined
  clientRef: (clientId: string) => Promise<string>
  scenario: () => Promise<Scenes>
  /** Upsert one observation into the scenario's evaluation.json. */
  save: (observation: Observation) => Promise<unknown>
  attribution: () => Attribution
  now: () => number
  newId: () => string
  changed: () => void
}

interface EvaluatorState {
  clientId: string
  ref: string
  label: string
  watch: EvaluatorWatch
  assignmentId: string
  revision: number
  /** What the last assignment carried, to bump `revision` only when it changed. */
  sent?: string
  count: number
}

interface Held {
  ref: string
  revision: number
  observation: Observation
}

export class LiveEvaluation {
  private readonly evaluators = new Map<string, EvaluatorState>()
  private readonly held = new Map<string, Held>()
  private showExpected = true
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: EvaluationDeps) {}

  /** Run `work` after everything queued before it, so revisions apply in arrival order. */
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.catch(() => undefined).then(work)
    this.chain = run
    return run
  }

  private isEvaluator(seat: EvalSeat | undefined): seat is EvalSeat {
    return seat?.kind === 'evaluator' && seat.staff
  }

  private async stateFor(clientId: string): Promise<EvaluatorState> {
    const known = this.evaluators.get(clientId)
    if (known) return known
    const state: EvaluatorState = {
      clientId,
      ref: await this.deps.clientRef(clientId),
      label: `Evaluator ${this.evaluators.size + 1}`,
      watch: { roleIds: [], capabilities: [] },
      assignmentId: this.deps.newId(),
      revision: 0,
      count: 0,
    }
    this.evaluators.set(clientId, state)
    return state
  }

  private byRef(ref: string): EvaluatorState {
    const found = [...this.evaluators.values()].find((e) => e.ref === ref)
    if (!found) throw new AppError('NOT_FOUND', 'That evaluator is not in this session')
    return found
  }

  /** An evaluator device was seated (or came back): give it its assignment. */
  onJoin(clientId: string): Promise<void> {
    return this.serial(async () => {
      if (!this.isEvaluator(this.deps.seatOf(clientId))) return
      await this.stateFor(clientId)
      await this.sendAssignment(clientId)
    })
  }

  /** Send the assignment to one evaluator device; the revision rises only when it changed. */
  private async sendAssignment(clientId: string): Promise<void> {
    const seat = this.deps.seatOf(clientId)
    // Never to a player, an observer or a device that only claims a staff seat.
    if (!this.isEvaluator(seat) || !seat.online) return
    const state = await this.stateFor(clientId)
    const tasks = assignmentTasks(await this.deps.scenario(), this.showExpected)
    const body = { label: state.label, watch: state.watch, showExpected: this.showExpected, tasks }
    const fingerprint = JSON.stringify(body)
    const changed = fingerprint !== state.sent
    if (changed) {
      state.sent = fingerprint
      state.revision += 1
    }
    await this.deps.send('eval.assign', `client:${clientId}`, {
      assignmentId: state.assignmentId,
      revision: state.revision,
      ...body,
    })
    if (!changed) return
    await this.deps.log.append({
      kind: 'eval.assign',
      actor: { kind: 'controller' },
      data: {
        clientRef: state.ref,
        label: state.label,
        revision: state.revision,
        taskCount: tasks.length,
        watch: state.watch,
      },
    })
  }

  /** The EEG or the setting changed: re-send to every connected evaluator. */
  refresh(): Promise<void> {
    return this.serial(async () => {
      for (const clientId of [...this.evaluators.keys()]) await this.sendAssignment(clientId)
    })
  }

  setShowExpected(on: boolean): Promise<void> {
    this.showExpected = on
    return this.refresh()
  }

  setWatch(ref: string, watch: EvaluatorWatch): Promise<void> {
    return this.serial(async () => {
      const state = this.byRef(ref)
      state.watch = { roleIds: [...watch.roleIds], capabilities: [...watch.capabilities] }
      await this.deps.log.append({
        kind: 'eval.watch',
        actor: { kind: 'controller' },
        data: { clientRef: ref, watch: state.watch },
      })
      await this.sendAssignment(state.clientId)
      this.deps.changed()
    })
  }

  /** "Please watch for T-04": a notice to that evaluator's device alone. */
  ask(ref: string, text: string): Promise<void> {
    return this.serial(async () => {
      const state = this.byRef(ref)
      const seat = this.deps.seatOf(state.clientId)
      if (!this.isEvaluator(seat))
        throw new AppError('NOT_FOUND', 'That device is not an evaluator')
      await this.deps.send('controller.notice', `client:${state.clientId}`, {
        noticeId: this.deps.newId(),
        kind: 'text',
        level: 'info',
        text: text.slice(0, 500),
        targets: [`client:${state.clientId}`],
        dismissible: true,
      })
      await this.deps.log.append({
        kind: 'eval.ask',
        actor: { kind: 'controller' },
        data: { clientRef: ref, text: text.slice(0, 500) },
      })
    })
  }

  /** A device sent `eval.observation` to the controller. */
  onObservation(from: string, seq: number, p: EvalObservationPayload): Promise<void> {
    return this.serial(() => this.accept(from, seq, p))
  }

  private async accept(from: string, seq: number, p: EvalObservationPayload): Promise<void> {
    const ref = await this.deps.clientRef(from)
    if (!this.isEvaluator(this.deps.seatOf(from))) {
      return this.anomaly(ref, seq, 'observation from a device without an evaluator seat')
    }
    const state = await this.stateFor(from)
    const key = `${ref}:${p.observationId}`
    const prior = this.held.get(key)
    // A repeat (a reconnect resend) or an older revision changes nothing.
    if (prior && p.revision <= prior.revision) return
    if (!prior && state.count >= MAX_OBSERVATIONS_PER_EVALUATOR) {
      return this.anomaly(ref, seq, 'evaluator observation limit reached')
    }
    if (!prior && this.held.size >= MAX_OBSERVATIONS) {
      return this.anomaly(ref, seq, 'session observation limit reached')
    }
    const observation = this.toObservation(state, p)
    await this.deps.log.append({
      kind: 'eval.observation',
      actor: {
        kind: 'client',
        clientRef: ref,
        seat: { kind: 'evaluator', roleId: 'evaluators' },
        evaluator: state.label,
        displayName: this.deps.seatOf(from)!.name.slice(0, 60),
      },
      ref: {
        observationId: p.observationId,
        ...(p.taskId ? { taskId: p.taskId } : {}),
        ...(p.mselRowId ? { rowId: p.mselRowId } : {}),
      },
      data: this.logData(p),
      env: { from: ref, seq },
    })
    await this.deps.save(observation)
    if (!prior) state.count += 1
    this.held.set(key, { ref, revision: p.revision, observation })
    this.deps.changed()
  }

  private logData(p: EvalObservationPayload): Record<string, unknown> {
    return {
      revision: p.revision,
      kind: p.kind,
      ...(p.rating ? { rating: p.rating } : {}),
      notes: p.notes,
      exerciseTime: p.exerciseTime,
      observedAt: p.observedAt,
      ...(p.criterionId ? { criterionId: p.criterionId } : {}),
      ...(p.capability ? { capability: p.capability } : {}),
      ...(p.injectId ? { injectId: p.injectId } : {}),
    }
  }

  /** The record in evaluation.json. The id is namespaced by the sender, so no one overwrites another. */
  private toObservation(state: EvaluatorState, p: EvalObservationPayload): Observation {
    const now = this.deps.now()
    const observed = Math.abs(p.observedAt - now) > DAY_MS ? now : p.observedAt
    const capability = CoreCapabilityId.safeParse(p.capability)
    const isCriterion = p.kind === 'task' && p.criterionId !== undefined
    return {
      id: `live-${state.ref}-${p.observationId}`,
      at: new Date(observed).toISOString(),
      exerciseTime: p.exerciseTime,
      ...(p.mselRowId && p.mselRowId.length <= 64 ? { rowId: p.mselRowId } : {}),
      ...(p.kind === 'task' && !isCriterion && p.taskId ? { taskId: p.taskId } : {}),
      ...(isCriterion ? { criterionId: p.criterionId } : {}),
      rating: p.rating ?? 'not_observed',
      kind: p.kind,
      ...(capability.success ? { capability: capability.data } : {}),
      note: p.notes.trim(),
      evaluator: state.label,
      source: 'live',
    }
  }

  private async anomaly(ref: string, seq: number, what: string): Promise<void> {
    await this.deps.log.append({
      kind: 'anomaly',
      actor: { kind: 'client', clientRef: ref },
      data: { what },
      env: { from: ref, seq },
    })
  }

  /** The matrix, counts and latest observations for the Evaluate panel. */
  async coverage(): Promise<CoverageView> {
    const tasks = assignmentTasks(await this.deps.scenario(), this.showExpected)
    const online = new Set(
      this.deps
        .seats()
        .filter((s) => s.online)
        .map((s) => s.clientId),
    )
    const cells = new Map<
      string,
      { taskId: string; clientRef: string; rating: string; at: number }
    >()
    const latest: CoverageView['latest'] = []
    for (const h of this.held.values()) latest.push(this.latestRow(h))
    for (const h of this.held.values()) {
      const taskId = this.wireTaskId(h.observation)
      if (!taskId || h.observation.kind === 'note') continue
      const cell = `${taskId}:${h.ref}`
      const at = Date.parse(h.observation.at)
      const old = cells.get(cell)
      if (!old || at >= old.at)
        cells.set(cell, { taskId, clientRef: h.ref, rating: h.observation.rating, at })
    }
    const covered = new Set(
      [...cells.values()].filter((c) => c.rating !== 'not_observed').map((c) => c.taskId),
    )
    return {
      showExpected: this.showExpected,
      evaluators: [...this.evaluators.values()].map((e) => ({
        clientRef: e.ref,
        label: e.label,
        ...(this.deps.attribution() === 'named' ? this.nameOf(e) : {}),
        online: online.has(e.clientId),
        watch: e.watch,
        observations: e.count,
      })),
      tasks: tasks.map((t) => ({ id: t.id, capability: t.capability, text: t.task })),
      cells: [...cells.values()].map(({ taskId, clientRef, rating }) => ({
        taskId,
        clientRef,
        rating: rating as CoverageView['cells'][number]['rating'],
      })),
      latest: latest.sort((a, b) => b.at - a.at).slice(0, LATEST),
      covered: tasks.filter((t) => covered.has(t.id)).length,
      observations: this.held.size,
    }
  }

  private nameOf(e: EvaluatorState): { displayName?: string } {
    const name = this.deps.seatOf(e.clientId)?.name.trim()
    return name ? { displayName: name.slice(0, 60) } : {}
  }

  private wireTaskId(o: Observation): string | undefined {
    if (o.criterionId) return criterionTaskId(o.criterionId.replace(/:expected$/, ''))
    return o.taskId
  }

  private latestRow(h: Held): CoverageView['latest'][number] {
    const o = h.observation
    const taskId = this.wireTaskId(o)
    const label = o.evaluator ?? 'Evaluator'
    return {
      observationId: o.id,
      clientRef: h.ref,
      label,
      ...(taskId ? { taskId } : {}),
      ...(o.capability ? { capability: o.capability } : {}),
      ...(o.kind === 'note' && o.rating === 'not_observed' ? {} : { rating: o.rating }),
      note: o.note,
      exerciseTime: o.exerciseTime ?? '0:00',
      at: Date.parse(o.at),
    }
  }
}
