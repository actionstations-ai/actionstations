/**
 * Hot wash contributions from devices (spec 0415). Players and evaluators post strengths,
 * improvements and answers; the controller applies the attribution rule before anything is
 * logged or broadcast, shows accepted items on every device, and keeps the board the
 * facilitator groups, edits, hides and promotes. State lives in memory with the session; the
 * log (`hotwash.*`) is the record, and promoting hands back an entry for
 * `FacilitatorState.hotwash` (the AAR reads it there).
 */
import type { ClientKind, Destination, HotwashItemPayload } from '@shared/live/schemas'
import {
  DEVICE_HOTWASH_PREFIX,
  type BoardView,
  type HotWashGroup,
  type HotWashItem,
  type PromotedEntry,
  type SessionLogInput,
} from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { AppError } from '../lib/errors'

export const MAX_TEXT = 2000
export const MAX_ITEMS = 1000
export const MAX_ITEMS_PER_DEVICE = 100
/** A player may withdraw an item this long after posting it (spec 0415 FR-9). */
export const RETRACT_WINDOW_MS = 2 * 60_000
const OPEN_TEXT = 'The hot wash is open. Add what went well and what to improve from your device.'
const CLOSE_TEXT = 'The hot wash is closed.'

export interface HotWashSeat {
  clientId: string
  kind: ClientKind
  roleId?: string
  /** Role or seat name, never a person's name. */
  label: string
  /** Set in a named session only. */
  displayName?: string
}

export interface HotWashQuestion {
  id: string
  topic?: string
  text: string
}

export interface HotWashPrompts {
  method: string
  methodDescription?: string
  questions: HotWashQuestion[]
}

/** The scenario's hot wash method and questions as devices get them in `welcome` (at most 10). */
export function hotwashPrompts(hotwash: Scenario['hotwash']): HotWashPrompts {
  const questions = (hotwash?.questions ?? []).slice(0, 10).map((q, i) => ({
    id: `hwq-${i + 1}`,
    ...(q.topic.trim() ? { topic: q.topic.trim().slice(0, 80) } : {}),
    text: q.text.slice(0, 500),
  }))
  const description = hotwash?.methodDescription.trim().slice(0, 500)
  return {
    method: (hotwash?.method || '3up3down').slice(0, 60),
    ...(description ? { methodDescription: description } : {}),
    questions,
  }
}

export interface HotWashDeps {
  send: (
    type: 'hotwash.update' | 'controller.notice',
    to: Destination,
    payload: Record<string, unknown>,
  ) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  seatOf: (clientId: string) => HotWashSeat | undefined
  clientRef: (clientId: string) => Promise<string>
  questions: readonly HotWashQuestion[]
  clock: () => Promise<{ time: string }>
  now: () => number
  newId: () => string
  changed: () => void
}

/** What the controller keeps for an item; `clientRef` never leaves this module. */
interface Stored extends Omit<HotWashItem, 'plus'> {
  /** The seat to show on devices; absent when posted anonymously. */
  roleId?: string
  clientRef: string
  plusBy: Set<string>
  retracted: boolean
}

type PlayerLike = HotWashSeat & { roleId: string }
const mayPost = (s: HotWashSeat | undefined): s is PlayerLike =>
  !!s && !!s.roleId && (s.kind === 'player' || s.kind === 'evaluator')

const countKind = (a: HotWashItem['kind'], list: readonly HotWashItem['kind'][]) =>
  list.filter((k) => k === a).length

export class HotWash {
  private open = false
  private review = false
  private readonly items = new Map<string, Stored>()
  private readonly groups = new Map<string, HotWashGroup>()

  constructor(private readonly deps: HotWashDeps) {}

  // ---- opening and closing ----

  async openOnDevices(review: boolean, text?: string): Promise<void> {
    this.review = review
    if (!this.open) {
      this.open = true
      await this.notice('hotwash.open', text?.trim() || OPEN_TEXT)
      await this.logControl('hotwash.open', { review })
    }
    this.deps.changed()
  }

  async closeOnDevices(): Promise<void> {
    if (this.open) {
      this.open = false
      await this.notice('hotwash.close', CLOSE_TEXT)
      await this.logControl('hotwash.close', {})
    }
    this.deps.changed()
  }

