import { describe, expect, it } from 'vitest'
import type { BlobRef, MessageSendPayload } from '@shared/live/schemas'
import type { SessionLogInput } from '@shared/schemas/live'
import {
  channelsFor,
  Messages,
  waitingSince,
  type MessageRole,
  type MessageSeat,
  type MessagesDeps,
} from './messages'

const ID = (n: number) => String(n).padStart(22, 'a')
const ROLES: MessageRole[] = [
  { id: 'pio', name: 'Public Information Officer', teamId: 'ops', teamName: 'Operations' },
  { id: 'ops', name: 'Operations Director', teamId: 'ops', teamName: 'Operations' },
  { id: 'it', name: 'IT Director' },
]
const SEATS: Record<string, MessageSeat> = {
  c1: { clientId: 'c1', kind: 'player', roleId: 'pio', teamId: 'ops', label: ROLES[0]!.name },
  c2: { clientId: 'c2', kind: 'player', roleId: 'pio', teamId: 'ops', label: ROLES[0]!.name },
  c3: { clientId: 'c3', kind: 'player', roleId: 'it', label: ROLES[2]!.name },
  ev: { clientId: 'ev', kind: 'evaluator', roleId: 'evaluators', label: 'Evaluator' },
}

const payload = (over: Partial<MessageSendPayload> = {}): MessageSendPayload => ({
  messageId: ID(1),
  channel: 'role:pio',
  text: 'Statement at 1800.',
  attachments: [],
  ...over,
})

function setup(opts: { blob?: Uint8Array; storeFails?: boolean } = {}) {
  const sent: { to: string; payload: Record<string, unknown> }[] = []
  const log: SessionLogInput[] = []
  const changed: string[] = []
  let now = 1_000_000
  let ids = 100
  const deps: MessagesDeps = {
    send: async (to, p) => void sent.push({ to, payload: p }),
    log: { append: async (input) => void log.push(input) },
    roles: ROLES,
    seats: () => Object.values(SEATS),
    seatOf: (id) => SEATS[id],
    clientRef: async (id) => `1f${id}`.padEnd(8, '0').slice(0, 8),
    getBlob: async () => opts.blob ?? new Uint8Array([1]),
    store: async (ref) => {
      if (opts.storeFails) throw new Error('not an image')
      return { mime: 'image/png', sha256: ref.sha256, path: `live/s/attachments/${ref.blobId}.png` }
    },
    clock: async () => ({ time: '1:34', pre: false }),
    now: () => now,
    newId: () => ID(ids++),
    changed: (id) => void changed.push(id),
  }
  return {
    m: new Messages(deps),
    sent,
    log,
    changed,
    tick: (ms: number) => (now += ms),
  }
}

const imageRef = (blobId = ID(9)): BlobRef => ({
  blobId,
  kind: 'image',
  mime: 'image/png',
  bytes: 10,
  sha256: 'a'.repeat(64),
  k: 's1',
  n: 'n'.repeat(16),
  width: 800,
  height: 600,
})

describe('channelsFor', () => {
  it('lets a player seat use its role, its team and its own device', () => {
    expect(channelsFor(SEATS.c1!)).toEqual(['role:pio', 'team:ops', 'client:c1'])
  })

  it('gives evaluators and observers no channels', () => {
    expect(channelsFor(SEATS.ev!)).toEqual([])
  })
})

