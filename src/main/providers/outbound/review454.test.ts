// Regression tests for the security review of PR #454. Each test is an attack from the review
// that must now fail: restored values re-sent in the clear, unapproved content riding on an
// earlier approval, unredacted media prompts, path-only image hashing, an unsalted send-log hash,
// and Ollama cloud models treated as local.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  PrivacySettings,
  REDACTION_CATEGORIES,
  type CloudSendEntry,
  type OutboundManifest,
  type ProviderConfig,
} from '@shared/schemas'
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
import { MEDIA_STAND_INS, guardEmbedding, guardMedia, guardText, type GateDeps } from './gate'
import { hashRequest } from './manifest'
import { RedactionRegistry, redactText } from './redact'
import { reverseText } from './reverse'

const ALL = new Set(REDACTION_CATEGORIES)
const REMOTE: ProviderConfig = {
  id: 'cloud',
  kind: 'mock',
  label: 'Cloud',
  baseUrl: 'https://api.example.com/v1',
  defaultModel: 'm',
  options: {},
  enabled: true,
}

function setup(review: PrivacySettings['review'] = 'new-excerpts') {
  const registry = new RedactionRegistry(Buffer.alloc(32, 5))
  const needed: OutboundManifest[] = []
  const logged: CloudSendEntry[] = []
  const approvals = new Approvals({
    needed: (m) => needed.push(m),
    settled: () => undefined,
    cancelJob: vi.fn(),
  })
  const byProject: Record<string, PrivacySettings['review']> = {}
  const deps: GateDeps = {
    approvals,
    privacy: async (p) => PrivacySettings.parse({ review: (p && byProject[p]) ?? review }),
    context: async () => emptyContext(),
    registry: async () => registry,
    enabled: () => ALL,
    log: async (e) => void logged.push(e),
    knownProject: async () => true,
  }
  return { deps, needed, logged, approvals, registry, byProject }
}

class Capture implements TextProvider {
  readonly kind = 'mock' as const
  readonly id = 'cloud'
  sent: ChatRequest[] = []
  constructor(
    readonly config: ProviderConfig,
    private reply: (r: ChatRequest) => string = () => 'ok',
  ) {}
  listModels = async () => []
  health = async () => ({ ok: true })
  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.sent.push(req)
    return {
      text: this.reply(req),
      model: 'm',
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: 'stop',
      latencyMs: 0,
    }
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5))
async function approveNext(s: ReturnType<typeof setup>, n: number): Promise<void> {
  for (let i = 0; i < 100 && s.needed.length < n; i++) await tick()
  const m = s.needed[n - 1]!
  s.approvals.decide(m.requestId, m.requestHash, 'send')
}

describe('finding 2: restored values are never re-sent in the clear', () => {
  it('a name restored into a reply is redacted again when the reply is sent back', () => {
    const reg = new RedactionRegistry(Buffer.alloc(32, 1))
    const first = redactText('Call Chief Zubair Oyelaran at the EOC.', ALL, emptyContext(), reg)
    expect(first.text).not.toContain('Zubair')
    const placeholder = first.spans[0]!.placeholder
    const reply = reverseText(`${placeholder} opens the EOC at 0800.`, reg).value
    expect(reply).toBe('Zubair Oyelaran opens the EOC at 0800.')
    const second = redactText(reply, ALL, emptyContext(), reg)
    expect(second.text).toBe(`${placeholder} opens the EOC at 0800.`)
  })

  it('catches a known phone number in another spelling and a known name in any case', () => {
    const reg = new RedactionRegistry(Buffer.alloc(32, 1))
    redactText('Chief Zubair Oyelaran, (509) 555-0142', ALL, emptyContext(), reg)
    const later = redactText('ZUBAIR OYELARAN: 509.555.0142', ALL, emptyContext(), reg)
    expect(later.text).not.toMatch(/zubair|555/i)
  })

  it('a repair round and a later stage carry placeholders, not the restored values', async () => {
    const s = setup('off')
    const inner = new Capture(REMOTE, (req) => {
      const ph = /\[\[PERSON_[A-Z2-7]+\]\]/.exec(JSON.stringify(req.messages))?.[0] ?? ''
      return JSON.stringify({ lead: ph })
    })
    const p = guardText(inner, REMOTE, s.deps)
    const first = await p.chat({
      messages: [{ role: 'user', content: 'Chief Zubair Oyelaran leads.' }],
      json: { name: 'X', schema: {} },
    })
    expect(first.json).toEqual({ lead: 'Zubair Oyelaran' })
    await p.chat({
      messages: [
        { role: 'user', content: 'Chief Zubair Oyelaran leads.' },
        { role: 'assistant', content: first.text },
        { role: 'user', content: 'Fix it' },
      ],
    })
    await p.chat({ messages: [{ role: 'user', content: `Earlier output: ${first.text}` }] })
    for (const req of inner.sent) expect(JSON.stringify(req)).not.toMatch(/Zubair|Oyelaran/)
  })
})

