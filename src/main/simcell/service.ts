// The SimCell assistant for one scenario (spec 0429). It drafts in-character replies, keeps the
// approval queue, and hands an approved reply to the live session (or saves it for the hot wash
// when no session runs). Nothing is sent without a person calling `resolve`; there is no
// auto-send. All outside effects come in through `SimcellDeps` and `LiveBridge`, so the flow is
// testable without Electron, a model or a network.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import PQueue from 'p-queue'
import type {
  CapabilityLevel,
  CapabilityResult,
  PersonaCard,
  PersonaChannel,
  PersonasFile,
  Scenario,
  SimcellDraft,
  SimcellExchange,
} from '@shared/schemas'
import type { SessionLogInput } from '@shared/schemas/live'
import { SimcellDraft as SimcellDraftSchema } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { draftReply, type DraftEnv } from './draft'
import { THREAD_LINES, type ThreadLine } from './context'
import { dueTriggers } from './triggers'
import type { RenderedLine, Transcribed } from './voice'

/** A message line as the live session holds it. */
export interface BridgeLine {
  messageId: string
  from: 'player' | 'controller'
  /** Persona name for a controller line. */
  persona?: string
  text: string
  exerciseTime: string
  at: number
  replyTo?: string
}

export interface CallRing {
  callId?: string
  targets: string[]
  personaId: string
  persona: { name: string; organization?: string }
  transcript: string
  audio?: { bytes: Uint8Array; mime: string; durationSec: number }
  canSpeak: boolean
  expectedWaitSec: number
}

/** What the live session offers the assistant. */
export interface LiveBridge {
  sessionId: string
  /** The session folder (`live/<sessionId>`). */
  dir: string
  thread(threadId: string): BridgeLine[]
  threadIds(): string[]
  threadLabel(threadId: string): string
  /** The wire destination of a thread, for ringing it. */
  destination(threadId: string): string
  replyAs(req: {
    channel: string
    text: string
    persona: string
    replyTo?: string
  }): Promise<unknown>
  log(input: SessionLogInput): Promise<unknown>
  rowForReply(replyTo: string): Promise<string | undefined>
  ring(req: CallRing): Promise<{ callId: string; turn: number }>
  noteTranscript(callId: string, turn: number, text: string): Promise<void>
  endCall(callId: string): Promise<void>
}

export interface SimcellDeps {
  root: string
  scenarioId: string
  loadEnv(): Promise<DraftEnv>
  capability(force: boolean): Promise<CapabilityResult>
  personas(): Promise<PersonasFile>
  scenario(): Promise<Pick<Scenario, 'msel'>>
  clock(): Promise<{ minutes: number; label: string }>
  releasedRowIds(): Promise<Set<string>>
  now(): number
  emit(event: 'draft-ready' | 'queue-changed', draftId?: string): void
  saveExchange(ex: SimcellExchange): Promise<void>
  voice: {
    render(card: PersonaCard, text: string): Promise<RenderedLine>
    transcribe(bytes: Uint8Array, keep: boolean, dir: string): Promise<Transcribed>
    ready(): Promise<boolean>
  }
}

export interface WaitingMessage {
  threadId: string
  label: string
  text: string
  at: number
  personaId?: string
}

export interface SimcellStatus {
  enabled: boolean
  level?: CapabilityLevel
  failed: string[]
  live: boolean
  keepRecordings: boolean
}

export type ResolveAction = 'send' | 'edit' | 'rewrite' | 'discard'

const MAX_REPLY = 2000
const CALL_PREFIX = 'call:'
const OFFLINE = 'offline'
const UNASSIGNED = 'unassigned'