describe('player messages', () => {
  it('logs a message with role and exercise time, and echoes it to the seat', async () => {
    const { m, sent, log, changed } = setup()
    await m.onPlayerMessage('c1', 7, payload())
    const entry = log.find((e) => e.kind === 'message')!
    expect(entry).toMatchObject({
      ex: '1:34',
      actor: { kind: 'client', seat: { kind: 'player', roleId: 'pio' } },
      ref: { channel: 'role:pio', messageId: ID(1) },
      data: { text: 'Statement at 1800.' },
    })
    expect(entry.actor.displayName).toBeUndefined()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: 'role:pio',
      payload: { echoOf: ID(1), fromRole: 'pio', text: 'Statement at 1800.' },
    })
    expect(changed).toEqual(['role:pio'])
    expect(m.thread('role:pio')).toHaveLength(1)
  })

  it('ignores a repeated messageId except to echo it again', async () => {
    const { m, sent, log } = setup()
    await m.onPlayerMessage('c1', 7, payload())
    await m.onPlayerMessage('c1', 8, payload())
    expect(m.thread('role:pio')).toHaveLength(1)
    expect(log.filter((e) => e.kind === 'message')).toHaveLength(1)
    expect(sent).toHaveLength(2)
  })

  it('drops a message to another role and logs an anomaly', async () => {
    const { m, sent, log } = setup()
    await m.onPlayerMessage('c3', 1, payload({ channel: 'role:pio' }))
    expect(sent).toHaveLength(0)
    expect(m.summaries()).toEqual([])
    expect(log.at(-1)).toMatchObject({
      kind: 'anomaly',
      data: { what: 'message to a channel the seat does not own' },
    })
  })

  it('drops messages from evaluators and from devices without a seat', async () => {
    const { m, log } = setup()
    await m.onPlayerMessage('ev', 1, payload({ channel: 'role:evaluators' }))
    await m.onPlayerMessage('nobody', 2, payload())
    expect(m.summaries()).toEqual([])
    expect(log.filter((e) => e.kind === 'anomaly')).toHaveLength(2)
  })

  it('refuses controller-only fields from a player', async () => {
    const { m, log } = setup()
    await m.onPlayerMessage('c1', 1, payload({ persona: 'Channel 5' }))
    expect(m.summaries()).toEqual([])
    expect(log[0]).toMatchObject({ data: { what: 'player message carries controller fields' } })
  })

  it('refuses empty and over-long text', async () => {
    const { m } = setup()
    await m.onPlayerMessage('c1', 1, payload({ text: '   ' }))
    await m.onPlayerMessage('c1', 2, payload({ messageId: ID(2), text: 'x'.repeat(2001) }))
    expect(m.summaries()).toEqual([])
  })

  it('stores attachments and keeps the message when one is refused', async () => {
    const ok = setup()
    await ok.m.onPlayerMessage('c1', 1, payload({ attachments: [imageRef()] }))
    expect(ok.m.thread('role:pio')[0]!.attachments[0]).toMatchObject({
      mime: 'image/png',
      path: `live/s/attachments/${ID(9)}.png`,
    })
    expect(ok.sent[0]!.payload.attachments).toHaveLength(1)

    const bad = setup({ storeFails: true })
    await bad.m.onPlayerMessage('c1', 1, payload({ attachments: [imageRef()] }))
    expect(bad.m.thread('role:pio')[0]!.attachments).toEqual([])
    expect(bad.log.find((e) => e.kind === 'message')!.data.rejectedAttachments).toBe(1)
  })

  it('allows a team or device thread only after the controller opened it', async () => {
    const { m } = setup()
    await m.onPlayerMessage('c1', 1, payload({ channel: 'team:ops' }))
    expect(m.summaries()).toEqual([])
    await m.sendControllerMessage({ channel: 'team:ops', text: 'Hello team', persona: 'Vendor' })
    await m.onPlayerMessage('c1', 2, payload({ messageId: ID(2), channel: 'team:ops' }))
    expect(m.thread('team:ops')).toHaveLength(2)
  })
})