  /** Switch moderation; items already waiting stay in the inbox. */
  setReview(review: boolean): void {
    this.review = review
    this.deps.changed()
  }

  private async notice(kind: 'hotwash.open' | 'hotwash.close', text: string) {
    await this.deps.send('controller.notice', 'all', {
      noticeId: this.deps.newId(),
      kind,
      level: 'info',
      text,
      targets: ['all'],
      dismissible: true,
    })
  }

  // ---- devices ----

  async onItem(from: string, seq: number, p: HotwashItemPayload): Promise<void> {
    const seat = this.deps.seatOf(from)
    const ref = await this.deps.clientRef(from)
    const drop = (what: string) => this.anomaly(ref, seq, what)
    if (!mayPost(seat)) return drop('hot wash item from a seat that may not post')
    if (p.plusOneOf) return this.plusOne(ref, seq, p.plusOneOf)
    if (p.retractOf) return this.retract(ref, seq, p.retractOf)
    if (!this.open) return drop('hot wash item while the hot wash is closed')
    const known = this.items.get(p.itemId)
    if (known) {
      if (known.clientRef === ref && known.accepted && !known.hidden)
        await this.showOnDevices(known)
      return
    }
    const text = p.text.trim()
    if (!text || text.length > MAX_TEXT) return drop('hot wash item text is empty or too long')
    if (this.items.size >= MAX_ITEMS) return drop('hot wash board is full')
    if (this.countFrom(ref) >= MAX_ITEMS_PER_DEVICE) return drop('too many hot wash items')
    const item = await this.build(seat, ref, text, p)
    this.items.set(item.itemId, item)
    await this.logItem(item, seat, seq)
    if (!this.review) await this.accept(item)
    this.deps.changed()
  }

  private countFrom(ref: string): number {
    let n = 0
    for (const i of this.items.values()) if (i.clientRef === ref) n += 1
    return n
  }

  /** The attribution rule (spec 0415 FR-3): an anonymous item never carries a seat or a name. */
  private async build(
    seat: PlayerLike,
    clientRef: string,
    text: string,
    p: HotwashItemPayload,
  ): Promise<Stored> {
    const named = !p.anonymous
    const question = this.deps.questions.some((q) => q.id === p.questionId)
    return {
      itemId: p.itemId,
      kind: p.kind,
      text,
      anonymous: p.anonymous,
      ...(named ? { roleLabel: seat.label, roleId: seat.roleId } : {}),
      ...(named && seat.displayName ? { displayName: seat.displayName } : {}),
      ...(question && p.questionId ? { questionId: p.questionId } : {}),
      ...(p.mselRowId ? { mselRowId: p.mselRowId } : {}),
      ...(p.objectiveId ? { objectiveId: p.objectiveId } : {}),
      at: this.deps.now(),
      exerciseTime: (await this.deps.clock()).time,
      accepted: false,
      hidden: false,
      promoted: false,
      clientRef,
      plusBy: new Set(),
      retracted: false,
    }
  }

  private async plusOne(ref: string, seq: number, itemId: string): Promise<void> {
    const item = this.items.get(itemId)
    if (!item || !item.accepted || item.hidden)
      return this.anomaly(ref, seq, '+1 for an unknown item')
    if (item.clientRef === ref || item.plusBy.has(ref)) return
    item.plusBy.add(ref)
    await this.deps.log.append({
      kind: 'hotwash.plus',
      ex: (await this.deps.clock()).time,
      actor: { kind: 'client', clientRef: ref },
      ref: { itemId },
      data: {},
      env: { from: ref, seq },
    })
    await this.update({ itemId, action: 'tag', plus: item.plusBy.size })
    this.deps.changed()
  }

  private async retract(ref: string, seq: number, itemId: string): Promise<void> {
    const item = this.items.get(itemId)
    if (!item || item.clientRef !== ref)
      return this.anomaly(ref, seq, 'withdraw of an item that is not theirs')
    if (item.hidden && item.retracted) return
    if (item.promoted) return this.anomaly(ref, seq, 'withdraw of a promoted item refused')
    if (this.deps.now() - item.at > RETRACT_WINDOW_MS)
      return this.anomaly(ref, seq, 'withdraw after the two minute window')
    item.hidden = true
    item.retracted = true
    await this.logItemEvent('hotwash.retract', item, {}, ref, seq)
    if (item.accepted) await this.update({ itemId, action: 'hide' })
    this.deps.changed()
  }

