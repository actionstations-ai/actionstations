// Review policies, document approvals and hash binding (FR-6 to FR-8).
import { describe, expect, it, vi } from 'vitest'
import type { OutboundManifest, ReviewPolicy } from '@shared/schemas'
import { Approvals, policyDecision, scopeKeyFor, type ScopeState } from './approvals'

let n = 0
function manifest(
  review: ReviewPolicy,
  excerpts: [number, string][] = [],
  extra: Partial<OutboundManifest> = {},
): OutboundManifest {
  n += 1
  return {
    requestId: `r${n}`,
    requestHash: `h${n}`,
    jobId: 'job1',
    kind: 'chat',
    providerId: 'cloud',
    providerLabel: 'Cloud',
    host: 'api.example.com',
    model: 'm',
    task: 'draft',
    review,
    excerpts: excerpts.map(([chunkId, documentId]) => ({
      chunkId,
      documentId,
      documentTitle: documentId,
      headingPath: 'A › B',
      chars: 1,
      text: 'x',
    })),
    parts: [],
    redactions: {},
    spans: [],
    totalChars: 0,
    estimatedTokens: 0,
    redactable: true,
    createdAt: new Date(2026, 0, 1, 0, 0, n).toISOString(),
    ...extra,
  }
}

const hooks = () => ({ needed: vi.fn(), settled: vi.fn(), cancelJob: vi.fn() })
const KEY = scopeKeyFor('cloud', 'job1')

describe('policyDecision', () => {
  const state = (p: Partial<ScopeState> = {}): ScopeState => ({
    approved: false,
    chunks: new Set(),
    documents: new Set(),
    ...p,
  })

  it('off never asks', () => {
    expect(policyDecision('off', state(), manifest('off'))).toBe('policy-off')
  })

  it('every-request always asks', () => {
    expect(policyDecision('every-request', state({ approved: true }), manifest('off'))).toBe('ask')
  })

  it('per-job asks once', () => {
    expect(policyDecision('per-job', state(), manifest('per-job'))).toBe('ask')
    const m = manifest('per-job', [[9, 'docB']])
    expect(policyDecision('per-job', state({ approved: true }), m)).toBe('job-approval')
  })

  it('new-excerpts asks first, then only for excerpts not yet approved', () => {
    const approved = state({ approved: true, chunks: new Set([1]), documents: new Set(['docB']) })
    const r = 'new-excerpts'
    expect(policyDecision(r, state(), manifest(r))).toBe('ask')
    expect(policyDecision(r, approved, manifest(r))).toBe('job-approval')
    expect(policyDecision(r, approved, manifest(r, [[1, 'docA']]))).toBe('job-approval')
    expect(policyDecision(r, approved, manifest(r, [[7, 'docB']]))).toBe('document-approval')
    expect(policyDecision(r, approved, manifest(r, [[2, 'docA']]))).toBe('ask')
  })
})

describe('Approvals', () => {
  it('waits for the user and resolves with the approved hash', async () => {
    const h = hooks()
    const a = new Approvals(h)
    const m = manifest('new-excerpts', [[1, 'docA']])
    const p = a.authorize(KEY, m)
    expect(h.needed).toHaveBeenCalledWith(m)
    expect(a.list().map((x) => x.requestId)).toEqual([m.requestId])
    a.decide(m.requestId, m.requestHash, 'send')
    await expect(p).resolves.toEqual({ approval: 'asked', approvedHash: m.requestHash })
    expect(h.settled).toHaveBeenCalledWith(m)
    expect(a.list()).toEqual([])
  })

  it('refuses a decision for content other than what is waiting', async () => {
    const a = new Approvals(hooks())
    const m = manifest('every-request')
    void a.authorize(KEY, m)
    expect(() => a.decide(m.requestId, 'another-hash', 'send')).toThrow(/changed/)
    expect(() => a.decide('nope', m.requestHash, 'send')).toThrow(/no longer waiting/)
    expect(a.list()).toHaveLength(1)
  })

  it('approving documents covers later excerpts from them in the same job only', async () => {
    const a = new Approvals(hooks())
    const first = manifest('new-excerpts', [[1, 'docA']])
    const p = a.authorize(KEY, first)
    a.decide(first.requestId, first.requestHash, 'approve-documents')
    await p
    await expect(a.authorize(KEY, manifest('new-excerpts', [[5, 'docA']]))).resolves.toMatchObject({
      approval: 'document-approval',
    })
    const other = scopeKeyFor('cloud', 'job2')
    void a.authorize(other, manifest('new-excerpts', [[5, 'docA']]))
    expect(a.list()).toHaveLength(1)
  })

  it('approvals are per provider within a job', async () => {
    const a = new Approvals(hooks())
    const m = manifest('per-job')
    const p = a.authorize(KEY, m)
    a.decide(m.requestId, m.requestHash, 'send')
    await p
    void a.authorize(scopeKeyFor('another-cloud', 'job1'), manifest('per-job'))
    expect(a.list()).toHaveLength(1)
  })

  it('cancel rejects the request and cancels the job', async () => {
    const h = hooks()
    const a = new Approvals(h)
    const m = manifest('every-request')
    const p = a.authorize(KEY, m)
    a.decide(m.requestId, m.requestHash, 'cancel')
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(h.cancelJob).toHaveBeenCalledWith('job1')
  })

  it('a cancelled job drops its waiting request', async () => {
    const a = new Approvals(hooks())
    const controller = new AbortController()
    const p = a.authorize(KEY, manifest('every-request'), controller.signal)
    controller.abort()
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(a.list()).toEqual([])
    await expect(
      a.authorize(KEY, manifest('every-request'), controller.signal),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('recompute releases waiting requests of the changed project for a rebuild', async () => {
    const a = new Approvals(hooks())
    const p = a.authorize(KEY, manifest('every-request', [], { projectPath: '/p1' }))
    void a.authorize(KEY, manifest('every-request', [], { projectPath: '/p2' }))
    a.recompute('/p1')
    await expect(p).resolves.toEqual({ recompute: true })
    expect(a.list().map((m) => m.projectPath)).toEqual(['/p2'])
  })

  it('endJob forgets what the job approved', async () => {
    const a = new Approvals(hooks())
    const m = manifest('per-job')
    const p = a.authorize(KEY, m)
    a.decide(m.requestId, m.requestHash, 'send')
    await p
    a.endJob('job1')
    void a.authorize(KEY, manifest('per-job'))
    expect(a.list()).toHaveLength(1)
  })
})
