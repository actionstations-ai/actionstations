// Gate contract (#433): what a cloud adapter receives, what comes back, and when the user is
// asked. Every outgoing request is captured at the adapter boundary and checked for the values
// redaction must hide and for the mapping, which must never leave.
import { describe, expect, it, vi } from 'vitest'
import {
  PrivacySettings,
  REDACTION_CATEGORIES,
  type CloudSendEntry,
  type OutboundManifest,
  type ProviderConfig,
} from '@shared/schemas'
import { runInJobScope } from '../../jobs/scope'
import type {
  ChatRequest,
  ChatResponse,
  EmbeddingProvider,
  MediaJob,
  MediaProvider,
  TextProvider,
} from '../types'
import { Approvals } from './approvals'
import { emptyContext } from './detect'
import {
  DIMENSION_PROBE,
  PLACEHOLDER_INSTRUCTION,
  guardEmbedding,
  guardMedia,
  guardText,
  isGuarded,
  type GateDeps,
} from './gate'
import { RedactionRegistry } from './redact'

const REMOTE: ProviderConfig = {
  id: 'cloud',
  kind: 'mock',
  label: 'Cloud mock',
  baseUrl: 'https://api.example.com/v1',
  defaultModel: 'big',
  options: {},
  enabled: true,
}
const LOCAL: ProviderConfig = { ...REMOTE, id: 'local', baseUrl: 'http://127.0.0.1:1234/v1' }

const SECRETS = ['Dana Ruiz', 'Ruiz', '555-0142', 'dana.ruiz@rivergate.org', '1200 Riverside Drive']
const PLAN = 'Contact Chief Dana Ruiz at (509) 555-0142 or dana.ruiz@rivergate.org.'

type Reply = (req: ChatRequest) => Partial<ChatResponse>

class CapturingText implements TextProvider {
  readonly kind = 'mock' as const
  readonly id: string
  sent: ChatRequest[] = []
  constructor(
    readonly config: ProviderConfig,
    private reply: Reply = () => ({ text: 'ok' }),
  ) {
    this.id = config.id
  }
  listModels = async () => []
  health = async () => ({ ok: true })
  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.sent.push(req)
    return {
      text: '',
      model: 'big',
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: 'stop',
      latencyMs: 0,
      ...this.reply(req),
    }
  }
}

function setup(
  review: PrivacySettings['review'] = 'off',
  registry = new RedactionRegistry(Buffer.alloc(32, 3)),
) {
  const logged: CloudSendEntry[] = []
  const needed: OutboundManifest[] = []
  const approvals = new Approvals({
    needed: (m) => needed.push(m),
    settled: () => undefined,
    cancelJob: vi.fn(),
  })
  let settings = PrivacySettings.parse({ review })
  const deps: GateDeps = {
    approvals,
    privacy: async () => settings,
    context: async (s) => ({ ...emptyContext(), alwaysRedact: s.alwaysRedact }),
    registry: async () => registry,
    enabled: (s) => new Set(REDACTION_CATEGORIES.filter((c) => s.redact[c] !== false)),
    log: async (e) => void logged.push(e),
    knownProject: async () => true,
  }
  const change = (s: Partial<PrivacySettings>) =>
    (settings = PrivacySettings.parse({ ...settings, ...s }))
  return { deps, logged, needed, approvals, change, registry }
}

const request = (extra: Partial<ChatRequest> = {}): ChatRequest => ({
  model: 'big',
  system: 'You write exercises.',
  cacheableContext: `[C1] ${PLAN}`,
  messages: [{ role: 'user', content: 'Write an inject for Chief Dana Ruiz.' }],
  outbound: {
    jobId: 'job1',
    projectPath: '/tmp/project',
    task: 'draft',
    stage: 'msel',
    excerpts: [
      {
        chunkId: 1,
        documentId: 'docA',
        documentTitle: 'Water ERP',
        headingPath: 'Contacts',
        text: PLAN,
      },
    ],
  },
  ...extra,
})

/** Wait until the gate has registered a pending request. */
const waitFor = async (needed: OutboundManifest[], n = 1) => {
  for (let i = 0; i < 50 && needed.length < n; i++) await new Promise((r) => setTimeout(r, 5))
  return needed[n - 1]!
}

describe('outbound gate: local providers', () => {
  it('returns local providers unwrapped, so no gate work happens at all', () => {
    const { deps } = setup()
    const inner = new CapturingText(LOCAL)
    expect(guardText(inner, LOCAL, deps)).toBe(inner)
    expect(isGuarded(guardText(new CapturingText(REMOTE), REMOTE, deps))).toBe(true)
  })
})