  // ---- facilitator actions ----

  /** Show items that waited in the inbox. */
  async acceptItems(ids: string[]): Promise<void> {
    for (const item of this.pick(ids)) {
      if (item.accepted) continue
      await this.accept(item)
      await this.logItemEvent('hotwash.update', item, { action: 'accept' })
    }
    this.deps.changed()
  }

  async hideItems(ids: string[]): Promise<void> {
    for (const item of this.pick(ids)) {
      this.refuseIfPromoted(item)
      if (item.hidden) continue
      item.hidden = true
      if (item.accepted) await this.update({ itemId: item.itemId, action: 'hide' })
      await this.logItemEvent('hotwash.update', item, { action: 'hide' })
    }
    this.deps.changed()
  }

  async restoreItems(ids: string[]): Promise<void> {
    for (const item of this.pick(ids)) {
      if (!item.hidden) continue
      if (item.retracted) throw new AppError('VALIDATION', 'The person who posted this withdrew it')
      item.hidden = false
      await this.logItemEvent('hotwash.update', item, { action: 'restore' })
      if (item.accepted) await this.showOnDevices(item)
    }
    this.deps.changed()
  }

  async editItem(id: string, text: string): Promise<void> {
    const [item] = this.pick([id])
    const after = text.trim()
    if (!item) throw new AppError('NOT_FOUND', 'No such item')
    if (!after || after.length > MAX_TEXT)
      throw new AppError('VALIDATION', 'Write 1 to 2000 characters')
    this.refuseIfPromoted(item)
    const before = item.text
    item.originalText ??= before
    item.text = after
    await this.logItemEvent('hotwash.update', item, { action: 'edit', before, after, text: after })
    if (item.accepted && !item.hidden)
      await this.update({ itemId: id, action: 'edit', text: after })
    this.deps.changed()
  }

  async tagItems(
    ids: string[],
    tags: { objectiveId?: string | null; capability?: string | null; mselRowId?: string | null },
  ): Promise<void> {
    for (const item of this.pick(ids)) {
      for (const key of ['objectiveId', 'capability', 'mselRowId'] as const) {
        const v = tags[key]
        if (v === null) delete item[key]
        else if (v !== undefined) item[key] = v
      }
      await this.logItemEvent('hotwash.update', item, { action: 'tag', ...tags })
    }
    this.deps.changed()
  }

  /** Put items in one group (merging any groups they are in) and say what it is called. */
  async groupItems(ids: string[], label?: string): Promise<void> {
    const items = this.pick(ids)
    if (items.length < 2) throw new AppError('VALIDATION', 'Pick at least two items to group')
    const involved = new Set(items.flatMap((i) => (i.groupId ? [i.groupId] : [])))
    for (const g of involved) this.refuseGroupPromoted(g)
    const target = [...involved][0] ?? this.deps.newId()
    const merged = new Set(items.map((i) => i.itemId))
    for (const g of involved) for (const m of this.groups.get(g)?.itemIds ?? []) merged.add(m)
    const first = this.groups.get(target)
    const name = label?.trim() || first?.label
    this.groups.set(target, {
      groupId: target,
      itemIds: [...merged],
      promoted: false,
      ...(name ? { label: name } : {}),
    })
    for (const g of involved) if (g !== target) this.groups.delete(g)
    for (const id of merged) this.items.get(id)!.groupId = target
    await this.announceGroup(target)
    await this.logGroup('group', target, [...merged])
    this.deps.changed()
  }

  async labelGroup(id: string, label: string): Promise<void> {
    const groupId = this.items.get(id)?.groupId ?? id
    const group = this.groups.get(groupId)
    if (!group) throw new AppError('NOT_FOUND', 'No such group')
    this.refuseGroupPromoted(groupId)
    group.label = label.trim().slice(0, 120) || undefined
    await this.announceGroup(groupId)
    await this.logGroup('label', groupId, group.itemIds, group.label)
    this.deps.changed()
  }

