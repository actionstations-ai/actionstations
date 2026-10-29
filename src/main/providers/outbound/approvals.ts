// Pending cloud approvals and what each job has already approved (FR-6 to FR-8). An approval is
// bound to the hash of the exact request content the user saw: privacy:decide must echo the
// manifest's hash, and the gate sends only when the request it is about to send hashes the same.
import type { ApprovalKind, OutboundManifest, ReviewPolicy } from '@shared/schemas'
import type { ApprovalDecision } from '@shared/ipc'
import { AppError } from '../../lib/errors'

/** What one approval scope (a job and provider, or a session and provider) has approved. */
export interface ScopeState {
  approved: boolean
  chunks: Set<number>
  documents: Set<string>
  /** Fingerprints of approved content outside the excerpts (see gate.ts contentHashes). */
  content: Set<string>
}

const newState = (): ScopeState => ({
  approved: false,
  chunks: new Set(),
  documents: new Set(),
  content: new Set(),
})

/** The policy's answer for a request: send under an existing approval, or ask. */
export function policyDecision(
  review: ReviewPolicy,
  state: ScopeState,
  manifest: Pick<OutboundManifest, 'excerpts'>,
  content: readonly string[] = [],
): ApprovalKind | 'ask' {
  if (review === 'off') return 'policy-off'
  if (review === 'every-request' || !state.approved) return 'ask'
  if (review === 'per-job') return 'job-approval'
  // Content never approved in this job (an earlier stage's output, facts, a new prompt) is new.
  if (content.some((h) => !state.content.has(h))) return 'ask'
  let viaDocument = false
  for (const e of manifest.excerpts) {
    if (state.chunks.has(e.chunkId)) continue
    if (!state.documents.has(e.documentId)) return 'ask'
    viaDocument = true
  }
  return viaDocument ? 'document-approval' : 'job-approval'
}

export type Authorized = { approval: ApprovalKind; approvedHash: string } | { recompute: true }

export interface ApprovalHooks {
  /** A request now waits for the user (emit outbound:approval-needed, mark the job). */
  needed(manifest: OutboundManifest): void
  /** A pending request was answered or dropped. */
  settled(manifest: OutboundManifest): void
  /** The user chose Cancel job. */
  cancelJob(jobId: string): void
}

interface Pending {
  manifest: OutboundManifest
  scopeKey: string
  content: readonly string[]
  resolve: (r: Authorized) => void
  reject: (e: Error) => void
}

const cancelled = (): AppError => new AppError('CANCELLED', 'Cancelled before sending')

export class Approvals {
  private scopes = new Map<string, ScopeState>()
  private pending = new Map<string, Pending>()

  constructor(private readonly hooks: ApprovalHooks) {}

  private state(scopeKey: string): ScopeState {
    let s = this.scopes.get(scopeKey)
    if (!s) this.scopes.set(scopeKey, (s = newState()))
    return s
  }

  /**
   * Resolve with the approval to record, waiting for the user when the policy asks. Rejects
   * with CANCELLED when the user cancels or `signal` aborts (the job was cancelled).
   */
  authorize(
    scopeKey: string,
    manifest: OutboundManifest,
    signal?: AbortSignal,
    content: readonly string[] = [],
  ): Promise<Authorized> {
    if (signal?.aborted) return Promise.reject(cancelled())
    const decision = policyDecision(manifest.review, this.state(scopeKey), manifest, content)
    if (decision !== 'ask')
      return Promise.resolve({ approval: decision, approvedHash: manifest.requestHash })
    return new Promise<Authorized>((resolve, reject) => {
      const onAbort = (): void => this.drop(manifest.requestId, cancelled())
      const done =
        <T>(fn: (v: T) => void) =>
        (v: T) => {
          signal?.removeEventListener('abort', onAbort)
          fn(v)
        }
      this.pending.set(manifest.requestId, {
        manifest,
        scopeKey,
        content,
        resolve: done(resolve),
        reject: done(reject),
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      this.hooks.needed(manifest)
    })
  }

  /** Requests waiting for the user, oldest first. */
  list(jobId?: string): OutboundManifest[] {
    return [...this.pending.values()]
      .map((p) => p.manifest)
      .filter((m) => !jobId || m.jobId === jobId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  /** The user's answer. The hash must be the one the user saw (FR-8). */
  decide(requestId: string, requestHash: string, decision: ApprovalDecision): void {
    const p = this.pending.get(requestId)
    if (!p) throw new AppError('NOT_FOUND', 'That request is no longer waiting for approval.')
    if (p.manifest.requestHash !== requestHash)
      throw new AppError('CONFLICT', 'The request changed after it was shown. Review it again.')
    if (decision === 'cancel') {
      this.drop(requestId, cancelled())
      if (p.manifest.jobId) this.hooks.cancelJob(p.manifest.jobId)
      return
    }
    const state = this.state(p.scopeKey)
    state.approved = true
    for (const h of p.content) state.content.add(h)
    for (const e of p.manifest.excerpts) {
      state.chunks.add(e.chunkId)
      if (decision === 'approve-documents') state.documents.add(e.documentId)
    }
    this.pending.delete(requestId)
    this.hooks.settled(p.manifest)
    p.resolve({ approval: 'asked', approvedHash: requestHash })
  }

  /** Settings changed: every pending request (of one project, when given) is rebuilt. */
  recompute(projectPath?: string): void {
    for (const [id, p] of [...this.pending]) {
      if (projectPath !== undefined && p.manifest.projectPath !== projectPath) continue
      this.pending.delete(id)
      this.hooks.settled(p.manifest)
      p.resolve({ recompute: true })
    }
  }

  /** A job ended: forget what it approved and drop anything it still waits for. */
  endJob(jobId: string): void {
    for (const key of [...this.scopes.keys()])
      if (key.startsWith(`${jobId}\u0000`)) this.scopes.delete(key)
    for (const p of [...this.pending.values()])
      if (p.manifest.jobId === jobId) this.drop(p.manifest.requestId, cancelled())
  }

  private drop(requestId: string, err: Error): void {
    const p = this.pending.get(requestId)
    if (!p) return
    this.pending.delete(requestId)
    this.hooks.settled(p.manifest)
    p.reject(err)
  }
}

/** Approvals are per job and provider; outside a job, per project and provider for the session. */
export function scopeKeyFor(providerId: string, jobId?: string, projectPath?: string): string {
  return `${jobId ?? `session:${projectPath ?? ''}`}\u0000${providerId}`
}
