/**
 * Messages between players and the SimCell (spec 0413). A thread is a channel: `role:<id>`,
 * `team:<slug>` or `client:<clientRef>` (the renderer and the log never see a live client id;
 * the wire channel for a device is `client:<clientId>`). Players write to the controller with
 * their channel in the payload; the controller checks the seat owns the channel, fetches and
 * checks the attachments, logs, and echoes the message to the channel so every device in the
 * seat has the thread and the sender gets its "sent" tick. The controller answers in a persona
 * through `message.send` to the channel, signed. State lives in memory with the session; the
 * log (`message`, `message.handled`, `message.star`, `message.pinned`) is the record.
 */
import type { BlobRef, ClientKind, Destination, MessageSendPayload } from '@shared/live/schemas'
import type {
  LiveMessage,
  MessageAttachment,
  MessageTarget,
  SessionLogInput,
  ThreadSummary,
} from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import type { StoredAttachment } from './attachments'

export const MAX_TEXT = 2000
/** A thread keeps this many messages; further player messages are logged as anomalies. */
export const MAX_THREAD_MESSAGES = 1000
const ID22 = /^[A-Za-z0-9_-]{22}$/

export interface MessageSeat {
  clientId: string
  kind: ClientKind
  roleId?: string
  teamId?: string
  /** Role or seat name, never a person's name. */
  label: string
  displayName?: string
}

export interface MessageRole {
  id: string
  name: string
  /** `team:` slug, when the role has a team. */
  teamId?: string
  teamName?: string
}

export interface MessagesDeps {
  send: (to: Destination, payload: Record<string, unknown>) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  roles: readonly MessageRole[]
  seats: () => MessageSeat[]
  seatOf: (clientId: string) => MessageSeat | undefined
  clientRef: (clientId: string) => Promise<string>
  getBlob: (ref: BlobRef) => Promise<Uint8Array>
  store: (ref: BlobRef, bytes: Uint8Array) => Promise<StoredAttachment>
  /** Exercise time `H:MM` now, and whether the exercise has not started. */
  clock: () => Promise<{ time: string; pre: boolean }>
  now: () => number
  newId: () => string
  changed: (threadId: string) => void
}

interface Thread {
  id: string
  messages: LiveMessage[]
  viewedAt: number
  lastPersona?: string
}

type PlayerSeat = MessageSeat & { roleId: string }
const isPlayerSeat = (s: MessageSeat | undefined): s is PlayerSeat =>
  s?.kind === 'player' && !!s.roleId

/** What a seat may read and write, as wire channels (spec 0413 FR-1). */
export function channelsFor(seat: MessageSeat): Destination[] {
  if (!isPlayerSeat(seat)) return []
  return [
    `role:${seat.roleId}`,
    ...(seat.teamId ? [`team:${seat.teamId}`] : []),
    `client:${seat.clientId}`,
  ]
}

/** When the oldest player message that still needs an answer arrived. */
export function waitingSince(messages: readonly LiveMessage[]): number | undefined {
  let oldest: number | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.from.kind === 'controller') break
    if (m.handledAt === undefined) oldest = m.at
  }
  return oldest
}

export class Messages {
  private readonly threads = new Map<string, Thread>()
  private readonly byId = new Map<string, { thread: Thread; msg: LiveMessage; refs: BlobRef[] }>()
  private readonly refToClient = new Map<string, string>()
  private readonly refLabel = new Map<string, string>()

  constructor(private readonly deps: MessagesDeps) {}

  // ---- players ----

  async onPlayerMessage(from: string, seq: number, p: MessageSendPayload): Promise<void> {
    const seat = this.deps.seatOf(from)
    const ref = await this.deps.clientRef(from)
    const reject = (what: string) => this.anomaly(ref, seq, what)
    if (!isPlayerSeat(seat)) return reject('message from a device without a player seat')
    this.refToClient.set(ref, from)
    this.refLabel.set(ref, seat.label)
    if (p.persona || p.echoOf || p.fromRole || p.showPlayedBy !== undefined)
      return reject('player message carries controller fields')
    const threadId = this.ownThread(seat, ref, p.channel)
    if (!threadId) return reject('message to a channel the seat does not own')
    const known = this.byId.get(p.messageId)
    if (known) return void (await this.echo(known.msg, known.refs, seat.roleId, p.channel))
    const text = p.text.trim()
    if (text.length > MAX_TEXT || (!text && p.attachments.length === 0))
      return reject('message text is empty or too long')
    if ((this.threads.get(threadId)?.messages.length ?? 0) >= MAX_THREAD_MESSAGES)
      return reject('thread is full')
    const { kept, rejected } = await this.fetchAll(p.attachments)
    const refs = kept.map((k) => k.ref)
    const msg = await this.build(threadId, {
      messageId: p.messageId,
      from: {
        kind: 'client',
        seat: seat.roleId,
        seatLabel: seat.label,
        clientRef: ref,
        ...(seat.displayName ? { displayName: seat.displayName } : {}),
      },
      text,
      attachments: kept.map((k) => k.attachment),
      ...(p.replyTo ? { replyTo: p.replyTo } : {}),
    })
    this.record(threadId, msg, refs)
    await this.logMessage(msg, seq, { rejectedAttachments: rejected })
    await this.echo(msg, refs, seat.roleId, p.channel)
    this.deps.changed(threadId)
  }

