import { describe, expect, it } from 'vitest'
import { MAX_HELPER_DRAFTS, SimcellHelperFeature } from './helper'

const payload = (n: number, over: Record<string, unknown> = {}) => ({
  draftId: `draft${String(n).padStart(17, '0')}`,
  revision: 1,
  status: 'queued' as const,
  persona: 'Reporter',
  threadLabel: 'Reporter and Ops',
  text: `Reply ${n}`,
  flags: [],
  ...over,
})

function feature() {
  const sent: { id: string; payload: Record<string, unknown>; createdAt: number }[] = []
  let id = 0
  const f = new SimcellHelperFeature({
    now: () => 1000,
    newId: () => `action${id++}`,
    enqueue: async (a) => void sent.push(a),
  })
  return { f, sent }
}

describe('SimCell helper drafts on the device', () => {
  it('lists drafts, replaces a draft by a higher revision and ignores an older one', () => {
    const { f } = feature()
    f.applyDraft(payload(1))
    f.applyDraft(payload(1, { revision: 2, text: 'Better reply' }))
    f.applyDraft(payload(1, { revision: 1, text: 'Old reply' }))
    expect(f.state.get().drafts.map((d) => [d.revision, d.text])).toEqual([[2, 'Better reply']])
  })

  it('removes a withdrawn draft and does not bring it back from a replayed older frame', () => {
    const { f } = feature()
    f.applyDraft(payload(1))
    f.applyDraft(payload(1, { revision: 2, status: 'withdrawn' }))
    f.applyDraft(payload(1))
    expect(f.state.get().drafts).toEqual([])
  })

  it('keeps only the newest drafts when the controller floods the device', () => {
    const { f } = feature()
    for (let n = 1; n <= MAX_HELPER_DRAFTS + 3; n++) f.applyDraft(payload(n))
    const drafts = f.state.get().drafts
    expect(drafts).toHaveLength(MAX_HELPER_DRAFTS)
    expect(drafts.at(-1)!.text).toBe(`Reply ${MAX_HELPER_DRAFTS + 3}`)
  })

  it('queues one decision per draft: approve, edit with text, discard', async () => {
    const { f, sent } = feature()
    for (const n of [1, 2, 3]) f.applyDraft(payload(n))
    expect(await f.decide(payload(1).draftId, 'approve')).toBe(true)
    expect(await f.decide(payload(2).draftId, 'edit', 'My words')).toBe(true)
    expect(await f.decide(payload(3).draftId, 'discard')).toBe(true)
    expect(sent.map((s) => s.payload)).toEqual([
      { draftId: payload(1).draftId, revision: 1, action: 'approve' },
      { draftId: payload(2).draftId, revision: 1, action: 'edit', text: 'My words' },
      { draftId: payload(3).draftId, revision: 1, action: 'discard' },
    ])
    expect(sent.map((s) => s.createdAt)).toEqual([1000, 1001, 1002])
    expect(f.state.get().drafts).toEqual([])
  })

  it('a second tap on a decided draft sends nothing', async () => {
    const { f, sent } = feature()
    f.applyDraft(payload(1))
    await f.decide(payload(1).draftId, 'approve')
    expect(await f.decide(payload(1).draftId, 'approve')).toBe(false)
    expect(sent).toHaveLength(1)
  })

  it('refuses an empty edit, an unknown draft and any decision after the end', async () => {
    const { f, sent } = feature()
    f.applyDraft(payload(1))
    expect(await f.decide(payload(1).draftId, 'edit', '   ')).toBe(false)
    expect(await f.decide('nothing0000000000000000', 'approve')).toBe(false)
    f.end()
    expect(await f.decide(payload(1).draftId, 'approve')).toBe(false)
    expect(sent).toEqual([])
  })

  it('drops the drafts when the seat is no longer a helper’s', () => {
    const { f } = feature()
    f.applyDraft(payload(1))
    f.clear()
    expect(f.state.get().drafts).toEqual([])
  })
})
