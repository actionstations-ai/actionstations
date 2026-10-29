// Live check (LIVE=1) for plan-conflict confirmation (#423): the planted conflict corpus with
// LM Studio as the review model. Every verdict that survives must quote both passages word for
// word; the run never fails on a model that answers badly (its verdicts are discarded).
//   LIVE=1 pnpm test src/main/grounding/plan-check.live.test.ts
// LM Studio: LIVE_LMSTUDIO_URL (default http://127.0.0.1:1234/v1), model LIVE_LMSTUDIO_MODEL.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PlanConflictsFile, type Chunk, type Project } from '@shared/schemas'
import { loadConflictCorpus } from './fixtures/conflict-corpus.test-helper'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))
vi.mock('../lib/events', () => ({ emit: vi.fn() }))
const docs = loadConflictCorpus()
vi.mock('../retrieve', () => ({
  openIndex: async () => ({
    chunks: (documentId: string): Chunk[] =>
      (docs.find((d) => d.id === documentId)?.chunks ?? []).map((c, ord) => ({
        id: c.chunkId,
        documentId,
        headingPath: c.headingPath,
        ord,
        text: c.text,
        tokenCount: 10,
      })),
  }),
}))
process.env.TTX_RESOURCES = resolve(process.cwd())

const LIVE = process.env.LIVE === '1'
const URL = process.env.LIVE_LMSTUDIO_URL ?? 'http://127.0.0.1:1234/v1'
const MODEL = process.env.LIVE_LMSTUDIO_MODEL ?? 'qwen3-30b-a3b-2507'

describe.skipIf(!LIVE)('plan check with LM Studio (live)', () => {
  it('confirms planted conflicts only with quotes found in both passages', async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    const root = mkdtempSync(join(tmpdir(), 'ttx-plan-live-'))
    const { setPipelineDeps, pipelineDeps } = await import('../generate/deps')
    const { createTextProvider } = await import('../providers/registry')
    const real = await pipelineDeps()
    const provider = createTextProvider({
      id: 'lmstudio',
      kind: 'openai-compatible',
      label: 'LM Studio',
      baseUrl: URL,
      defaultModel: MODEL,
      options: {},
      enabled: true,
    })
    setPipelineDeps({
      loadProject: async () =>
        ({
          id: 'p',
          name: 'Harrow Valley',
          orgName: 'Harrow Valley Water Authority',
          documents: docs.map((d) => ({
            id: d.id,
            title: d.title,
            filename: `${d.id}.md`,
            kind: 'plan',
            status: 'ok',
            headingsPreview: [],
          })),
        }) as unknown as Project,
      loadPrompt: (name) => real.loadPrompt(name),
      resolveTextProvider: async () => ({ provider, model: MODEL, providerId: 'lmstudio' }),
    })
    const { runPlanCheck } = await import('./plan-check-job')
    const summary = await runPlanCheck(
      root,
      { confirmWithModel: true, withinDocument: false },
      {
        jobId: 'live',
        signal: new AbortController().signal,
        progress: () => undefined,
        log: () => undefined,
        token: () => undefined,
        throwIfCancelled: () => undefined,
      },
    )
    expect(summary.sent).toBe(5)
    const file = PlanConflictsFile.parse(
      JSON.parse(readFileSync(join(root, 'plan-conflicts.json'), 'utf8')),
    )
    for (const f of file.findings.filter((x) => x.verdict !== 'unconfirmed')) {
      expect(f.verdictQuotes).toBeDefined()
    }
    setPipelineDeps(undefined)
  }, 300_000)
})