describe('finding 4: new content and new media prompts', () => {
  it('"Ask for any new content": different project content asks again; the same does not', async () => {
    const s = setup('new-content')
    const inner = new Capture(REMOTE)
    const p = guardText(inner, REMOTE, s.deps)
    const req = (content: string): ChatRequest => ({
      messages: [{ role: 'user', content }],
      outbound: { jobId: 'j', excerpts: [] },
    })
    const first = p.chat(req('harmless'))
    await approveNext(s, 1)
    await first
    await p.chat(req('harmless'))
    expect(s.needed).toHaveLength(1)
    const second = p.chat(req('FULL FACILITY FILE: gate codes 4471, PACS credentials'))
    await approveNext(s, 2)
    await second
    expect(s.needed).toHaveLength(2)
    expect(s.needed[1]!.parts[0]!.text).toContain('gate codes')
  })

  it('the default asks for new excerpts, not for other new text (it is re-redacted)', async () => {
    const s = setup('new-excerpts')
    const inner = new Capture(REMOTE)
    const p = guardText(inner, REMOTE, s.deps)
    const req = (content: string): ChatRequest => ({
      messages: [{ role: 'user', content }],
      outbound: { jobId: 'j', excerpts: [] },
    })
    const first = p.chat(req('Chief Zubair Oyelaran leads.'))
    await approveNext(s, 1)
    await first
    await p.chat(req('Earlier output: Zubair Oyelaran opens the EOC.'))
    expect(s.needed).toHaveLength(1)
    expect(JSON.stringify(inner.sent[1])).not.toMatch(/Zubair|Oyelaran/)
  })

  it('the default asks for each media prompt not yet approved in the job', async () => {
    const s = setup('new-excerpts')
    const inner = {
      id: 'cloud',
      kind: 'mock',
      config: REMOTE,
      capabilities: () => new Set(['image']),
      health: async () => ({ ok: true }),
      generate: vi.fn(async () => []),
    } as unknown as MediaProvider
    const media = guardMedia(inner, REMOTE, s.deps)
    const job = (imagePrompt: string): MediaJob => ({
      kind: 'image',
      injectId: 'i',
      outDir: '/tmp',
      brief: { paths: ['ai_image'], imagePrompt },
    })
    const { runInJobScope } = await import('../../jobs/scope')
    const run = (prompt: string) => runInJobScope({ jobId: 'j' }, () => media.generate(job(prompt)))
    const a = run('A flooded pump house')
    await approveNext(s, 1)
    await a
    await run('A flooded pump house')
    expect(s.needed).toHaveLength(1)
    const b = run('Smoke over the chlorine building')
    await approveNext(s, 2)
    await b
    expect(s.needed).toHaveLength(2)
  })

  it('excerpts from approved documents still go without asking', async () => {
    const s = setup('new-excerpts')
    const p = guardText(new Capture(REMOTE), REMOTE, s.deps)
    const ex = (chunkId: number, text: string) => ({
      chunkId,
      documentId: 'docA',
      documentTitle: 'ERP',
      headingPath: 'ERP › 1',
      text,
    })
    const req = (e: ReturnType<typeof ex>): ChatRequest => ({
      system: 'You write exercises.',
      cacheableContext: `<documents>\n<document key="C1" source="ERP" section="1">\n${e.text}\n</document>\n</documents>`,
      messages: [{ role: 'user', content: 'Draft the overview.' }],
      outbound: { jobId: 'j', excerpts: [e] },
    })
    const first = p.chat(req(ex(1, 'Pumps run on two shifts.')))
    for (let i = 0; i < 100 && s.needed.length < 1; i++) await tick()
    s.approvals.decide(s.needed[0]!.requestId, s.needed[0]!.requestHash, 'approve-documents')
    await first
    await p.chat(req(ex(2, 'Valve 7 feeds the east reservoir.')))
    expect(s.needed).toHaveLength(1)
  })
})

describe('finding 4: media prompts are redacted', () => {
  it('names and numbers in image and voice prompts become plain stand-ins', async () => {
    const s = setup('off')
    const generate = vi.fn(async (job: MediaJob) => [
      { kind: job.kind, filePath: '/x', mimeType: 'audio/wav', provenance: {} },
    ])
    const inner = {
      id: 'cloud',
      kind: 'mock',
      config: REMOTE,
      capabilities: () => new Set(['image', 'audio']),
      health: async () => ({ ok: true }),
      generate,
    } as unknown as MediaProvider
    const media = guardMedia(inner, REMOTE, s.deps)
    await media.generate({
      kind: 'image',
      injectId: 'i',
      outDir: '/tmp',
      brief: { paths: ['ai_image'], imagePrompt: 'Chief Zubair Oyelaran at a podium' },
    })
    await media.generate({
      kind: 'audio',
      injectId: 'i',
      outDir: '/tmp',
      brief: {
        paths: ['tts'],
        voiceLines: [{ speaker: 'PIO', voiceStyle: '', text: 'Call Dana Ruiz at (509) 555-0142.' }],
      },
    })
    const sent = JSON.stringify(generate.mock.calls)
    expect(sent).not.toMatch(/Zubair|Oyelaran|Dana|555/)
    expect(sent).toContain(MEDIA_STAND_INS.person)
    expect(sent).toContain(MEDIA_STAND_INS.phone)
  })
})

