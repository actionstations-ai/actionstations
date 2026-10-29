// Plan check (#423, FR-10 to FR-14) on the planted conflict corpus: the deterministic part finds
// all five planted contradictions and the missing annex and lists neither near miss; the job
// with the mock provider keeps every candidate unconfirmed (the mock quotes nothing), accepts a
// verdict whose quotes are in both passages, discards one with a made-up quote, keeps the
// user's decisions on a re-run and writes plan-conflicts.json.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanConflictsFile, type Chunk, type Project } from '@shared/schemas'
import { setPipelineDeps, pipelineDeps } from '../generate/deps'
import { clearMockResponses, setMockResponse } from '../providers/mock/adapter'
import { candidatePairs, danglingFindings } from './plan-check'
import { loadConflictCorpus } from './fixtures/conflict-corpus.test-helper'

const now = '2026-10-28T12:00:00.000Z'
const docs = loadConflictCorpus()

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))
vi.mock('../lib/events', () => ({ emit: vi.fn() }))
process.env.TTX_RESOURCES = resolve(process.cwd())
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
    search: async () => [],
    chunk: () => undefined,
  }),
}))

describe('plan check: candidates on the planted corpus', () => {
  const found = candidatePairs(docs, { withinDocument: false, now })
  const bySlot = (slot: string) => found.filter((c) => c.finding.slot === slot)

  it('finds the five planted contradictions and nothing else', () => {
    expect(found.map((c) => c.finding.slot).sort()).toEqual([
      'activation_level',
      'contact_phone',
      'lead',
      'notify_deadline',
      'release_approver',
    ])
  })

  it('names both values and both documents for each contradiction', () => {
    const approver = bySlot('release_approver')[0]!.finding
    expect(approver.slotLabel).toBe('Who approves public releases')
    expect(approver.values?.slice().sort()).toEqual([
      'General Manager',
      'Public Information Officer',
    ])
    expect(approver.a.documentId).not.toBe(approver.b?.documentId)
    const deadline = bySlot('notify_deadline')[0]!.finding
    expect(deadline.subject).toBe('State EPA')
    expect(deadline.values?.slice().sort()).toEqual(['1 hour', '4 hours'])
    expect(bySlot('contact_phone')[0]!.finding.values?.slice().sort()).toEqual([
      '555-0142',
      '555-0147',
    ])
    expect(bySlot('activation_level')[0]!.finding.subject).toBe('Emergency Operations Center')
    expect(bySlot('lead')[0]!.finding.values?.slice().sort()).toEqual([
      'Harrow Fire Department',
      'Harrow Police Department',
    ])
  })

  it('does not list the near misses: the same deadline in other words, a different agency', () => {
    const subjects = found.map((c) => c.finding.subject)
    expect(subjects).not.toContain('Harrow County Sheriff')
    expect(subjects).not.toContain('State Drinking Water Program')
  })

  it('ranks authority and deadlines before phone numbers (FR-14)', () => {
    const order = found.map((c) => c.finding.slot)
    expect(order.indexOf('release_approver')).toBeLessThan(order.indexOf('contact_phone'))
    expect(order.indexOf('notify_deadline')).toBeLessThan(order.indexOf('contact_phone'))
  })

  it('pairs sections of one document only when asked', () => {
    const one = [docs[0]!]
    expect(candidatePairs(one, { withinDocument: true, now })).toEqual([])
    expect(candidatePairs(one, { withinDocument: false, now })).toEqual([])
  })

  it('lists the reference to an annex nobody ingested, and only that one', () => {
    const dangling = danglingFindings(docs, [], now)
    expect(dangling.map((f) => f.missingTarget)).toEqual(['Annex F'])
    expect(dangling[0]!.a.span).toContain('See Annex F')
  })

  it('gives every finding a stable 16-hex id', () => {
    const again = candidatePairs(docs, { withinDocument: false, now })
    expect(again.map((c) => c.finding.id)).toEqual(found.map((c) => c.finding.id))
    for (const c of found) expect(c.finding.id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('plan check job with the mock provider', () => {
  let root: string
  const project = {
    id: 'p1',
    name: 'Harrow Valley',
    orgName: 'Harrow Valley Water Authority',
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      shortName: d.shortName,
      filename: `${d.id}.md`,
      kind: 'plan',
      status: 'ok',
      sha256: 'abc',
      headingsPreview: [],
      tags: [],
      pages: 1,
      chunkCount: d.chunks.length,
    })),
  } as unknown as Project

  beforeEach(async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    root = mkdtempSync(join(tmpdir(), 'ttx-plan-check-'))
    const real = await pipelineDeps()
    setPipelineDeps({
      loadProject: async () => project,
      openIndex: async () => ({ search: async () => [], chunk: () => undefined }),
      // The default prompt files (the temp folder is not an opened project).
      loadPrompt: (name) => real.loadPrompt(name),
      renderPrompt: real.renderPrompt,
      resolveTextProvider: async () => {
        const { MockTextProvider } = await import('../providers/mock/adapter')
        const provider = new MockTextProvider({
          id: 'mock',
          kind: 'mock',
          label: 'Mock',
          options: {},
          enabled: true,
        })
        return { provider, model: 'mock-large', providerId: 'mock' }
      },
    })
  })
  afterEach(() => {
    setPipelineDeps(undefined)
    clearMockResponses()
    rmSync(root, { recursive: true, force: true })
  })

  const ctx = () => ({
    jobId: 'j1',
    signal: new AbortController().signal,
    progress: vi.fn(),
    log: vi.fn(),
    token: vi.fn(),
    throwIfCancelled: () => undefined,
  })
  const read = () =>
    PlanConflictsFile.parse(JSON.parse(readFileSync(join(root, 'plan-conflicts.json'), 'utf8')))

  it('writes five unconfirmed contradictions and the missing annex without a model', async () => {
    const { runPlanCheck } = await import('./plan-check-job')
    const summary = await runPlanCheck(
      root,
      { confirmWithModel: false, withinDocument: false },
      ctx(),
    )
    expect(summary).toMatchObject({ candidates: 5, sent: 0, dangling: 1, listed: 6 })
    const file = read()
    expect(file.findings.filter((f) => f.kind === 'contradiction')).toHaveLength(5)
    expect(file.findings.every((f) => f.verdict === 'unconfirmed')).toBe(true)
    expect(file.documents.map((d) => d.id).sort()).toEqual(docs.map((d) => d.id).sort())
  })

  it('keeps the mock’s quote-less verdicts out: every candidate stays unconfirmed', async () => {
    const { runPlanCheck } = await import('./plan-check-job')
    const summary = await runPlanCheck(
      root,
      { confirmWithModel: true, withinDocument: false },
      ctx(),
    )
    expect(summary.sent).toBe(5)
    expect(read().findings.every((f) => f.verdict === 'unconfirmed')).toBe(true)
  })

  it('accepts a verdict quoting both passages and discards one with a made-up quote', async () => {
    setMockResponse('PlanConflictOutput', (req) => {
      const user = String(req.messages.at(-1)?.content ?? '')
      const fake = user.includes('Who approves public releases')
      return {
        verdict: 'contradicts',
        quoteA: fake ? 'Only the Mayor may approve releases after midnight.' : spanOf(user, 'A'),
        quoteB: spanOf(user, 'B'),
        explanation: 'The two plans give different values.',
      }
    })
    const { runPlanCheck } = await import('./plan-check-job')
    const log = ctx()
    await runPlanCheck(root, { confirmWithModel: true, withinDocument: false }, log)
    const findings = read().findings
    const approver = findings.find((f) => f.slot === 'release_approver')!
    expect(approver.verdict).toBe('unconfirmed')
    expect(findings.filter((f) => f.verdict === 'contradicts')).toHaveLength(4)
    expect(log.log).toHaveBeenCalledWith(
      expect.stringContaining('discarded'),
      'warn',
      expect.anything(),
    )
  })

  it('keeps a dismissal on a re-run and does not ask the model again about a judged pair', async () => {
    const { runPlanCheck } = await import('./plan-check-job')
    const { setFindingStatus } = await import('./conflicts-file')
    await runPlanCheck(root, { confirmWithModel: false, withinDocument: false }, ctx())
    const phone = read().findings.find((f) => f.slot === 'contact_phone')!
    await setFindingStatus(root, phone.id, 'dismissed', 'The annex is out of date')
    await runPlanCheck(root, { confirmWithModel: false, withinDocument: false }, ctx())
    const again = read().findings.find((f) => f.id === phone.id)!
    expect(again.status).toBe('dismissed')
    expect(again.note).toBe('The annex is out of date')
  })
})

/** A sentence (or a table row with a phone number) of a passage block in the rendered prompt. */
function spanOf(user: string, key: 'A' | 'B'): string {
  const block = new RegExp(`<document key="${key}"[^>]*>\\n([\\s\\S]*?)\\n</document>`).exec(user)
  const text = block?.[1] ?? ''
  const sentence = /[A-Z][^.\n|]{20,}\./.exec(text)
  const tableRow = text.split('\n').find((l) => l.startsWith('|') && /\d{3}-\d{4}/.test(l))
  return sentence?.[0] ?? tableRow ?? ''
}

describe('plan check on the reference corpus', () => {
  it('runs the deterministic part over reference/ncia in under 10 seconds (NFR-4)', async () => {
    const { loadNciaCorpus } = await import('../retrieve/reference-corpus.test-helper')
    let nextId = 1
    const ncia = loadNciaCorpus().map(({ doc, chunks }) => ({
      id: doc.id,
      title: doc.title,
      ...(doc.shortName ? { shortName: doc.shortName } : {}),
      chunks: chunks.map((c) => ({
        chunkId: nextId++,
        documentId: doc.id,
        documentTitle: doc.title,
        headingPath: c.headingPath,
        text: c.text,
      })),
    }))
    const started = performance.now()
    const pairs = candidatePairs(ncia, { withinDocument: false, now })
    const dangling = danglingFindings(ncia, [], now)
    expect(performance.now() - started).toBeLessThan(10_000)
    expect(pairs.length + dangling.length).toBeLessThan(200)
  })
})