export class Simcell {
  private bridge: LiveBridge | undefined
  private enabled = false
  private keepRecordings = false
  private capability: CapabilityResult | undefined
  private readonly queue = new PQueue({ concurrency: 2 })
  private readonly chains = new Map<string, Promise<unknown>>()
  private readonly drafts = new Map<string, SimcellDraft>()
  /** Who each player message was addressed to, for building a persona's own thread. */
  private readonly owners = new Map<string, string>()
  private readonly assignments = new Map<string, string>()
  private readonly callLines = new Map<string, ThreadLine[]>()
  private readonly callTargets = new Map<string, string>()
  private readonly fired = new Set<string>()
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly deps: SimcellDeps) {}

  // ---- session ------------------------------------------------------------------------

  async attach(bridge: LiveBridge): Promise<void> {
    this.bridge = bridge
    await this.restore(bridge)
  }

  detach(): void {
    this.stopClock()
    this.bridge = undefined
    this.enabled = false
    this.keepRecordings = false
    this.drafts.clear()
    this.owners.clear()
    this.callLines.clear()
    this.callTargets.clear()
    this.fired.clear()
    this.deps.emit('queue-changed')
  }

  startClock(everyMs = 15_000): void {
    this.stopClock()
    this.timer = setInterval(() => void this.tick().catch(() => undefined), everyMs)
    this.timer.unref?.()
  }

  stopClock(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  // ---- status and options -------------------------------------------------------------

  status(): SimcellStatus {
    return {
      enabled: this.enabled,
      ...(this.capability ? { level: this.capability.level } : {}),
      failed: this.capability?.failed ?? [],
      live: !!this.bridge,
      keepRecordings: this.keepRecordings,
    }
  }

  /** Turning drafting on runs the capability check first; a model that fails it stays off. */
  async setOptions(opts: { enabled?: boolean; keepRecordings?: boolean }): Promise<SimcellStatus> {
    if (opts.keepRecordings !== undefined) this.keepRecordings = opts.keepRecordings
    if (opts.enabled === true) {
      this.capability = await this.deps.capability(false)
      this.enabled = this.capability.level !== 'not_suited'
      if (!this.enabled)
        throw new AppError(
          'VALIDATION',
          'This model did not pass the SimCell checks, so drafting stays off. Write replies by hand or route SimCell replies to a larger model.',
          { failed: this.capability.failed },
        )
    } else if (opts.enabled === false) {
      this.enabled = false
    }
    this.deps.emit('queue-changed')
    return this.status()
  }

  async runCapability(force = true): Promise<CapabilityResult> {
    this.capability = await this.deps.capability(force)
    if (this.capability.level === 'not_suited') this.enabled = false
    this.deps.emit('queue-changed')
    return this.capability
  }

  /** Limited models draft only on request (spec 0429 FR-22). */
  private get auto(): boolean {
    return this.enabled && this.capability?.level === 'suited'
  }

  private assertCanDraft(): void {
    if (this.capability?.level === 'not_suited')
      throw new AppError('VALIDATION', 'Drafting is off for this model. Write the reply by hand.')
  }

  // ---- incoming ---------------------------------------------------------------------

  /** A player message reached the SimCell. Routes it to a persona and drafts when allowed. */
  async onPlayerMessage(m: {
    messageId: string
    channel: string
    replyTo?: string
  }): Promise<void> {
    const personas = (await this.deps.personas()).personas
    const card = await this.route(m.channel, m.replyTo, personas)
    if (!card) return
    this.owners.set(m.messageId, card.id)
    if (this.auto) this.enqueue(card, m.channel, 'player_message', { inReplyTo: m.messageId })
    else this.deps.emit('queue-changed')
  }

  private async route(
    threadId: string,
    replyTo: string | undefined,
    personas: PersonaCard[],
  ): Promise<PersonaCard | undefined> {
    const byId = (id: string | undefined) => personas.find((p) => p.id === id)
    const assigned = byId(this.assignments.get(threadId))
    if (assigned) return assigned
    const last = this.bridge
      ?.thread(threadId)
      .filter((l) => l.from === 'controller')
      .at(-1)?.persona
    const spoke = last ? personas.find((p) => last.startsWith(p.displayName)) : undefined
    if (spoke) return spoke
    const row = replyTo ? await this.bridge?.rowForReply(replyTo) : undefined
    const linked = row ? personas.filter((p) => p.linkedRowIds.includes(row)) : []
    if (linked.length === 1) return linked[0]
    return personas.length === 1 ? personas[0] : undefined
  }

  assign(threadId: string, personaId: string): void {
    this.assignments.set(threadId, personaId)
    this.deps.emit('queue-changed')
  }

  // ---- drafting ---------------------------------------------------------------------

  /** Queue a background draft; one at a time per persona, two at a time overall (NFR-4). */
  private enqueue(
    card: PersonaCard,
    threadId: string,
    trigger: SimcellDraft['trigger'],
    extra: { inReplyTo?: string; why?: string; callId?: string; instruction?: string } = {},
  ): void {
    const prev = this.chains.get(card.id) ?? Promise.resolve()
    const next = prev
      .catch(() => undefined)
      .then(() => this.queue.add(() => this.produce(card, threadId, trigger, extra)))
      .catch((err: unknown) => this.failed(err))
    this.chains.set(card.id, next)
  }

  private failed(err: unknown): void {
    console.error('[simcell] draft failed:', err instanceof Error ? err.message : err)
    this.deps.emit('queue-changed')
  }

  /** Resolves when no background draft is running or waiting (tests, and quitting). */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.chains.values()])
    await this.queue.onIdle()
  }

  /** Draft now and wait for the result (a controller's "Draft a reply"). */
  async requestDraft(req: {
    personaId: string
    threadId: string
    instruction?: string
    replaces?: string
  }): Promise<SimcellDraft> {
    this.assertCanDraft()
    const card = await this.cardFor(req.personaId)
    if (req.replaces) await this.discardQuietly(req.replaces)
    const callId = req.threadId.startsWith(CALL_PREFIX)
      ? req.threadId.slice(CALL_PREFIX.length)
      : undefined
    const trigger = callId ? 'call_turn' : 'manual'
    const lastPlayer = this.lines(req.threadId, card.id)
      .filter((l) => l.who === 'player')
      .at(-1)
    return this.produce(
      card,
      req.threadId,
      lastPlayer ? (callId ? 'call_turn' : 'player_message') : trigger,
      {
        ...(req.instruction ? { instruction: req.instruction } : {}),
        ...(callId ? { callId } : {}),
      },
    )
  }

  /** A text from a facilitator without live play (FR-15). */
  async offlineTurn(personaId: string, playerText: string): Promise<SimcellDraft> {
    this.assertCanDraft()
    const card = await this.cardFor(personaId)
    return this.produce(card, OFFLINE, 'manual', { playerText })
  }

  private async cardFor(personaId: string): Promise<PersonaCard> {
    const card = (await this.deps.personas()).personas.find((p) => p.id === personaId)
    if (!card) throw new AppError('NOT_FOUND', 'No such persona')
    return card
  }

  private async produce(
    card: PersonaCard,
    threadId: string,
    trigger: SimcellDraft['trigger'],
    extra: {
      inReplyTo?: string
      why?: string
      callId?: string
      instruction?: string
      playerText?: string
    },
  ): Promise<SimcellDraft> {
    const [env, scenario, released, clock, all] = await Promise.all([
      this.deps.loadEnv(),
      this.deps.scenario(),
      this.deps.releasedRowIds(),
      this.deps.clock(),
      this.deps.personas(),
    ])
    this.rememberNames(all.personas)
    const thread = this.lines(threadId, card.id)
    const playerMessage = extra.playerText ?? this.pendingPlayerText(thread)
    const channel: PersonaChannel = extra.callId
      ? 'call'
      : threadId === OFFLINE
        ? 'message'
        : channelOf(card)
    const draft = await draftReply(env, {
      card,
      trigger,
      threadId,
      ...(extra.inReplyTo ? { inReplyTo: extra.inReplyTo } : {}),
      ...(extra.callId ? { callId: extra.callId } : {}),
      ...(this.capability ? { level: this.capability.level } : {}),
      context: {
        scenario,
        releasedRowIds: released,
        thread,
        clock,
        channel,
        trigger: extra.why ?? whyText(trigger),
        ...(playerMessage ? { playerMessage } : {}),
        ...(extra.instruction ? { instruction: extra.instruction } : {}),
        nowMs: this.deps.now(),
      },
    })
    this.drafts.set(draft.id, draft)
    await this.persist(draft)
    this.deps.emit('draft-ready', draft.id)
    this.deps.emit('queue-changed', draft.id)
    return draft
  }

  /** The player lines since the persona last spoke. */
  private pendingPlayerText(thread: readonly ThreadLine[]): string {
    const out: string[] = []
    for (let i = thread.length - 1; i >= 0 && thread[i]!.who === 'player'; i--)
      out.unshift(thread[i]!.text)
    return out.join('\n')
  }

  /** One persona's own thread (FR-9): its lines, and the player lines addressed to it. */
  private lines(threadId: string, personaId: string): ThreadLine[] {
    const calls = this.callLines.get(threadId)
    if (calls) return calls.slice(-THREAD_LINES)
    const card = this.personaNameCache.get(personaId)
    const lines = (this.bridge?.thread(threadId) ?? []).filter((l) =>
      l.from === 'player'
        ? this.owners.get(l.messageId) === personaId
        : !!card && !!l.persona && l.persona.startsWith(card),
    )
    return lines.slice(-THREAD_LINES).map((l) => ({
      who: l.from === 'player' ? ('player' as const) : ('persona' as const),
      text: l.text,
      exerciseTime: l.exerciseTime,
      at: l.at,
    }))
  }

  private readonly personaNameCache = new Map<string, string>()

  /** Keep persona names for thread filtering; call when the cards are loaded or changed. */
  rememberNames(cards: readonly PersonaCard[]): void {
    this.personaNameCache.clear()
    for (const c of cards) this.personaNameCache.set(c.id, c.displayName)
  }

  // ---- queue --------------------------------------------------------------------------

  /** Queued drafts, oldest unanswered message first, and the messages still waiting. */
  async list(): Promise<{ drafts: SimcellDraft[]; waiting: WaitingMessage[] }> {
    const cards = (await this.deps.personas()).personas
    this.rememberNames(cards)
    const drafts = [...this.drafts.values()]
      .filter((d) => d.status === 'queued')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return { drafts, waiting: this.waitingMessages(drafts) }
  }

  private waitingMessages(queued: readonly SimcellDraft[]): WaitingMessage[] {
    const covered = new Set(queued.map((d) => d.threadId))
    const out: WaitingMessage[] = []
    for (const threadId of this.bridge?.threadIds() ?? []) {
      if (covered.has(threadId)) continue
      const lines = this.bridge!.thread(threadId)
      const trailing: BridgeLine[] = []
      for (let i = lines.length - 1; i >= 0 && lines[i]!.from === 'player'; i--)
        trailing.unshift(lines[i]!)
      const first = trailing[0]
      if (!first) continue
      const owner = this.owners.get(first.messageId)
      out.push({
        threadId,
        label: this.bridge!.threadLabel(threadId),
        text: trailing
          .map((l) => l.text)
          .join('\n')
          .slice(0, 600),
        at: first.at,
        ...(owner ? { personaId: owner } : {}),
      })
    }
    for (const [threadId, lines] of this.callLines) {
      if (covered.has(threadId) || lines.at(-1)?.who !== 'player') continue
      out.push({
        threadId,
        label: `Call: ${this.callTargets.get(threadId) ?? 'players'}`,
        text: lines.at(-1)!.text.slice(0, 600),
        at: lines.at(-1)!.at,
      })
    }
    return out.sort((a, b) => a.at - b.at)
  }

  // ---- approval -----------------------------------------------------------------------

  async resolve(req: {
    draftId: string
    action: ResolveAction
    text?: string
    channel?: string
    asCall?: boolean
  }): Promise<SimcellDraft> {
    const draft = this.drafts.get(req.draftId)
    if (!draft || draft.status !== 'queued')
      throw new AppError('NOT_FOUND', 'That draft is no longer waiting')
    if (req.action === 'discard') return this.close(draft, 'discarded', '')
    const final = (req.action === 'send' ? draft.text : (req.text ?? '')).trim()
    if (!final || final.length > MAX_REPLY)
      throw new AppError('VALIDATION', `Write 1 to ${MAX_REPLY} characters`)
    const status =
      req.action === 'rewrite' ? 'rewritten' : final === draft.text.trim() ? 'sent' : 'edited'
    const card = await this.cardFor(draft.personaId)
    await this.deliver(draft, card, final, req)
    return this.close(draft, status, final)
  }

  private async deliver(
    draft: SimcellDraft,
    card: PersonaCard,
    text: string,
    req: { channel?: string; asCall?: boolean },
  ): Promise<void> {
    if (draft.threadId === OFFLINE) {
      await this.deps.saveExchange({
        id: newId(),
        at: nowIso(),
        personaId: card.id,
        personaName: card.displayName,
        playerText: draft.inReplyToText ?? '',
        replyText: text,
      })
      return
    }
    const bridge = this.bridge
    if (!bridge) throw new AppError('CONFLICT', 'No live session is running')
    const threadId = draft.threadId === UNASSIGNED ? (req.channel ?? '') : draft.threadId
    if (!threadId) throw new AppError('VALIDATION', 'Choose who receives this message')
    if (draft.callId || req.asCall) {
      await this.ring(bridge, card, text, threadId, draft.callId)
      return
    }
    await bridge.replyAs({
      channel: threadId,
      text,
      persona: personaLabel(card),
      ...(draft.inReplyTo ? { replyTo: draft.inReplyTo } : {}),
    })
    this.assignments.set(threadId, card.id)
  }

  /** Ring a thread with a line (a new call, or the next turn of `callId`). */
  private async ring(
    bridge: LiveBridge,
    card: PersonaCard,
    text: string,
    threadId: string,
    callId?: string,
  ): Promise<{ callId: string; turn: number }> {
    const rendered = await this.deps.voice.render(card, text).catch(() => undefined)
    const target =
      (callId && this.callTargets.get(`${CALL_PREFIX}${callId}`)) || bridge.destination(threadId)
    const ring = await bridge.ring({
      ...(callId ? { callId } : {}),
      targets: [target],
      personaId: card.id,
      persona: {
        name: card.displayName,
        ...(card.organization.name ? { organization: card.organization.name } : {}),
      },
      transcript: text,
      ...(rendered
        ? { audio: { bytes: rendered.bytes, mime: 'audio/wav', durationSec: rendered.durationSec } }
        : {}),
      canSpeak: await this.deps.voice.ready(),
      expectedWaitSec: 20,
    })
    const id = `${CALL_PREFIX}${ring.callId}`
    this.callTargets.set(id, target)
    const lines = this.callLines.get(id) ?? []
    lines.push({
      who: 'persona',
      text,
      exerciseTime: (await this.deps.clock()).label,
      at: this.deps.now(),
    })
    this.callLines.set(id, lines)
    this.assignments.set(id, card.id)
    return ring
  }

  /** A controller starts a call with a persona's opening line (FR-17). */
  async startCall(personaId: string, threadId: string, text: string) {
    const bridge = this.bridge
    if (!bridge) throw new AppError('CONFLICT', 'No live session is running')
    return this.ring(bridge, await this.cardFor(personaId), text.trim(), threadId)
  }

  async endCall(callId: string): Promise<void> {
    if (!this.bridge) throw new AppError('CONFLICT', 'No live session is running')
    await this.bridge.endCall(callId)
  }

  private async close(
    draft: SimcellDraft,
    status: 'sent' | 'edited' | 'rewritten' | 'discarded',
    finalText: string,
  ): Promise<SimcellDraft> {
    const done: SimcellDraft = {
      ...draft,
      status,
      resolvedAt: nowIso(),
      ...(finalText ? { finalText } : {}),
    }
    this.drafts.set(done.id, done)
    await this.persist(done)
    await this.bridge?.log({
      kind: 'simcell.draft',
      ex: (await this.deps.clock()).label,
      actor: { kind: 'controller' },
      data: {
        draftId: done.id,
        personaId: done.personaId,
        status,
        trigger: done.trigger,
        intent: done.intent,
        draft: done.text,
        final: finalText,
        edited: status === 'edited' || status === 'rewritten',
        flags: done.flags.map((f) => f.code),
        applied: done.applied,
      },
    })
    this.deps.emit('queue-changed', done.id)
    return done
  }

  private async discardQuietly(draftId: string): Promise<void> {
    const old = this.drafts.get(draftId)
    if (old?.status === 'queued') await this.close(old, 'discarded', '')
  }

  // ---- persona clocks -----------------------------------------------------------------

  /** Check deadlines and escalation rules; due ones are drafted once and queued (FR-8). */
  async tick(): Promise<number> {
    if (!this.auto || !this.bridge) return 0
    const personas = (await this.deps.personas()).personas
    this.rememberNames(personas)
    const clock = await this.deps.clock()
    const threads = new Map<string, readonly ThreadLine[]>()
    for (const p of personas) {
      const own = [...this.assignments].filter(([, id]) => id === p.id).map(([t]) => t)
      const lines = own.flatMap((t) => this.lines(t, p.id)).sort((a, b) => a.at - b.at)
      threads.set(p.id, lines)
    }
    const due = dueTriggers(personas, {
      clockMinutes: clock.minutes,
      releasedRowIds: await this.deps.releasedRowIds(),
      threads,
      fired: this.fired,
      nowMs: this.deps.now(),
    })
    for (const t of due) {
      this.fired.add(t.key)
      const card = personas.find((p) => p.id === t.personaId)!
      const own = [...this.assignments].find(([, id]) => id === card.id)?.[0]
      this.enqueue(card, own ?? UNASSIGNED, t.kind === 'deadline' ? 'deadline' : 'escalation', {
        why: t.why,
      })
    }
    return due.length
  }

  // ---- calls --------------------------------------------------------------------------

  /** A player answered a call turn, by text or recording. */
  async onCallAnswer(a: {
    callId: string
    turn: number
    personaId?: string
    text?: string
    audio?: Uint8Array
  }): Promise<void> {
    const threadId = `${CALL_PREFIX}${a.callId}`
    let text = a.text?.trim() ?? ''
    if (a.audio) {
      const dir = join(this.bridge?.dir ?? '', 'calls')
      try {
        const heard = await this.deps.voice.transcribe(a.audio, this.keepRecordings, dir)
        text = heard.text
        if (text) await this.bridge?.noteTranscript(a.callId, a.turn, text)
      } catch (err) {
        console.error('[simcell] transcription failed:', err instanceof Error ? err.message : err)
      }
    }
    const lines = this.callLines.get(threadId) ?? []
    lines.push({
      who: 'player',
      text: text || '(The recording could not be transcribed.)',
      exerciseTime: (await this.deps.clock()).label,
      at: this.deps.now(),
    })
    this.callLines.set(threadId, lines)
    const card = a.personaId ? await this.cardFor(a.personaId).catch(() => undefined) : undefined
    if (card && text && this.auto) this.enqueue(card, threadId, 'call_turn', { callId: a.callId })
    else this.deps.emit('queue-changed')
  }

  /** The call ended: its thread is no longer waiting for a reply. */
  onCallEnded(callId: string): void {
    this.callLines.delete(`${CALL_PREFIX}${callId}`)
    this.deps.emit('queue-changed')
  }

  // ---- persistence --------------------------------------------------------------------

  private async persist(draft: SimcellDraft): Promise<void> {
    if (!this.bridge) return
    await fs.mkdir(this.bridge.dir, { recursive: true })
    await fs.appendFile(join(this.bridge.dir, 'simcell.jsonl'), `${JSON.stringify(draft)}\n`)
  }

  /** Read `simcell.jsonl` back: the last line per draft wins; triggers already fired stay fired. */
  private async restore(bridge: LiveBridge): Promise<void> {
    const raw = await fs.readFile(join(bridge.dir, 'simcell.jsonl'), 'utf8').catch(() => '')
    for (const line of raw.split('\n')) {
      const parsed = SimcellDraftSchema.safeParse(safeJson(line))
      if (!parsed.success) continue
      this.drafts.set(parsed.data.id, parsed.data)
      const d = parsed.data
      if (d.trigger === 'deadline')
        for (const id of d.applied.deadlines) this.fired.add(`${d.personaId}:deadline:${id}`)
      if (d.trigger === 'escalation')
        for (const id of d.applied.rules) this.fired.add(`${d.personaId}:rule:${id}`)
    }
  }
}

function safeJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

const channelOf = (card: PersonaCard): PersonaChannel =>
  card.channels.includes('message') ? 'message' : (card.channels[0] ?? 'message')

const whyText = (trigger: SimcellDraft['trigger']): string =>
  trigger === 'call_turn'
    ? 'The players answered on a phone call. Reply as you would speak.'
    : trigger === 'manual'
      ? 'The controller asked this character to speak now.'
      : 'The players wrote to this character.'

/** Name and organization as players see them. */
export function personaLabel(card: PersonaCard): string {
  const org = card.organization.name.trim()
  const full = org ? `${card.displayName} (${org})` : card.displayName
  return full.length <= 80 ? full : card.displayName.slice(0, 80)
}
