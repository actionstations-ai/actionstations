/**
 * The hot wash half of the scripted facilitator (spec 0415): what `src/main/live/hotwash.ts`
 * does for the real app, small enough for the player page's tests. It applies the attribution
 * rule, shows items on every device, counts +1s once per device, honours a withdrawal inside
 * two minutes, and lets a test hide, group, edit and promote. Development and tests only.
 */
import { toBase64Url } from '../../shared/live/bytes'
import type { Opened } from '../../shared/live/codec'
import type { HarnessController } from './controller'

export interface HarnessHotwashItem {
  itemId: string
  kind: 'strength' | 'improvement' | 'other'
  text: string
  anonymous: boolean
  /** The seat the controller saw; never put on the wire for an anonymous item. */
  fromRole: string
  clientId: string
  accepted: boolean
  hidden: boolean
  plusBy: Set<string>
  groupId?: string
  promoted: boolean
  at: number
}

export class HarnessHotwash {
  open = false
  review = false
  readonly items = new Map<string, HarnessHotwashItem>()
  /** What the log would hold: the actor fields only, so a test can check anonymity. */
  readonly logged: { itemId: string; anonymous: boolean; seat?: string }[] = []

  constructor(private readonly c: HarnessController) {}

  async openOnDevices(review = false, text = 'The hot wash is open.'): Promise<void> {
    this.open = true
    this.review = review
    await this.c.notice(text, { kind: 'hotwash.open' })
  }

  async closeOnDevices(text = 'The hot wash is closed.'): Promise<void> {
    this.open = false
    await this.c.notice(text, { kind: 'hotwash.close' })
  }

  async onItem(m: Opened<'hotwash.item'>): Promise<void> {
    const entry = this.c.roster.get(m.from)
    if (!entry?.roleId || (entry.kind !== 'player' && entry.kind !== 'evaluator')) return
    const p = m.payload
    if (p.plusOneOf) return this.plusOne(m.from, p.plusOneOf)
    if (p.retractOf) return this.retract(m.from, p.retractOf)
    if (!this.open || this.items.has(p.itemId) || !p.text.trim()) return
    const item: HarnessHotwashItem = {
      itemId: p.itemId,
      kind: p.kind,
      text: p.text.trim(),
      anonymous: p.anonymous,
      fromRole: entry.roleId,
      clientId: m.from,
      accepted: false,
      hidden: false,
      plusBy: new Set(),
      promoted: false,
      at: Date.now(),
    }
    this.items.set(item.itemId, item)
    this.logged.push({
      itemId: item.itemId,
      anonymous: item.anonymous,
      ...(item.anonymous ? {} : { seat: item.fromRole }),
    })
    if (!this.review) await this.accept(item.itemId)
  }

  private async plusOne(from: string, itemId: string): Promise<void> {
    const item = this.items.get(itemId)
    if (!item?.accepted || item.hidden || item.clientId === from || item.plusBy.has(from)) return
    item.plusBy.add(from)
    await this.send({ itemId, action: 'tag', plus: item.plusBy.size })
  }

  private async retract(from: string, itemId: string): Promise<void> {
    const item = this.items.get(itemId)
    if (!item || item.clientId !== from || item.promoted) return
    if (Date.now() - item.at > 2 * 60_000) return
    item.hidden = true
    await this.send({ itemId, action: 'hide' })
  }

  /** Put an item on every device (review mode: the facilitator's Accept). */
  async accept(itemId: string): Promise<void> {
    const item = this.items.get(itemId)
    if (!item) throw new Error('No such hot wash item')
    item.accepted = true
    await this.send({
      itemId,
      action: 'accept',
      text: item.text,
      kind: item.kind,
      ...(item.anonymous ? {} : { roleId: item.fromRole }),
    })
  }

  async hide(itemId: string): Promise<void> {
    const item = this.items.get(itemId)
    if (item) item.hidden = true
    await this.send({ itemId, action: 'hide' })
  }

  async edit(itemId: string, text: string): Promise<void> {
    const item = this.items.get(itemId)
    if (item) item.text = text
    await this.send({ itemId, action: 'edit', text })
  }

  /** Group items under one label (a group id is made up here). */
  async group(itemIds: string[], label?: string): Promise<string> {
    const groupId = toBase64Url(this.c.crypto.random(16))
    for (const itemId of itemIds) {
      const item = this.items.get(itemId)
      if (item) item.groupId = groupId
      await this.send({ itemId, action: 'group', groupId, ...(label ? { groupLabel: label } : {}) })
    }
    return groupId
  }

  async promote(itemIds: string[]): Promise<void> {
    for (const itemId of itemIds) {
      const item = this.items.get(itemId)
      if (item) item.promoted = true
      await this.send({ itemId, action: 'promote' })
    }
  }

  private async send(payload: Record<string, unknown>): Promise<void> {
    await this.c.client.send('hotwash.update', 'all', payload as never, {
      key: 'players',
      sign: true,
    })
  }
}