describe('controller messages', () => {
  it('sends signed-style payloads to the role with persona and caption flag', async () => {
    const { m, sent, log } = setup()
    const msg = await m.sendControllerMessage({
      channel: 'role:pio',
      text: 'Can you confirm ransomware?',
      persona: 'Channel 5 newsroom',
    })
    expect(sent[0]).toMatchObject({
      to: 'role:pio',
      payload: { persona: 'Channel 5 newsroom', showPlayedBy: true, attachments: [] },
    })
    expect(msg.from).toEqual({ kind: 'controller', persona: 'Channel 5 newsroom' })
    expect(log[0]).toMatchObject({
      kind: 'message',
      actor: { kind: 'controller', persona: 'Channel 5 newsroom' },
    })
  })

  it('can turn the caption off and remembers the persona per thread', async () => {
    const { m, sent } = setup()
    await m.sendControllerMessage({
      channel: 'role:it',
      text: 'Vendor calling',
      persona: 'Vendor',
      showPlayedBy: false,
    })
    expect(sent[0]!.payload.showPlayedBy).toBe(false)
    expect(m.summaries()[0]!.lastPersona).toBe('Vendor')
  })

  it('rejects unknown channels, empty text and bad reply targets', async () => {
    const { m } = setup()
    const base = { text: 'Hi', persona: 'Vendor' }
    await expect(m.sendControllerMessage({ ...base, channel: 'role:nope' })).rejects.toThrow()
    await expect(m.sendControllerMessage({ ...base, channel: 'client:abcd1234' })).rejects.toThrow()
    await expect(
      m.sendControllerMessage({ ...base, text: '  ', channel: 'role:pio' }),
    ).rejects.toThrow()
    await expect(
      m.sendControllerMessage({ ...base, channel: 'role:pio', replyTo: 'x' }),
    ).rejects.toThrow()
  })

  it('reaches one device through its client ref and never shows the client id', async () => {
    const { m, sent, log } = setup()
    const targets = await m.targets()
    const device = targets.find((t) => t.label === `${ROLES[0]!.name} (device 2)`)!
    expect(device.channel).toMatch(/^client:[a-z0-9]{8}$/)
    expect(device.channel).not.toContain(':c2')
    await m.sendControllerMessage({
      channel: device.channel,
      text: 'Call for you',
      persona: 'Vendor',
    })
    expect(sent[0]!.to).toBe('client:c2')
    expect(JSON.stringify(log)).not.toContain('client:c2')
  })

  it('lists roles, teams and devices as targets', async () => {
    const { m } = setup()
    const labels = (await m.targets()).map((t) => t.label)
    expect(labels).toContain('Operations (team)')
    expect(labels).toContain('IT Director')
    expect(labels.filter((l) => l.includes('device'))).toHaveLength(3)
  })
})

describe('waiting, handled, star, pin', () => {
  it('tracks the oldest unanswered player message and clears it on a reply', async () => {
    const { m, tick } = setup()
    await m.onPlayerMessage('c1', 1, payload())
    tick(60_000)
    await m.onPlayerMessage('c1', 2, payload({ messageId: ID(2) }))
    expect(m.summaries()[0]!.waitingSince).toBe(1_000_000)
    await m.sendControllerMessage({ channel: 'role:pio', text: 'OK', persona: 'Reporter' })
    expect(m.summaries()[0]!.waitingSince).toBeUndefined()
  })

  it('mark handled clears the timer and logs message.handled', async () => {
    const { m, log } = setup()
    await m.onPlayerMessage('c1', 1, payload())
    await m.markHandled(ID(1))
    expect(m.summaries()[0]!.waitingSince).toBeUndefined()
    expect(log.at(-1)).toMatchObject({ kind: 'message.handled', ref: { messageId: ID(1) } })
  })

  it('counts unread player messages until the thread is opened', async () => {
    const { m } = setup()
    await m.onPlayerMessage('c1', 1, payload())
    expect(m.summaries()[0]!.unread).toBe(1)
    m.thread('role:pio')
    expect(m.summaries()[0]!.unread).toBe(0)
  })

  it('toggles a star and logs each change once', async () => {
    const { m, log } = setup()
    await m.onPlayerMessage('c1', 1, payload())
    await m.star(ID(1), true)
    await m.star(ID(1), true)
    await m.star(ID(1), false)
    const stars = log.filter((e) => e.kind === 'message.star')
    expect(stars.map((e) => e.data.on)).toEqual([true, false])
    expect(m.thread('role:pio')[0]!.starred).toBe(false)
  })

  it('pins a message to the hot wash with who said it, once', async () => {
    const { m, log } = setup()
    await m.sendControllerMessage({
      channel: 'role:pio',
      text: 'Is it ransomware?',
      persona: 'Reporter',
    })
    const id = m.thread('role:pio')[0]!.messageId
    await m.pin(id)
    await m.pin(id)
    const pins = log.filter((e) => e.kind === 'message.pinned')
    expect(pins).toHaveLength(1)
    expect(pins[0]).toMatchObject({
      ex: '1:34',
      data: { from: 'Reporter', text: 'Is it ransomware?' },
    })
  })

  it('refuses to mark a controller message handled and unknown ids', async () => {
    const { m } = setup()
    await m.sendControllerMessage({ channel: 'role:pio', text: 'Hi', persona: 'Reporter' })
    await expect(m.markHandled(m.thread('role:pio')[0]!.messageId)).rejects.toThrow()
    await expect(m.pin('missing')).rejects.toThrow()
  })
})

describe('waitingSince', () => {
  it('is undefined for an empty thread', () => {
    expect(waitingSince([])).toBeUndefined()
  })
})
