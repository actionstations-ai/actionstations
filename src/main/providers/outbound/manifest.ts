// What a cloud request contains, for the approval dialog (FR-4) and the hash that binds an
// approval to it (FR-8). Built from the request as it will be sent (after redaction).
import { createHash } from 'node:crypto'
import type {
  OutboundExcerpt,
  OutboundKind,
  OutboundManifest,
  RedactionCategory,
  RedactionSpan,
  ReviewPolicy,
} from '@shared/schemas'
import { newId, nowIso } from '../../lib/ids'
import type { PlacedSpan } from './redact'

export interface ManifestPart {
  name: string
  text: string
  spans: PlacedSpan[]
}

export interface ManifestExcerpt extends Omit<OutboundExcerpt, 'chars'> {
  spans: PlacedSpan[]
}

export interface ManifestInput {
  kind: OutboundKind
  providerId: string
  providerLabel: string
  host: string
  model: string
  task: string
  review: ReviewPolicy
  requestHash: string
  redactable: boolean
  parts: ManifestPart[]
  excerpts: ManifestExcerpt[]
  jobId?: string
  projectPath?: string
  stage?: string
  itemId?: string
}

const toSpans = (part: string, spans: PlacedSpan[]): RedactionSpan[] =>
  spans.map((s) => ({ part, ...s }))

function countByCategory(parts: ManifestPart[]): Partial<Record<RedactionCategory, number>> {
  const out: Partial<Record<RedactionCategory, number>> = {}
  for (const p of parts) for (const s of p.spans) out[s.category] = (out[s.category] ?? 0) + 1
  return out
}

export function buildManifest(input: ManifestInput): OutboundManifest {
  const totalChars = input.parts.reduce((n, p) => n + p.text.length, 0)
  return {
    requestId: newId(),
    requestHash: input.requestHash,
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.projectPath ? { projectPath: input.projectPath } : {}),
    kind: input.kind,
    providerId: input.providerId,
    providerLabel: input.providerLabel,
    host: input.host,
    model: input.model,
    task: input.task,
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.itemId ? { itemId: input.itemId } : {}),
    review: input.review,
    excerpts: input.excerpts.map(({ spans: _spans, ...e }) => ({ ...e, chars: e.text.length })),
    parts: input.parts.map((p) => ({ name: p.name, chars: p.text.length, text: p.text })),
    redactions: countByCategory(input.parts),
    spans: [
      ...input.parts.flatMap((p) => toSpans(p.name, p.spans)),
      ...input.excerpts.flatMap((e) => toSpans(`excerpt:${e.chunkId}`, e.spans)),
    ],
    totalChars,
    estimatedTokens: Math.ceil(totalChars / 4),
    redactable: input.redactable,
    createdAt: nowIso(),
  }
}

/** Stable JSON: object keys sorted, so the same content always hashes the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** SHA-256 over everything that leaves the computer in one request, plus where it goes. */
export function hashRequest(
  destination: { host: string; providerId: string },
  body: unknown,
): string {
  return createHash('sha256').update(canonical({ destination, body })).digest('hex')
}
