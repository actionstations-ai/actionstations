import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CapabilityResult, SimcellExchange } from '@shared/schemas'
import { Simcell, type BridgeLine, type LiveBridge, type SimcellDeps } from './service'
import { answer, replyPrompt, reporter, stubProvider } from './test-fixtures'

const result = (level: CapabilityResult['level']): CapabilityResult => ({
  level,
  passed: [],
  failed: level === 'not_suited' ? ['deadline'] : [],
  checkedAt: '2026-01-01T00:00:00.000Z',
})

function setup(level: CapabilityResult['level'] = 'suited', replies: unknown[] = [answer()]) {
  const provider = stubProvider(replies)
  const exchanges: SimcellExchange[] = []
  const sent: { channel: string; text: string; persona: string }[] = []
  const rung: { callId?: string; transcript: string; hasAudio: boolean }[] = []
  const logged: Record<string, unknown>[] = []
  const lines: BridgeLine[] = []
  const state = {
    clock: { minutes: 95, label: '1:35' },
    now: 1_000_000,
    released: new Set<string>(),
  }
  const dir = mkdtempSync(join(tmpdir(), 'simcell-'))
  const bridge: LiveBridge = {
    sessionId: 'S1',
    dir,
    thread: (id) => lines.filter((l) => l.messageId.startsWith(id)),
    threadIds: () => ['role:ops-director'],
    threadLabel: () => 'Operations Director',
    destination: (id) => id,
    replyAs: async (r) => void sent.push({ channel: r.channel, text: r.text, persona: r.persona }),
    log: async (input) => void logged.push(input as unknown as Record<string, unknown>),
    rowForReply: async () => undefined,
    ring: async (req) => {
      rung.push({
        ...(req.callId ? { callId: req.callId } : {}),
        transcript: req.transcript,
        hasAudio: !!req.audio,
      })
      return { callId: req.callId ?? 'CALL1', turn: (rung.length || 1) as number }
    },
    noteTranscript: async () => undefined,
    endCall: async () => undefined,
  }
  const events: string[] = []
  const deps: SimcellDeps = {
    root: '/tmp/p',
    scenarioId: 's1',
    loadEnv: async () => ({
      provider,
      model: 'stub-model',
      providerId: 'stub',
      prompt: replyPrompt(),
      knownNames: [],
    }),
    capability: async () => result(level),
    personas: async () => ({ version: 1, personas: [reporter] }),
    scenario: async () => ({ msel: [] }),
    clock: async () => state.clock,
    releasedRowIds: async () => state.released,
    now: () => state.now,
    emit: (event) => void events.push(event),
    saveExchange: async (ex) => void exchanges.push(ex),
    voice: {
      render: async () => ({ path: 'x.wav', durationSec: 2, bytes: new Uint8Array([1, 2, 3]) }),
      transcribe: async () => ({ text: 'We can give a statement at two.' }),
      ready: async () => true,
    },
  }
  const simcell = new Simcell(deps)
  const player = (id: string, text: string, at = 1) =>
    lines.push({
      messageId: `role:ops-director-${id}`,
      from: 'player',
      text,
      exerciseTime: '1:30',
      at,
    })
  return {
    simcell,
    provider,
    bridge,
    sent,
    rung,
    logged,
    lines,
    exchanges,
    state,
    player,
    events,
    dir,
  }
}

