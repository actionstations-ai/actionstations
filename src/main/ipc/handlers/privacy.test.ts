// privacy:* through the IPC dispatcher (#433).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CloudSendEntry, OutboundManifest } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./privacy')).default
const { createProject, loadProject } = await import('../../project/store')
const { markProjectOpen } = await import('../../lib/project-registry')
const { getSettings, resetSettingsCache } = await import('../../settings/store')
const { approvals } = await import('../../providers/outbound')
const { appendSend } = await import('../../providers/outbound/send-log')
const { flushRegistries, localProjectKey, registryFor, resetRegistries } =
  await import('../../providers/outbound/settings')
const { redactText } = await import('../../providers/outbound/redact')
const { emptyContext } = await import('../../providers/outbound/detect')
const { REDACTION_CATEGORIES } = await import('@shared/schemas')

async function call<T>(channel: string, req?: unknown): Promise<T> {
  const res = await dispatch(handlers, channel, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

let projectPath: string

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-privacy-'))
  resetSettingsCache()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-proj-'))
  projectPath = (await createProject({ parentDir, name: 'Rivergate' })).path
  markProjectOpen(projectPath)
})

describe('privacy settings', () => {
  it('defaults to asking for new excerpts with every category on', async () => {
    const view = await call<{ effective: { review: string; redact: object } }>('privacy:get', {})
    expect(view.effective).toMatchObject({ review: 'new-excerpts', redact: {} })
  })

  it('stores project overrides over the global defaults, and clears them', async () => {
    await call('privacy:set', { settings: { alwaysRedact: ['Big Mike'] } })
    const view = await call<{ effective: { review: string; alwaysRedact: string[] } }>(
      'privacy:set',
      { projectPath, settings: { review: 'every-request', redact: { email: false } } },
    )
    expect(view.effective).toMatchObject({
      review: 'every-request',
      redact: { email: false },
      alwaysRedact: ['Big Mike'],
    })
    // Only the stricter part travels in project.json; the relaxation stays on this computer.
    expect((await loadProject(projectPath)).privacy).toEqual({ review: 'every-request' })
    const settings = await getSettings()
    const id = await localProjectKey(projectPath, await loadProject(projectPath))
    expect(settings.projectPrivacy[id]).toEqual({
      review: 'every-request',
      redact: { email: false },
    })
    await call('privacy:set', { projectPath, settings: {}, clear: true })
    expect((await loadProject(projectPath)).privacy).toBeUndefined()
    expect((await getSettings()).projectPrivacy[id]).toBeUndefined()
  })

  it('a project file can only make settings stricter (#454 review, finding 1)', async () => {
    const file = join(projectPath, 'project.json')
    const json = JSON.parse(readFileSync(file, 'utf8'))
    writeFileSync(
      file,
      JSON.stringify({
        ...json,
        privacy: {
          review: 'off',
          redact: { person: false, phone: false, email: false, address: false },
          neverRedact: ['Dana Ruiz'],
          alwaysRedact: ['Big Mike'],
        },
      }),
    )
    const view = await call<{
      effective: { review: string; redact: object; neverRedact: string[]; alwaysRedact: string[] }
    }>('privacy:get', { projectPath })
    expect(view.effective).toEqual({
      review: 'new-excerpts',
      redact: {},
      neverRedact: [],
      alwaysRedact: ['Big Mike'],
    })
    const sample = await call<{ text: string }>('privacy:preview-redaction', {
      projectPath,
      text: 'Call Chief Dana Ruiz.',
    })
    expect(sample.text).not.toContain('Dana Ruiz')
  })

  it('a project file can ask more often than the defaults', async () => {
    const file = join(projectPath, 'project.json')
    const json = JSON.parse(readFileSync(file, 'utf8'))
    writeFileSync(file, JSON.stringify({ ...json, privacy: { review: 'every-request' } }))
    const view = await call<{ effective: { review: string } }>('privacy:get', { projectPath })
    expect(view.effective.review).toBe('every-request')
  })

  it('turning review off for a project needs the confirmation too', async () => {
    await expect(
      call('privacy:set', { projectPath, settings: { review: 'off' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('refuses to turn review off without the confirmation', async () => {
    await expect(call('privacy:set', { settings: { review: 'off' } })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    const view = await call<{ global: { review: string } }>('privacy:set', {
      settings: { review: 'off' },
      confirmOff: true,
    })
    expect(view.global.review).toBe('off')
  })

  it('refuses a project that was never opened', async () => {
    await expect(call('privacy:get', { projectPath: '/not/a/project' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('privacy:preview-redaction', () => {
  it('redacts a sample with the project settings and returns the spans', async () => {
    const res = await call<{ text: string; spans: { original: string; category: string }[] }>(
      'privacy:preview-redaction',
      { projectPath, text: 'Call Chief Dana Ruiz at (509) 555-0142.' },
    )
    expect(res.text).not.toContain('Dana Ruiz')
    expect(res.spans.map((s) => [s.category, s.original])).toEqual([
      ['person', 'Dana Ruiz'],
      ['phone', '(509) 555-0142'],
    ])
  })
})

describe('privacy:pending and privacy:decide', () => {
  it('lists waiting requests and binds the decision to the shown hash', async () => {
    const manifest = {
      requestId: 'req-1',
      requestHash: 'hash-1',
      kind: 'chat',
      providerId: 'cloud',
      providerLabel: 'Cloud',
      host: 'api.example.com',
      model: 'm',
      task: 'draft',
      review: 'every-request',
      excerpts: [],
      parts: [],
      redactions: {},
      spans: [],
      totalChars: 0,
      estimatedTokens: 0,
      redactable: true,
      createdAt: new Date().toISOString(),
    } satisfies OutboundManifest
    const waiting = approvals.authorize('scope', manifest)
    expect((await call<OutboundManifest[]>('privacy:pending', {})).map((m) => m.requestId)).toEqual(
      ['req-1'],
    )
    await expect(
      call('privacy:decide', { requestId: 'req-1', requestHash: 'other', decision: 'send' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await call('privacy:decide', { requestId: 'req-1', requestHash: 'hash-1', decision: 'send' })
    await expect(waiting).resolves.toMatchObject({ approval: 'asked' })
  })
})

describe('privacy:sends', () => {
  it('returns the send log newest first, skipping damaged lines', async () => {
    const entry = (at: string): CloudSendEntry => ({
      at,
      providerId: 'cloud',
      providerLabel: 'Cloud',
      host: 'api.example.com',
      model: 'm',
      kind: 'chat',
      task: 'draft',
      excerpts: [{ documentId: 'docA', headingPath: 'Contacts' }],
      chars: { system: 10 },
      redactions: { person: 2 },
      approval: 'asked',
      requestHash: 'h',
    })
    await appendSend(entry('2026-10-01T10:00:00.000Z'), projectPath)
    writeFileSync(join(projectPath, 'cloud-sends.jsonl'), '{not json\n', { flag: 'a' })
    await appendSend(entry('2026-10-02T10:00:00.000Z'), projectPath)
    const all = await call<CloudSendEntry[]>('privacy:sends', { projectPath })
    expect(all.map((e) => e.at)).toEqual(['2026-10-02T10:00:00.000Z', '2026-10-01T10:00:00.000Z'])
    const older = await call<CloudSendEntry[]>('privacy:sends', {
      projectPath,
      before: '2026-10-02T00:00:00.000Z',
    })
    expect(older).toHaveLength(1)
  })
})

describe('redacted values across restarts and copies (#454 re-review)', () => {
  const ALL = new Set(REDACTION_CATEGORIES)
  const redactIn = async (path: string, text: string) =>
    redactText(text, ALL, emptyContext(), await registryFor(path))

  beforeEach(() => resetRegistries())

  it('after a restart, a saved output naming someone the patterns miss still goes as a placeholder', async () => {
    const first = await redactIn(projectPath, 'Call Chief Zubair Oyelaran at the EOC.')
    const placeholder = first.spans[0]!.placeholder
    await flushRegistries()
    resetRegistries() // a new app session: a new registry instance
    const saved = await redactIn(projectPath, 'Zubair Oyelaran opens the EOC at 0800.')
    expect(saved.text).toBe(`${placeholder} opens the EOC at 0800.`)
  })

  it('after a restart, the gate sends a saved stage output with the name as a placeholder', async () => {
    const { guardText } = await import('../../providers/outbound/gate')
    const { Approvals } = await import('../../providers/outbound/approvals')
    const { PrivacySettings } = await import('@shared/schemas')
    const config = {
      id: 'cloud',
      kind: 'mock' as const,
      label: 'Cloud',
      baseUrl: 'https://api.example.com/v1',
      options: {},
      enabled: true,
    }
    const sent: string[] = []
    const inner = {
      id: 'cloud',
      kind: 'mock' as const,
      config,
      listModels: async () => [],
      health: async () => ({ ok: true }),
      chat: async (req: { messages: { content: string }[] }) => {
        sent.push(JSON.stringify(req))
        return {
          text: 'ok',
          model: 'm',
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: 'stop' as const,
          latencyMs: 0,
        }
      },
    }
    const deps = {
      approvals: new Approvals({ needed: () => {}, settled: () => {}, cancelJob: () => {} }),
      privacy: async () => PrivacySettings.parse({ review: 'off' }),
      context: async () => emptyContext(),
      registry: registryFor,
      enabled: () => ALL,
      log: async () => undefined,
      knownProject: async () => true,
    }
    const send = (content: string) =>
      guardText(inner, config, deps).chat({
        messages: [{ role: 'user', content }],
        outbound: { projectPath, excerpts: [] },
      })
    await send('Call Chief Zubair Oyelaran at the EOC.')
    await flushRegistries()
    resetRegistries()
    await send('Saved overview: Zubair Oyelaran opens the EOC at 0800.')
    expect(sent[1]).not.toMatch(/Zubair|Oyelaran/)
    expect(sent[1]).toMatch(/\[\[PERSON_[A-Z2-7]{4,}\]\] opens the EOC/)
  })

  it('quitting while a write is pending still keeps the values (#433)', async () => {
    const { runQuitFlushes } = await import('../../lib/quit-flush')
    const first = await redactIn(projectPath, 'Call Chief Zubair Oyelaran.')
    // No flushRegistries(): the write is still pending when the app quits.
    await runQuitFlushes()
    resetRegistries()
    const after = await redactIn(projectPath, 'Zubair Oyelaran opens the EOC.')
    expect(after.text).toBe(`${first.spans[0]!.placeholder} opens the EOC.`)
  })

  it('keeps the values encrypted in the settings folder, never in the project folder', async () => {
    await redactIn(projectPath, 'Call Chief Zubair Oyelaran.')
    await flushRegistries()
    const dir = join(process.env.TTX_USER_DATA!, 'redaction')
    const files = readdirSync(dir)
    expect(files).toHaveLength(1)
    expect(readFileSync(join(dir, files[0]!)).toString('latin1')).not.toMatch(/Zubair|Oyelaran/)
    expect(readdirSync(projectPath).some((f) => f.includes('redaction'))).toBe(false)
  })

  it('a copied project folder gets neither the relaxed settings nor the key', async () => {
    await call('privacy:set', {
      projectPath,
      settings: { redact: { person: false } },
    })
    const original = await redactIn(projectPath, 'Call Chief Zubair Oyelaran.')
    const copy = join(mkdtempSync(join(tmpdir(), 'ttx-copy-')), 'Copy.asproj')
    cpSync(projectPath, copy, { recursive: true })
    markProjectOpen(copy)
    expect(existsSync(join(copy, 'project.json'))).toBe(true)
    const view = await call<{ effective: { redact: object } }>('privacy:get', { projectPath: copy })
    expect(view.effective.redact).toEqual({})
    const copied = await redactIn(copy, 'Call Chief Zubair Oyelaran.')
    expect(copied.text).not.toContain('Zubair')
    expect(copied.text).not.toBe(original.text)
  })
})