describe('outbound gate: chat with redaction on', () => {
  it('sends nothing un-redacted and never the mapping', async () => {
    const { deps, registry } = setup()
    const inner = new CapturingText(REMOTE)
    await guardText(inner, REMOTE, deps).chat(request())
    expect(inner.sent).toHaveLength(1)
    const body = JSON.stringify(inner.sent[0])
    for (const s of SECRETS) expect(body).not.toContain(s)
    expect(body).toContain('[[PERSON_')
    expect(inner.sent[0]!.outbound).toBeUndefined()
    expect(inner.sent[0]!.system!.startsWith(PLACEHOLDER_INSTRUCTION)).toBe(true)
    // The mapping is the registry's content: no original value travels with its placeholder.
    expect(registry.size).toBeGreaterThan(0)
    expect(body).not.toMatch(/Riverside|rivergate/)
  })

  it('restores placeholders in the reply text and JSON, and reports unknown ones', async () => {
    const { deps } = setup()
    const inner = new CapturingText(REMOTE, (req) => {
      const person = /\[\[PERSON_[A-Z2-7]+\]\]/.exec(req.messages[0]!.content)![0]
      const json = { from: person, note: `cc ${person.slice(1, -1)} and [[PERSON_ZZZZ]]` }
      return { text: JSON.stringify(json), json }
    })
    const res = await guardText(inner, REMOTE, deps).chat(
      request({ json: { name: 'X', schema: {} } }),
    )
    expect(res.json).toEqual({ from: 'Dana Ruiz', note: 'cc Dana Ruiz and [[PERSON_ZZZZ]]' })
    expect(res.text).toContain('"from":"Dana Ruiz"')
    expect(res.unknownPlaceholders).toEqual(['PERSON_ZZZZ'])
  })

  it('parses and restores JSON the adapter returned only as text', async () => {
    const { deps } = setup()
    const inner = new CapturingText(REMOTE, (req) => {
      const person = /\[\[PERSON_[A-Z2-7]+\]\]/.exec(req.messages[0]!.content)![0]
      return { text: `Here: {"who": "${person}"}` }
    })
    const res = await guardText(inner, REMOTE, deps).chat(
      request({ json: { name: 'X', schema: {} } }),
    )
    expect(res.json).toEqual({ who: 'Dana Ruiz' })
  })

  it('writes one send-log line with sizes and headings, no text and no values', async () => {
    const { deps, logged } = setup()
    await guardText(new CapturingText(REMOTE), REMOTE, deps).chat(request())
    expect(logged).toHaveLength(1)
    const line = JSON.stringify(logged[0])
    for (const s of [...SECRETS, 'You write exercises', '[[PERSON_']) expect(line).not.toContain(s)
    expect(logged[0]).toMatchObject({
      providerId: 'cloud',
      host: 'api.example.com',
      task: 'draft',
      stage: 'msel',
      jobId: 'job1',
      approval: 'policy-off',
      excerpts: [{ documentId: 'docA', headingPath: 'Contacts' }],
    })
    expect(logged[0]!.redactions.person).toBeGreaterThan(0)
  })

  it('sends text unchanged when redaction is off', async () => {
    const { deps, change } = setup()
    change({ redact: { person: false, phone: false, email: false, address: false } })
    const inner = new CapturingText(REMOTE)
    await guardText(inner, REMOTE, deps).chat(request())
    expect(inner.sent[0]!.cacheableContext).toBe(`[C1] ${PLAN}`)
    expect(inner.sent[0]!.system).toBe('You write exercises.')
  })
})