describe('the approval flow', () => {
  it('drafts in the background for a player message and sends nothing', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    await t.simcell.setOptions({ enabled: true })
    t.player('1', 'We are looking into it.')
    await t.simcell.onPlayerMessage({
      messageId: 'role:ops-director-1',
      channel: 'role:ops-director',
    })
    await t.simcell.idle()
    const { drafts } = await t.simcell.list()
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ status: 'queued', personaId: 'p1-reporter' })
    expect(t.sent).toEqual([])
    expect(t.events).toContain('draft-ready')
  })

  it('sends the draft as the persona only when a person chooses Send', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    await t.simcell.setOptions({ enabled: true })
    const draft = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
    })
    expect(t.sent).toEqual([])
    const done = await t.simcell.resolve({ draftId: draft.id, action: 'send' })
    expect(done.status).toBe('sent')
    expect(t.sent).toEqual([
      {
        channel: 'role:ops-director',
        text: draft.text,
        persona: 'Dana Whitlock (Harbor Ledger)',
      },
    ])
    expect((await t.simcell.list()).drafts).toEqual([])
  })

  it('sends the edited text, and records that it was edited', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    const draft = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
    })
    const done = await t.simcell.resolve({
      draftId: draft.id,
      action: 'edit',
      text: 'Statement by 1:45, please.',
    })
    expect(done).toMatchObject({ status: 'edited', finalText: 'Statement by 1:45, please.' })
    expect(t.sent.map((s) => s.text)).toEqual(['Statement by 1:45, please.'])
    expect(t.logged.at(-1)).toMatchObject({
      kind: 'simcell.draft',
      data: {
        status: 'edited',
        edited: true,
        draft: draft.text,
        final: 'Statement by 1:45, please.',
      },
    })
  })

  it('treats an edit that changes nothing as sent as drafted, and Write my own as rewritten', async () => {
    const t = setup('suited', [answer(), answer({ text: 'Second draft.' })])
    await t.simcell.attach(t.bridge)
    const a = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
    })
    expect((await t.simcell.resolve({ draftId: a.id, action: 'edit', text: a.text })).status).toBe(
      'sent',
    )
    const b = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
    })
    expect(
      (await t.simcell.resolve({ draftId: b.id, action: 'rewrite', text: 'My own words.' })).status,
    ).toBe('rewritten')
  })

  it('discards without sending anything to players', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    const draft = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
    })
    const done = await t.simcell.resolve({ draftId: draft.id, action: 'discard' })
    expect(done.status).toBe('discarded')
    expect(t.sent).toEqual([])
    expect((await t.simcell.list()).drafts).toEqual([])
  })

  it('cannot resolve the same draft twice', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    const draft = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
    })
    await t.simcell.resolve({ draftId: draft.id, action: 'send' })
    await expect(t.simcell.resolve({ draftId: draft.id, action: 'send' })).rejects.toThrow(
      /no longer waiting/,
    )
    expect(t.sent).toHaveLength(1)
  })

  it('regenerating replaces the old draft with a new one', async () => {
    const t = setup('suited', [answer(), answer({ text: 'Harder this time.' })])
    await t.simcell.attach(t.bridge)
    const first = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
    })
    const second = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
      instruction: 'be more hostile, the deadline passed',
      replaces: first.id,
    })
    expect(t.provider.requests.at(-1)!.messages[0]!.content).toContain('be more hostile')
    expect((await t.simcell.list()).drafts.map((d) => d.id)).toEqual([second.id])
  })

  it('writes every draft and its outcome to simcell.jsonl, last line per draft winning', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    const draft = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
    })
    await t.simcell.resolve({ draftId: draft.id, action: 'send' })
    const rows = readFileSync(join(t.dir, 'simcell.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(rows.map((r) => r.status)).toEqual(['queued', 'sent'])
  })
})

describe('model capability gating', () => {
  it('does not draft by itself for a limited model, but drafts on request with a warning', async () => {
    const t = setup('limited')
    await t.simcell.attach(t.bridge)
    await t.simcell.setOptions({ enabled: true })
    t.player('1', 'Hello?')
    await t.simcell.onPlayerMessage({
      messageId: 'role:ops-director-1',
      channel: 'role:ops-director',
    })
    await t.simcell.idle()
    const queue = await t.simcell.list()
    expect(queue.drafts).toEqual([])
    expect(queue.waiting.map((w) => w.text)).toEqual(['Hello?'])
    expect(t.provider.requests).toHaveLength(0)

    const draft = await t.simcell.requestDraft({
      personaId: 'p1-reporter',
      threadId: 'role:ops-director',
    })
    expect(draft.flags.map((f) => f.code)).toContain('LIMITED_MODEL')
  })

  it('keeps drafting off for a model that is not suited and says which checks failed', async () => {
    const t = setup('not_suited')
    await t.simcell.attach(t.bridge)
    await expect(t.simcell.setOptions({ enabled: true })).rejects.toThrow(/did not pass/)
    expect(t.simcell.status()).toMatchObject({
      enabled: false,
      level: 'not_suited',
      failed: ['deadline'],
    })
    t.player('1', 'Hello?')
    await t.simcell.onPlayerMessage({
      messageId: 'role:ops-director-1',
      channel: 'role:ops-director',
    })
    await expect(
      t.simcell.requestDraft({ personaId: 'p1-reporter', threadId: 'role:ops-director' }),
    ).rejects.toThrow(/Drafting is off/)
    expect(t.provider.requests).toHaveLength(0)
  })

  it('never drafts on its own until drafting is turned on for the session', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    t.player('1', 'Hello?')
    await t.simcell.onPlayerMessage({
      messageId: 'role:ops-director-1',
      channel: 'role:ops-director',
    })
    await t.simcell.idle()
    expect(t.provider.requests).toHaveLength(0)
    expect((await t.simcell.list()).waiting).toHaveLength(1)
  })
})