  /** Take items out of their groups; a group left with one item dissolves. */
  async ungroupItems(ids: string[]): Promise<void> {
    const touched = new Set<string>()
    for (const item of this.pick(ids)) if (item.groupId) touched.add(item.groupId)
    for (const g of touched) this.refuseGroupPromoted(g)
    const leaving = new Set(ids)
    for (const g of touched) await this.shrinkGroup(g, leaving)
    this.deps.changed()
  }

  private async shrinkGroup(groupId: string, leaving: Set<string>): Promise<void> {
    const group = this.groups.get(groupId)!
    const stay = group.itemIds.filter((i) => !leaving.has(i))
    const left = group.itemIds.filter((i) => leaving.has(i) || stay.length < 2)
    for (const id of left) {
      const item = this.items.get(id)
      if (!item) continue
      delete item.groupId
      if (item.accepted && !item.hidden) await this.update({ itemId: id, action: 'ungroup' })
    }
    if (stay.length < 2) this.groups.delete(groupId)
    else {
      group.itemIds = stay
      await this.announceGroup(groupId)
    }
    await this.logGroup('ungroup', groupId, left)
  }

  // ---- promote ----

  /** Promote an item (or the group it is in) and return the facilitator-state entry. */
  async promote(id: string): Promise<PromotedEntry> {
    const groupId = this.items.get(id)?.groupId ?? (this.groups.has(id) ? id : undefined)
    const members = groupId ? this.visibleMembers(groupId) : this.pick([id])
    if (members.length === 0 || members.some((m) => !m.accepted || m.hidden))
      throw new AppError('VALIDATION', 'Only items shown on the board can be promoted')
    const key = groupId ?? id
    if (groupId) this.groups.get(groupId)!.promoted = true
    const entry = this.entryFor(key, groupId, members)
    for (const m of members) {
      m.promoted = true
      await this.update({ itemId: m.itemId, action: 'promote', ...(groupId ? { groupId } : {}) })
      await this.logItemEvent('hotwash.promoted', m, {
        id: entry.id,
        text: entry.text,
        memberItemIds: members.map((x) => x.itemId),
      })
    }
    this.deps.changed()
    return entry
  }

  async unpromote(id: string): Promise<string> {
    const groupId = this.items.get(id)?.groupId ?? (this.groups.has(id) ? id : undefined)
    const members = groupId ? this.visibleMembers(groupId) : this.pick([id])
    if (groupId) this.groups.get(groupId)!.promoted = false
    for (const m of members) {
      m.promoted = false
      await this.update({ itemId: m.itemId, action: 'unpromote' })
      await this.logItemEvent('hotwash.unpromoted', m, {
        id: DEVICE_HOTWASH_PREFIX + (groupId ?? id),
      })
    }
    this.deps.changed()
    return DEVICE_HOTWASH_PREFIX + (groupId ?? id)
  }

  private entryFor(key: string, groupId: string | undefined, members: Stored[]): PromotedEntry {
    const group = groupId ? this.groups.get(groupId) : undefined
    const first = members[0]!
    const base = group ? group.label || first.text : first.text
    const text = group ? `${base} (${members.length} contributions)` : base
    const kinds = members.map((m) => m.kind)
    const kind = [...kinds].sort((a, b) => countKind(b, kinds) - countKind(a, kinds))[0]!
    const objective = members.find((m) => m.objectiveId)?.objectiveId
    const row = members.find((m) => m.mselRowId)?.mselRowId
    return {
      id: DEVICE_HOTWASH_PREFIX + key,
      kind,
      text: text.slice(0, 4000),
      ...(objective ? { objectiveRef: objective } : {}),
      ...(row ? { rowId: row } : {}),
      at: new Date(this.deps.now()).toISOString(),
    }
  }

  // ---- reads ----

  board(): BoardView {
    const items = [...this.items.values()]
      .sort((a, b) => a.at - b.at)
      .map(({ clientRef: _c, roleId: _s, plusBy, retracted: _r, ...rest }) => ({
        ...rest,
        plus: plusBy.size,
      }))
    return {
      open: this.open,
      review: this.review,
      items,
      groups: [...this.groups.values()].map((g) => ({ ...g, itemIds: [...g.itemIds] })),
      questions: this.deps.questions.map((q) => ({ ...q })),
    }
  }

  // ---- internals ----

  private pick(ids: string[]): Stored[] {
    const out: Stored[] = []
    for (const id of ids) {
      const item = this.items.get(id)
      if (!item) throw new AppError('NOT_FOUND', 'No such item')
      out.push(item)
    }
    return out
  }