  private ownThread(seat: PlayerSeat, ref: string, wire: string): string | undefined {
    if (!channelsFor(seat).includes(wire as Destination)) return undefined
    if (wire.startsWith('role:')) return wire
    const id = wire.startsWith('client:') ? `client:${ref}` : wire
    return this.threads.has(id) ? id : undefined
  }

  private async fetchAll(refs: readonly BlobRef[]) {
    const kept: { ref: BlobRef; attachment: MessageAttachment }[] = []
    let rejected = Math.max(0, refs.length - 3)
    for (const ref of refs.slice(0, 3)) {
      try {
        if (ref.kind !== 'image') throw new AppError('VALIDATION', 'Only images')
        const bytes = await this.deps.getBlob(ref)
        const stored = await this.deps.store(ref, bytes)
        kept.push({
          ref,
          attachment: {
            blobId: ref.blobId,
            mime: stored.mime,
            bytes: bytes.length,
            sha256: stored.sha256,
            ...(ref.width ? { width: ref.width } : {}),
            ...(ref.height ? { height: ref.height } : {}),
            path: stored.path,
          },
        })
      } catch {
        rejected += 1
      }
    }
    return { kept, rejected }
  }

  private async echo(msg: LiveMessage, refs: BlobRef[], roleId: string, wire: string) {
    await this.deps.send(wire as Destination, {
      messageId: this.deps.newId(),
      channel: wire,
      text: msg.text,
      attachments: refs,
      echoOf: msg.messageId,
      fromRole: roleId,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    })
  }

  // ---- controller ----

  async sendControllerMessage(req: {
    channel: string
    text: string
    persona: string
    showPlayedBy?: boolean
    replyTo?: string
  }): Promise<LiveMessage> {
    const text = req.text.trim()
    const persona = req.persona.trim()
    if (!text || text.length > MAX_TEXT)
      throw new AppError('VALIDATION', 'Write 1 to 2000 characters')
    if (!persona || persona.length > 80) throw new AppError('VALIDATION', 'Pick who is speaking')
    if (req.replyTo !== undefined && !ID22.test(req.replyTo))
      throw new AppError('VALIDATION', 'Reply target is not valid')
    const wire = this.wireChannel(req.channel)
    const showPlayedBy = req.showPlayedBy ?? true
    const msg = await this.build(req.channel, {
      messageId: this.deps.newId(),
      from: { kind: 'controller', persona },
      text,
      attachments: [],
      showPlayedBy,
      ...(req.replyTo ? { replyTo: req.replyTo } : {}),
    })
    await this.deps.send(wire, {
      messageId: msg.messageId,
      channel: wire,
      text,
      persona,
      showPlayedBy,
      attachments: [],
      ...(req.replyTo ? { replyTo: req.replyTo } : {}),
    })
    this.record(req.channel, msg, [])
    this.threads.get(req.channel)!.lastPersona = persona
    await this.logMessage(msg)
    this.deps.changed(req.channel)
    return msg
  }

  /** The wire destination of a thread id; throws for a channel this session cannot reach. */
  private wireChannel(threadId: string): Destination {
    const roles = this.deps.roles
    if (threadId.startsWith('role:') && roles.some((r) => `role:${r.id}` === threadId))
      return threadId
    if (threadId.startsWith('team:') && roles.some((r) => `team:${r.teamId}` === threadId))
      return threadId
    const client = threadId.startsWith('client:')
      ? this.refToClient.get(threadId.slice(7))
      : undefined
    if (client) return `client:${client}`
    throw new AppError('VALIDATION', 'There is no such role, team or device to message')
  }

  /** Validate a channel and say what it would look like as a thread (no message yet). */
  openThread(threadId: string): ThreadSummary {
    this.wireChannel(threadId)
    return this.summary(this.threads.get(threadId) ?? { id: threadId, messages: [], viewedAt: 0 })
  }

  async targets(): Promise<MessageTarget[]> {
    const out: MessageTarget[] = []
    const teams = new Map<string, string>()
    for (const r of this.deps.roles) {
      out.push({ channel: `role:${r.id}`, label: r.name })
      if (r.teamId && r.teamName) teams.set(r.teamId, r.teamName)
    }
    for (const [id, name] of teams) out.push({ channel: `team:${id}`, label: `${name} (team)` })
    const count = new Map<string, number>()
    for (const seat of this.deps.seats().filter(isPlayerSeat)) {
      const ref = await this.deps.clientRef(seat.clientId)
      this.refToClient.set(ref, seat.clientId)
      const n = (count.get(seat.roleId) ?? 0) + 1
      count.set(seat.roleId, n)
      const label = `${seat.label} (device ${n})`
      this.refLabel.set(ref, label)
      out.push({ channel: `client:${ref}`, label })
    }
    return out
  }