describe('persona clocks', () => {
  it('queues a draft when a deadline passes, once, and sends nothing', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    await t.simcell.setOptions({ enabled: true })
    expect(await t.simcell.tick()).toBeGreaterThan(0)
    await t.simcell.idle()
    const { drafts } = await t.simcell.list()
    expect(drafts.map((d) => d.trigger)).toEqual(['deadline'])
    expect(drafts[0]!.threadId).toBe('unassigned')
    expect(await t.simcell.tick()).toBe(0)
    expect(t.sent).toEqual([])
  })

  it('needs somewhere to send an unaddressed draft', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    await t.simcell.setOptions({ enabled: true })
    await t.simcell.tick()
    await t.simcell.idle()
    const [draft] = (await t.simcell.list()).drafts
    await expect(t.simcell.resolve({ draftId: draft!.id, action: 'send' })).rejects.toThrow(
      /Choose who/,
    )
    await t.simcell.resolve({ draftId: draft!.id, action: 'send', channel: 'role:ops-director' })
    expect(t.sent[0]!.channel).toBe('role:ops-director')
  })

  it('does not fire a deadline again after the session reloads its file', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    await t.simcell.setOptions({ enabled: true })
    await t.simcell.tick()
    await t.simcell.idle()
    const again = new Simcell({ ...(t.simcell as unknown as { deps: SimcellDeps }).deps })
    await again.attach(t.bridge)
    await again.setOptions({ enabled: true })
    expect((await again.list()).drafts.filter((d) => d.trigger === 'deadline')).toHaveLength(1)
    expect(await again.tick()).toBe(0)
  })
})

describe('without a live session', () => {
  it('drafts a reply to what a player said on the phone and keeps the exchange for the hot wash', async () => {
    const t = setup()
    const draft = await t.simcell.offlineTurn('p1-reporter', 'Can you give us until two?')
    expect(draft.threadId).toBe('offline')
    expect(t.provider.requests[0]!.messages[0]!.content).toContain('Can you give us until two?')
    expect(t.exchanges).toEqual([])
    await t.simcell.resolve({ draftId: draft.id, action: 'edit', text: 'Two is too late.' })
    expect(t.exchanges).toMatchObject([
      {
        personaId: 'p1-reporter',
        playerText: 'Can you give us until two?',
        replyText: 'Two is too late.',
      },
    ])
    expect(t.sent).toEqual([])
  })
})

describe('voice calls', () => {
  it('rings with a rendered voice line and carries the next turn on the same call', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    const first = await t.simcell.startCall(
      'p1-reporter',
      'role:ops-director',
      'This is Dana from Harbor Ledger.',
    )
    expect(first.callId).toBe('CALL1')
    expect(t.rung[0]).toMatchObject({
      transcript: 'This is Dana from Harbor Ledger.',
      hasAudio: true,
    })
  })

  it('transcribes a spoken answer, drafts the next line, and rings only after approval', async () => {
    const t = setup()
    await t.simcell.attach(t.bridge)
    await t.simcell.setOptions({ enabled: true })
    await t.simcell.startCall('p1-reporter', 'role:ops-director', 'Hello, Harbor Ledger here.')
    const before = t.rung.length
    await t.simcell.onCallAnswer({
      callId: 'CALL1',
      turn: 1,
      personaId: 'p1-reporter',
      audio: new Uint8Array(2000),
    })
    await t.simcell.idle()
    const [draft] = (await t.simcell.list()).drafts
    expect(draft).toMatchObject({
      trigger: 'call_turn',
      callId: 'CALL1',
      inReplyToText: 'We can give a statement at two.',
    })
    expect(t.rung.length).toBe(before)
    await t.simcell.resolve({ draftId: draft!.id, action: 'send' })
    expect(t.rung.at(-1)).toMatchObject({ callId: 'CALL1', hasAudio: true })
    expect(t.sent).toEqual([])
  })

  it('shows the transcript text even when the voice cannot be rendered', async () => {
    const t = setup()
    const render = vi.fn().mockRejectedValue(new Error('no voice'))
    ;(t.simcell as unknown as { deps: SimcellDeps }).deps.voice.render = render
    await t.simcell.attach(t.bridge)
    await t.simcell.startCall('p1-reporter', 'role:ops-director', 'Text only please.')
    expect(t.rung[0]).toMatchObject({ transcript: 'Text only please.', hasAudio: false })
  })
})