  private visibleMembers(groupId: string): Stored[] {
    const ids = this.groups.get(groupId)?.itemIds ?? []
    return ids.flatMap((i) => this.items.get(i) ?? []).filter((i) => !i.hidden)
  }

  private refuseIfPromoted(item: Stored): void {
    if (item.promoted)
      throw new AppError('VALIDATION', 'This item is promoted. Unpromote it first.')
  }

  private refuseGroupPromoted(groupId: string): void {
    if (this.groups.get(groupId)?.promoted)
      throw new AppError('VALIDATION', 'This group is promoted. Unpromote it first.')
  }

  private async accept(item: Stored): Promise<void> {
    item.accepted = true
    await this.showOnDevices(item)
  }

  /** Tell every device about an accepted item, with its group when it has one. */
  private async showOnDevices(item: Stored): Promise<void> {
    await this.update({
      itemId: item.itemId,
      action: 'accept',
      text: item.text,
      kind: item.kind,
      ...(item.roleId ? { roleId: item.roleId } : {}),
      ...(item.mselRowId ? { mselRowId: item.mselRowId } : {}),
    })
    if (item.groupId) await this.announceGroup(item.groupId, [item.itemId])
    if (item.plusBy.size)
      await this.update({ itemId: item.itemId, action: 'tag', plus: item.plusBy.size })
    if (item.promoted) await this.update({ itemId: item.itemId, action: 'promote' })
  }

  private async announceGroup(groupId: string, only?: string[]): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) return
    for (const id of only ?? group.itemIds) {
      const item = this.items.get(id)
      if (!item?.accepted || item.hidden) continue
      await this.update({
        itemId: id,
        action: 'group',
        groupId,
        ...(group.label ? { groupLabel: group.label } : {}),
      })
    }
  }

  private async update(payload: Record<string, unknown>): Promise<void> {
    await this.deps.send('hotwash.update', 'all', payload)
  }

  private async logControl(kind: 'hotwash.open' | 'hotwash.close', data: Record<string, unknown>) {
    await this.deps.log.append({
      kind,
      ex: (await this.deps.clock()).time,
      actor: { kind: 'controller' },
      data,
    })
  }

  private async logItem(item: Stored, seat: PlayerLike, seq: number): Promise<void> {
    await this.deps.log.append({
      kind: 'hotwash.item',
      ex: item.exerciseTime,
      actor: item.anonymous
        ? { kind: 'client', clientRef: item.clientRef }
        : {
            kind: 'client',
            clientRef: item.clientRef,
            seat: { kind: seat.kind, roleId: seat.roleId },
            ...(item.displayName ? { displayName: item.displayName } : {}),
          },
      ref: { itemId: item.itemId },
      data: {
        kind: item.kind,
        text: item.text,
        anonymous: item.anonymous,
        ...(item.questionId ? { questionId: item.questionId } : {}),
        ...(item.mselRowId ? { mselRowId: item.mselRowId } : {}),
        ...(item.objectiveId ? { objectiveId: item.objectiveId } : {}),
      },
      env: { from: item.clientRef, seq },
    })
  }

  private async logItemEvent(
    kind: 'hotwash.update' | 'hotwash.promoted' | 'hotwash.unpromoted' | 'hotwash.retract',
    item: Stored,
    data: Record<string, unknown>,
    ref?: string,
    seq?: number,
  ): Promise<void> {
    await this.deps.log.append({
      kind,
      ex: (await this.deps.clock()).time,
      actor: ref ? { kind: 'client', clientRef: ref } : { kind: 'controller' },
      ref: { itemId: item.itemId, ...(item.groupId ? { groupId: item.groupId } : {}) },
      data: { itemIds: [item.itemId], ...data },
      ...(ref && seq !== undefined ? { env: { from: ref, seq } } : {}),
    })
  }

  private async logGroup(action: string, groupId: string, itemIds: string[], label?: string) {
    await this.deps.log.append({
      kind: 'hotwash.update',
      ex: (await this.deps.clock()).time,
      actor: { kind: 'controller' },
      ref: { groupId },
      data: { action, itemIds, groupId, ...(label ? { label } : {}) },
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
