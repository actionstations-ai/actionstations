// A whole scenario generated through a cloud provider (#433): the mock adapter is marked remote,
// so every stage call passes the outbound gate. The designer's request names a person and a
// phone number; no request the adapter receives may contain them, the saved scenario must
// contain them again, and the send log gets one line per stage call.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import { STAGE_OUTPUT_SCHEMAS, type StageOutputSchemaName } from '@shared/schemas'
import type { ChatRequest } from '../providers/types'
import { FakeNciaIndex } from '../../../tests/fixtures/generate/fakes'
import { RUBRIC, mselResponder } from '../../../tests/fixtures/generate/stage-fixtures'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { dispatch } = await import('../ipc/registry')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: generateHandlers } = await import('../ipc/handlers/generate')
const { jobs } = await import('../jobs/manager')
const { onEmit } = await import('../lib/events')
const { resetSettingsCache, updateSettings } = await import('../settings/store')
const { MOCK_PROVIDER_ID, resetResolveState } = await import('../providers/resolve')
const { clearMockResponses, setMockResponse } = await import('../providers/mock/adapter')
const { MOCK_FIXTURES } = await import('../providers/mock/fixtures')
const { approvals } = await import('../providers/outbound')
const { setPipelineDeps } = await import('./deps')
const { getScenario } = await import('../scenario/store')

const handlers = { ...projectHandlers, ...generateHandlers }

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

const PERSON = 'Dana Ruiz'
const PHONE = '(509) 555-0142'
const PLACEHOLDER = /\[\[PERSON_[A-Z2-7]{4,}\]\]/

let projectPath: string
let sent: ChatRequest[]
let asked: number
let stopListening: () => void

/** Every stage schema answers with its fixture, recording the request it received. */
function captureEverything(): void {
  for (const name of Object.keys(STAGE_OUTPUT_SCHEMAS) as StageOutputSchemaName[]) {
    setMockResponse(name, (req) => {
      sent.push(req)
      if (name === 'MselPhaseOutput') return mselResponder(req)
      if (name === 'RubricOutput') return RUBRIC
      const fixture = structuredClone(MOCK_FIXTURES[name]) as Record<string, unknown>
      if (name === 'OverviewOutput') {
        // The model refers to the person by the placeholder it was given.
        const placeholder = PLACEHOLDER.exec(JSON.stringify(req.messages))?.[0] ?? 'none'
        fixture.title = `Call ${placeholder}`
      }
      return fixture
    })
  }
}

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  sent = []
  asked = 0
  await updateSettings((s) => {
    s.providers = [
      {
        id: MOCK_PROVIDER_ID,
        kind: 'mock',
        label: 'Cloud (mock)',
        defaultModel: 'mock-large',
        options: { network: 'remote' },
        enabled: true,
      },
    ]
    s.defaultRouting = Object.fromEntries(
      (['ideate', 'draft', 'critique'] as const).map((t) => [t, { providerId: MOCK_PROVIDER_ID }]),
    )
  })
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-cloud-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' }))
    .path
  setPipelineDeps({ openIndex: async () => new FakeNciaIndex() })
  captureEverything()
  // The user approves the documents of the first request; later ones go under that approval.
  stopListening = onEmit((name, payload) => {
    if (name !== 'outbound:approval-needed') return
    asked += 1
    const { requestId } = payload as { requestId: string }
    const m = approvals.list().find((x) => x.requestId === requestId)!
    approvals.decide(m.requestId, m.requestHash, 'approve-documents')
  })
})

afterEach(() => {
  stopListening()
  clearMockResponses()
  setPipelineDeps(undefined)
})

describe('scenario generation through a cloud provider', () => {
  it('redacts every request, restores the result and logs each call', async () => {
    const brief = {
      userPrompt: `Chief ${PERSON} (${PHONE}) reports AODB tampering misleading FIDS`,
      audience: ['Airport Operations', 'IT', 'PIO', 'Security'],
      durationHours: 4,
      phaseCount: 4,
      learningObjectives: [],
      constraints: [],
      startWallClock: '09:00',
    }
    const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')

    expect(sent.length).toBeGreaterThan(3)
    for (const req of sent) {
      const body = JSON.stringify(req)
      expect(body).not.toContain(PERSON)
      expect(body).not.toContain('555-0142')
      expect(req.outbound).toBeUndefined()
    }
    expect(sent.some((r) => PLACEHOLDER.test(JSON.stringify(r)))).toBe(true)

    const scenario = await getScenario(projectPath, scenarioId)
    expect(scenario.title).toBe(`Call ${PERSON}`)
    expect(JSON.stringify(scenario)).not.toMatch(PLACEHOLDER)

    const lines = readFileSync(join(projectPath, 'cloud-sends.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(sent.length)
    const log = lines.join('\n')
    expect(log).not.toContain(PERSON)
    expect(log).not.toContain('[[PERSON_')
    const entries = lines.map((l) => JSON.parse(l) as { approval: string; jobId: string })
    expect(entries[0]!.approval).toBe('asked')
    expect(entries.every((e) => e.jobId === jobId)).toBe(true)
    // The default asks about new plan excerpts only: approving the documents of the first request
    // covers a text-only generation (later stages re-redact restored values, #454 review).
    expect(asked).toBeGreaterThanOrEqual(1)
    expect(asked).toBeLessThanOrEqual(2)
  })
})
