// privacy:* through the IPC dispatcher (#433).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
    const { id } = await loadProject(projectPath)
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