  // ---- marks ----

  async markHandled(messageId: string): Promise<void> {
    const { thread, msg } = this.find(messageId)
    if (msg.from.kind !== 'client')
      throw new AppError('VALIDATION', 'Only a player message can be handled')
    if (msg.handledAt !== undefined) return
    msg.handledAt = this.deps.now()
    await this.logMark('message.handled', thread, msg, {})
    this.deps.changed(thread.id)
  }

  async star(messageId: string, on: boolean): Promise<void> {
    const { thread, msg } = this.find(messageId)
    if (msg.starred === on) return
    msg.starred = on
    await this.logMark('message.star', thread, msg, { on })
    this.deps.changed(thread.id)
  }

  /** Pin to the hot wash: a log entry the hot wash tab and the AAR read (spec 0413 FR-11). */
  async pin(messageId: string): Promise<void> {
    const { thread, msg } = this.find(messageId)
    if (msg.pinned) return
    msg.pinned = true
    const who = msg.from.kind === 'client' ? msg.from.seatLabel : msg.from.persona
    await this.logMark('message.pinned', thread, msg, { from: who, text: msg.text.slice(0, 500) })
    this.deps.changed(thread.id)
  }

  private find(messageId: string) {
    const found = this.byId.get(messageId)
    if (!found) throw new AppError('NOT_FOUND', 'No such message')
    return found
  }

  // ---- reads ----

  summaries(): ThreadSummary[] {
    return [...this.threads.values()]
      .map((t) => this.summary(t))
      .sort((a, b) => b.lastActivity - a.lastActivity)
  }

  /** The thread's messages; opening it marks its player messages as seen. */
  thread(threadId: string): LiveMessage[] {
    const t = this.threads.get(threadId)
    if (!t) return []
    t.viewedAt = this.deps.now()
    return t.messages.map((m) => ({ ...m }))
  }

  private summary(t: Thread): ThreadSummary {
    const last = t.messages.at(-1)
    const waiting = waitingSince(t.messages)
    return {
      channel: t.id,
      label: this.label(t.id),
      messages: t.messages.length,
      lastActivity: last?.at ?? 0,
      lastText: (last?.text ?? '').slice(0, 200),
      unread: t.messages.filter((m) => m.from.kind === 'client' && m.at > t.viewedAt).length,
      ...(waiting !== undefined ? { waitingSince: waiting } : {}),
      ...(t.lastPersona ? { lastPersona: t.lastPersona } : {}),
    }
  }

  private label(id: string): string {
    const roles = this.deps.roles
    if (id.startsWith('role:')) return roles.find((r) => `role:${r.id}` === id)?.name ?? id
    if (id.startsWith('team:'))
      return `${roles.find((r) => `team:${r.teamId}` === id)?.teamName ?? id} (team)`
    return this.refLabel.get(id.slice(7)) ?? 'Device'
  }

  // ---- internals ----

  private async build(
    channel: string,
    part: Pick<LiveMessage, 'messageId' | 'from' | 'text' | 'attachments'> & Partial<LiveMessage>,
  ): Promise<LiveMessage> {
    const clock = await this.deps.clock()
    return {
      ...part,
      channel,
      at: this.deps.now(),
      exerciseTime: clock.time,
      starred: false,
      pinned: false,
    }
  }

  private record(threadId: string, msg: LiveMessage, refs: BlobRef[]): void {
    let thread = this.threads.get(threadId)
    if (!thread) {
      thread = { id: threadId, messages: [], viewedAt: 0 }
      this.threads.set(threadId, thread)
    }
    thread.messages.push(msg)
    this.byId.set(msg.messageId, { thread, msg, refs })
  }

  private async logMessage(msg: LiveMessage, seq?: number, extra: Record<string, unknown> = {}) {
    const clock = await this.deps.clock()
    const from = msg.from
    await this.deps.log.append({
      kind: 'message',
      ex: msg.exerciseTime,
      actor:
        from.kind === 'client'
          ? {
              kind: 'client',
              clientRef: from.clientRef,
              seat: { kind: 'player', roleId: from.seat },
              ...(from.displayName ? { displayName: from.displayName } : {}),
            }
          : { kind: 'controller', persona: from.persona },
      ref: { messageId: msg.messageId, channel: msg.channel },
      data: {
        text: msg.text,
        blobIds: msg.attachments.map((a) => a.blobId),
        ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
        ...(clock.pre ? { preExercise: true } : {}),
        ...extra,
      },
      ...(from.kind === 'client' && seq !== undefined
        ? { env: { from: from.clientRef, seq } }
        : {}),
    })
  }

  private async logMark(
    kind: 'message.handled' | 'message.star' | 'message.pinned',
    thread: Thread,
    msg: LiveMessage,
    data: Record<string, unknown>,
  ) {
    await this.deps.log.append({
      kind,
      ex: (await this.deps.clock()).time,
      actor: { kind: 'controller' },
      ref: { messageId: msg.messageId, channel: thread.id },
      data,
    })
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
