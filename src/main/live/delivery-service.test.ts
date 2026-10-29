import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { BlobMeta, BlobRef } from '@shared/live/schemas'
import { LIMITS } from '@shared/live/protocol'
import { emptyStage, releaseRow, stageAll, type DeliveryHost } from './delivery-service'
import { Delivery } from './releases'

const root = mkdtempSync(join(tmpdir(), 'as-delivery-'))
mkdirSync(join(root, 'media'))
writeFileSync(join(root, 'media', 'a.png'), new Uint8Array(300))

const scenario = {
  roles: [
    { id: 'ops', name: 'Ops', team: 'Operations' },
    { id: 'pio', name: 'PIO', team: '' },
  ],
  msel: [
    {
      id: 'I-06',
      from: 'Gate agent',
      toRoleIds: ['ops'],
      event: 'A board goes dark',
      expectedAction: 'Call the duty manager',
      purposeTag: 'DECISION_POINT',
      injectId: 'inj-6',
    },
    {
      id: 'I-07',
      from: 'Press',
      toRoleIds: [],
      event: 'A reporter calls',
      expectedAction: '',
      purposeTag: 'NOISE',
    },
  ],
}
const injects = [
  {
    id: 'inj-6',
    mselRowId: 'I-06',
    type: 'memo',
    title: 'Dark board',
    deliveryMode: 'hand_to_role',
    fields: { subject: 'Boards dark' },
    assets: [
      {
        id: 'a1',
        kind: 'image',
        path: 'media/a.png',
        role: 'rendered',
        width: 800,
        provenance: { provider: 'template', createdAt: '2026-01-01T00:00:00.000Z' },
      },
    ],
  },
]

vi.mock('../scenario/store', () => ({
  getScenario: async () => scenario,
  listInjects: async () => injects,
}))
vi.mock('../render/templates', () => ({
  loadTemplate: () => ({
    schema: { properties: { subject: { title: 'Subject' } } },
    meta: { imageSlots: [] },
  }),
}))

function host(over: Partial<DeliveryHost> = {}) {
  const sent: { to: string; payload: Record<string, unknown>; key: string }[] = []
  const uploads: BlobMeta[] = []
  const delivery = new Delivery({
    send: async (_t, to, payload, key) => void sent.push({ to, payload, key }),
    log: { append: async () => undefined },
    seats: () => [],
    clientRef: async () => 'aaaaaaaa',
    now: () => 1,
    changed: () => undefined,
  })
  const h: DeliveryHost = {
    root,
    scenarioId: 'sc',
    client: {
      limits: LIMITS.lan,
      putBlob: async (meta: BlobMeta) => {
        uploads.push(meta)
        return { blobId: 'b'.repeat(22), ...meta } as unknown as BlobRef
      },
    },
    delivery,
    stage: emptyStage(),
    mediaCache: new Map(),
    clock: async () => ({ elapsedMin: 75, rate: 1 }),
    alive: () => true,
    staging: () => undefined,
    ...over,
  }
  return { h, sent, uploads }
}

describe('releaseRow', () => {
  it('builds the release from the row and its inject, with exact text and staged media', async () => {
    const { h, sent } = host()
    const summary = await releaseRow(h, { rowId: 'I-06' })
    expect(summary.targets).toEqual(['role:ops'])
    const p = sent[0]!.payload as {
      title: string
      sender: string
      exerciseTime: string
      text: { body: string; altText: string }
      media: { name: string }[]
      expectsResponse: boolean
    }
    expect(p).toMatchObject({ title: 'Dark board', sender: 'Gate agent', exerciseTime: '1:15' })
    expect(p.text.body).toBe('Subject: Boards dark')
    expect(p.media.map((m) => m.name)).toEqual(['device'])
    expect(p.expectsResponse).toBe(true)
  })

  it('keeps the expected action out of every frame unless asked, and then only for evaluators', async () => {
    const off = host()
    await releaseRow(off.h, { rowId: 'I-06' })
    expect(off.sent.some((s) => 'expectedAction' in s.payload)).toBe(false)
    const on = host()
    await releaseRow(on.h, { rowId: 'I-06', showExpected: true })
    const withAction = on.sent.filter((s) => 'expectedAction' in s.payload)
    expect(withAction.map((s) => [s.to, s.key])).toEqual([['role:evaluators', 'staff']])
  })

  it('sends a row with no inject as text and to everyone when it names nobody', async () => {
    const { h, sent } = host()
    const summary = await releaseRow(h, { rowId: 'I-07' })
    expect(summary.targets).toEqual(['all'])
    expect(sent[0]!.payload).toMatchObject({
      title: 'I-07',
      text: { body: 'A reporter calls' },
      media: [],
      expectsResponse: false,
    })
  })

  it('uses the targets the facilitator chose', async () => {
    const { h } = host()
    const summary = await releaseRow(h, { rowId: 'I-06', targets: ['role:pio', 'team:operations'] })
    expect(summary.targets).toEqual(['role:pio', 'team:operations'])
  })

  it('does not send the same row twice while its release is out', async () => {
    const { h, sent } = host()
    const first = await releaseRow(h, { rowId: 'I-06' })
    const count = sent.length
    const second = await releaseRow(h, { rowId: 'I-06' })
    expect(second.releaseId).toBe(first.releaseId)
    expect(sent).toHaveLength(count)
  })

  it('says the picture is on the main screen when it could not be sent to devices', async () => {
    const { h, sent } = host({
      client: {
        limits: { ...LIMITS.lan, blobBytes: 10 },
        putBlob: async () => {
          throw new Error('no')
        },
      },
    })
    await releaseRow(h, { rowId: 'I-06' })
    const p = sent[0]!.payload as { text: { body: string }; media: unknown[] }
    expect(p.media).toEqual([])
    expect(p.text.body).toContain('Image shown on the main screen.')
  })
})

describe('stageAll', () => {
  it('uploads every inject with media once and reports progress', async () => {
    const seen: number[] = []
    const { h, uploads } = host()
    h.staging = () => void seen.push(h.stage.staged)
    await stageAll(h)
    expect(uploads).toHaveLength(1)
    expect(h.stage).toMatchObject({ staged: 1, total: 1, running: false, failed: [] })
    expect(seen[0]).toBe(0)
    await releaseRow(h, { rowId: 'I-06' })
    expect(uploads).toHaveLength(1)
  })

  it('stops when the session has ended', async () => {
    const { h, uploads } = host({ alive: () => false })
    await stageAll(h)
    expect(uploads).toHaveLength(0)
  })
})