describe('outbound gate: approval', () => {
  it('waits for approval and sends exactly the content the user saw', async () => {
    const { deps, needed, approvals } = setup('new-excerpts')
    const inner = new CapturingText(REMOTE)
    const pending = guardText(inner, REMOTE, deps).chat(request())
    const m = await waitFor(needed)
    expect(inner.sent).toHaveLength(0)
    expect(m.excerpts[0]!.text).not.toContain('Dana Ruiz')
    expect(m.spans.some((s) => s.part === 'excerpt:1' && s.original === 'Dana Ruiz')).toBe(true)
    approvals.decide(m.requestId, m.requestHash, 'send')
    await pending
    const sent = inner.sent[0]!
    const part = (name: string) => m.parts.find((p) => p.name === name)?.text
    expect(sent.system).toBe(part('system'))
    expect(sent.cacheableContext).toBe(part('cacheableContext'))
    expect(sent.messages[0]!.content).toBe(part('message:0:user'))
  })

  it('refuses to send when the approved hash does not match the request', async () => {
    const { deps } = setup('off')
    const inner = new CapturingText(REMOTE)
    const forged = {
      ...deps,
      approvals: {
        authorize: async () => ({ approval: 'asked' as const, approvedHash: 'not-this-request' }),
      } as unknown as Approvals,
    }
    await expect(guardText(inner, REMOTE, forged).chat(request())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(inner.sent).toHaveLength(0)
  })

  it('asks again for a repair round: its restored reply is new content (#454 review, finding 4)', async () => {
    for (const [review, asks] of [
      ['every-request', 2],
      ['new-content', 2],
      ['new-excerpts', 1],
      ['per-job', 1],
    ] as const) {
      const { deps, needed, approvals } = setup(review)
      const provider = guardText(new CapturingText(REMOTE), REMOTE, deps)
      const first = provider.chat(request())
      const m = await waitFor(needed)
      approvals.decide(m.requestId, m.requestHash, 'send')
      await first
      const repair = request({
        messages: [
          ...request().messages,
          { role: 'assistant', content: '{}' },
          { role: 'user', content: 'Fix it' },
        ],
      })
      const second = provider.chat(repair)
      if (asks === 2) {
        const m2 = await waitFor(needed, 2)
        expect(m2.requestHash).not.toBe(m.requestHash)
        approvals.decide(m2.requestId, m2.requestHash, 'send')
      }
      await second
      expect(needed).toHaveLength(asks)
    }
  })

  it('rebuilds the waiting request when settings change and asks about the new content', async () => {
    const { deps, needed, approvals, change } = setup('every-request')
    const inner = new CapturingText(REMOTE)
    const pending = guardText(inner, REMOTE, deps).chat(request())
    const before = await waitFor(needed)
    change({ redact: { person: false } })
    approvals.recompute()
    const after = await waitFor(needed, 2)
    expect(after.requestHash).not.toBe(before.requestHash)
    expect(() => approvals.decide(before.requestId, before.requestHash, 'send')).toThrow()
    approvals.decide(after.requestId, after.requestHash, 'send')
    await pending
    expect(inner.sent[0]!.messages[0]!.content).toContain('Dana Ruiz')
  })

  it('cancel stops the request before anything is sent', async () => {
    const { deps, needed, approvals } = setup('every-request')
    const inner = new CapturingText(REMOTE)
    const pending = guardText(inner, REMOTE, deps).chat(request())
    const m = await waitFor(needed)
    approvals.decide(m.requestId, m.requestHash, 'cancel')
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(inner.sent).toHaveLength(0)
  })

  it('takes the job and project from the job scope when the request carries none', async () => {
    const { deps, needed, approvals } = setup('every-request')
    const signal = new AbortController().signal
    const pending = runInJobScope({ jobId: 'job9', projectPath: '/tmp/p9', signal }, () =>
      guardText(new CapturingText(REMOTE), REMOTE, deps).chat({
        messages: [{ role: 'user', content: 'hello' }],
      }),
    )
    const m = await waitFor(needed)
    expect(m).toMatchObject({ jobId: 'job9', projectPath: '/tmp/p9', excerpts: [] })
    expect(m.parts.map((p) => p.name)).toEqual(['message:0:user'])
    approvals.decide(m.requestId, m.requestHash, 'send')
    await pending
  })
})

describe('outbound gate: embeddings and media', () => {
  class Embedder implements EmbeddingProvider {
    readonly id = 'cloud'
    readonly model = 'embed-1'
    dims = 0
    sent: string[][] = []
    async embed(texts: string[]) {
      this.sent.push(texts)
      this.dims = 3
      return texts.map(() => new Float32Array(3))
    }
  }

  it('previews and approves embeddings without redacting them', async () => {
    const { deps, needed, approvals, logged } = setup('new-excerpts')
    const inner = new Embedder()
    const guarded = guardEmbedding(inner, REMOTE, deps)
    await guarded.embed([DIMENSION_PROBE])
    expect(needed).toHaveLength(0)
    expect(guarded.dims).toBe(3)
    const pending = guarded.embed([PLAN])
    const m = await waitFor(needed)
    expect(m).toMatchObject({ kind: 'embed', redactable: false, spans: [] })
    expect(m.parts[0]!.text).toBe(PLAN)
    approvals.decide(m.requestId, m.requestHash, 'send')
    await pending
    expect(inner.sent[1]).toEqual([PLAN])
    await guarded.embed(['another batch'])
    expect(needed).toHaveLength(1)
    expect(logged.map((l) => l.approval)).toEqual(['asked', 'job-approval'])
  })

  it('previews media prompts and sends the job as it is', async () => {
    const { deps, needed, approvals } = setup('every-request')
    const generate = vi.fn(async (job: MediaJob) => [
      { kind: job.kind, filePath: '/x.png', mimeType: 'image/png', provenance: {} },
    ])
    const inner = {
      id: 'cloud',
      kind: 'mock',
      config: REMOTE,
      capabilities: () => new Set(['image']),
      health: async () => ({ ok: true }),
      generate,
    } as unknown as MediaProvider
    const job: MediaJob = {
      kind: 'image',
      injectId: 'i1',
      brief: { paths: ['ai_image'], imagePrompt: 'A flooded pump house at night' },
      outDir: '/tmp/out',
    }
    const pending = guardMedia(inner, REMOTE, deps).generate(job)
    const m = await waitFor(needed)
    expect(m).toMatchObject({ kind: 'media', task: 'image', redactable: true })
    expect(m.parts).toEqual([
      { name: 'Image prompt', chars: 29, text: 'A flooded pump house at night' },
    ])
    approvals.decide(m.requestId, m.requestHash, 'send')
    await pending
    expect(generate.mock.calls[0]![0]).toMatchObject({ brief: job.brief, outDir: '/tmp/out' })
  })
})