describe('finding 8: a video input image is bound by its bytes', () => {
  it('different image bytes at the same path make a different request; the dialog shows it', async () => {
    const s = setup('every-request')
    const dir = mkdtempSync(join(tmpdir(), 'ttx-img-'))
    const path = join(dir, 'in.png')
    const inner = {
      id: 'cloud',
      kind: 'mock',
      config: REMOTE,
      capabilities: () => new Set(['video']),
      health: async () => ({ ok: true }),
      generate: vi.fn(async () => []),
    } as unknown as MediaProvider
    const media = guardMedia(inner, REMOTE, s.deps)
    const job: MediaJob = {
      kind: 'video',
      injectId: 'i',
      outDir: dir,
      inputImagePath: path,
      brief: { paths: ['ai_video'], videoPrompt: 'Smoke over the plant' },
    }
    writeFileSync(path, Buffer.from('first image'))
    const a = media.generate(job)
    await approveNext(s, 1)
    await a
    writeFileSync(path, Buffer.from('second image'))
    const b = media.generate(job)
    await approveNext(s, 2)
    await b
    expect(s.needed[0]!.requestHash).not.toBe(s.needed[1]!.requestHash)
    expect(s.needed[0]!.images?.[0]?.dataUrl).toMatch(/^data:image\/png;base64,/)
  })
})

describe('send log fingerprint', () => {
  it('logs a keyed HMAC, not the plain request hash', async () => {
    const s = setup('off')
    await guardText(new Capture(REMOTE), REMOTE, s.deps).chat({
      messages: [{ role: 'user', content: 'hello' }],
    })
    const plain = hashRequest(
      { host: 'api.example.com', providerId: 'cloud' },
      { messages: [{ role: 'user', content: 'hello' }] },
    )
    expect(s.logged[0]!.requestHash).toMatch(/^[0-9a-f]{64}$/)
    expect(s.logged[0]!.requestHash).not.toBe(plain)
  })
})

describe('finding 5: requests outside a job use their own project', () => {
  it('two projects with different settings: each gets its own policy and approval', async () => {
    const s = setup('off')
    s.byProject['/tmp/project-a'] = 'every-request'
    const embedder: EmbeddingProvider = {
      id: 'cloud',
      model: 'e',
      dims: 3,
      embed: async (t) => t.map(() => new Float32Array(3)),
    }
    const guarded = guardEmbedding(embedder, REMOTE, s.deps)
    const { runInJobScope } = await import('../../jobs/scope')
    const a = runInJobScope({ projectPath: '/tmp/project-a' }, () => guarded.embed(['query a']))
    await approveNext(s, 1)
    await a
    expect(s.needed[0]).toMatchObject({ projectPath: '/tmp/project-a', review: 'every-request' })
    await runInJobScope({ projectPath: '/tmp/project-b' }, () => guarded.embed(['query b']))
    expect(s.needed).toHaveLength(1)
    expect(s.logged.map((l) => l.approval)).toEqual(['asked', 'policy-off'])
  })
})

describe('finding 6: Ollama cloud models', () => {
  const OLLAMA: ProviderConfig = {
    id: 'ollama',
    kind: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434',
    options: {},
    enabled: true,
  }

  it('a local model goes straight to the local daemon', async () => {
    const s = setup('every-request')
    const inner = new Capture(OLLAMA)
    const req: ChatRequest = {
      model: 'qwen3:8b',
      messages: [{ role: 'user', content: 'Dana Ruiz' }],
    }
    await guardText(inner, OLLAMA, s.deps).chat(req)
    expect(inner.sent[0]).toBe(req)
    expect(s.needed).toHaveLength(0)
  })

  it('a -cloud model is a cloud request to ollama.com', async () => {
    const s = setup('every-request')
    const inner = new Capture(OLLAMA)
    const pending = guardText(inner, OLLAMA, s.deps).chat({
      model: 'gpt-oss:120b-cloud',
      messages: [{ role: 'user', content: 'Chief Dana Ruiz' }],
    })
    await approveNext(s, 1)
    await pending
    expect(s.needed[0]!.host).toBe('ollama.com')
    expect(JSON.stringify(inner.sent)).not.toContain('Dana Ruiz')
  })
})
