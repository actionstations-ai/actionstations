// The app's outbound gate instance (#433): approvals wired to IPC events and the job manager,
// and the dependencies the wrappers in gate.ts use. providers/resolve.ts wraps with these.
import type { ProviderConfig } from '@shared/schemas'
import { jobs } from '../../jobs/manager'
import { emit, onEmit } from '../../lib/events'
import type { EmbeddingProvider, MediaProvider, TextProvider } from '../types'
import { Approvals } from './approvals'
import { guardEmbedding, guardMedia, guardText, type GateDeps } from './gate'
import { appendSend } from './send-log'
import { detectContextFor, enabledCategories, privacyFor, registryFor } from './settings'

export const approvals: Approvals = new Approvals({
  needed(m) {
    emit('outbound:approval-needed', {
      requestId: m.requestId,
      providerLabel: m.providerLabel,
      host: m.host,
      ...(m.jobId ? { jobId: m.jobId } : {}),
    })
    if (m.jobId) jobs.setAwaiting(m.jobId, { kind: 'cloud-approval', requestId: m.requestId })
  },
  settled(m) {
    emit('outbound:approval-settled', { requestId: m.requestId })
    if (!m.jobId) return
    const next = approvals.list(m.jobId)[0]
    jobs.setAwaiting(
      m.jobId,
      next ? { kind: 'cloud-approval', requestId: next.requestId } : undefined,
    )
  },
  cancelJob(jobId) {
    try {
      jobs.cancel(jobId)
    } catch {
      // Already gone.
    }
  },
})

onEmit((name, payload) => {
  if (name === 'job:done') approvals.endJob((payload as { jobId: string }).jobId)
})

export const gateDeps: GateDeps = {
  approvals,
  privacy: async (projectPath) => (await privacyFor(projectPath)).effective,
  context: detectContextFor,
  registry: registryFor,
  enabled: enabledCategories,
  log: appendSend,
}

export const guardTextProvider = (p: TextProvider, config: ProviderConfig): TextProvider =>
  guardText(p, config, gateDeps)
export const guardEmbeddingProvider = (
  p: EmbeddingProvider,
  config: ProviderConfig,
): EmbeddingProvider => guardEmbedding(p, config, gateDeps)
export const guardMediaProvider = (p: MediaProvider, config: ProviderConfig): MediaProvider =>
  guardMedia(p, config, gateDeps)
