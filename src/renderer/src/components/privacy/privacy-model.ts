// Pure helpers for the cloud preview and privacy screens (#433): labels, excerpt grouping and
// splitting a part's text into plain and redacted segments for highlighting.
import type {
  OutboundExcerpt,
  OutboundManifest,
  PrivacySettings,
  ProjectPrivacy,
  RedactionCategory,
  RedactionSpan,
  ReviewPolicy,
} from '@shared/schemas'
import { REDACTION_CATEGORIES } from '@shared/schemas'
import type { ProviderConfig } from '@shared/schemas'
import {
  canTreatAsLocal,
  isRemoteProvider,
  networkOption,
  providerHost,
} from '@shared/provider-network'

export const CATEGORY_LABEL: Record<RedactionCategory, string> = {
  person: 'Names',
  phone: 'Phone numbers',
  email: 'Email addresses',
  address: 'Street addresses',
}

/** Short text marker read with each highlighted value (not colour alone, NFR-3). */
export const CATEGORY_MARK: Record<RedactionCategory, string> = {
  person: 'name',
  phone: 'phone',
  email: 'email',
  address: 'address',
}

export const REVIEW_OPTIONS: { value: ReviewPolicy; label: string; hint: string }[] = [
  {
    value: 'new-excerpts',
    label: 'Ask when new plan excerpts would be sent (recommended)',
    hint: 'Asks before the first cloud request of a job, again whenever a request would send a plan excerpt you have not approved in that job, and for each new image, video or voice prompt. Names and contact details are redacted in every request.',
  },
  {
    value: 'new-content',
    label: 'Ask for any new content (strictest)',
    hint: 'Also asks whenever a request would send anything else you have not approved in that job: a new prompt, an earlier result, facility facts. Most stages of a generation ask once.',
  },
  {
    value: 'every-request',
    label: 'Ask before every request',
    hint: 'Asks before each cloud request. A full generation can make 40 or more.',
  },
  {
    value: 'per-job',
    label: 'Ask once per job',
    hint: 'Asks before the first cloud request of a job; later requests in that job go without asking.',
  },
  {
    value: 'off',
    label: 'Never ask',
    hint: 'Requests go without asking. Every send is still recorded in the project’s send log.',
  },
]

export const REVIEW_LABEL: Record<ReviewPolicy, string> = Object.fromEntries(
  REVIEW_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ReviewPolicy, string>

export const ALL_CATEGORIES: readonly RedactionCategory[] = REDACTION_CATEGORIES

/** A category is on unless the settings turn it off (redaction is on by default). */
export const categoryOn = (s: Pick<PrivacySettings, 'redact'>, c: RedactionCategory): boolean =>
  s.redact[c] !== false

/** "Names, phone numbers" or "Off". */
export function redactionSummary(s: Pick<PrivacySettings, 'redact'>): string {
  const on = ALL_CATEGORIES.filter((c) => categoryOn(s, c)).map((c) => CATEGORY_LABEL[c])
  if (!on.length) return 'Off'
  return on.map((l, i) => (i === 0 ? l : l.toLowerCase())).join(', ')
}

export interface ExcerptGroup {
  documentId: string
  documentTitle: string
  excerpts: OutboundExcerpt[]
  chars: number
}

/** Excerpts grouped by document, in first-seen order. */
export function groupExcerpts(excerpts: OutboundExcerpt[]): ExcerptGroup[] {
  const groups = new Map<string, ExcerptGroup>()
  for (const e of excerpts) {
    const g = groups.get(e.documentId) ?? {
      documentId: e.documentId,
      documentTitle: e.documentTitle,
      excerpts: [],
      chars: 0,
    }
    g.excerpts.push(e)
    g.chars += e.chars
    groups.set(e.documentId, g)
  }
  return [...groups.values()]
}

export type Segment = { text: string } | { text: string; span: RedactionSpan }

/** Split one part's sent text at its redaction spans (spans that do not fit are skipped). */
export function segmentsOf(text: string, spans: RedactionSpan[]): Segment[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  let at = 0
  for (const span of sorted) {
    if (span.start < at || span.end > text.length || span.end <= span.start) continue
    if (span.start > at) out.push({ text: text.slice(at, span.start) })
    out.push({ text: text.slice(span.start, span.end), span })
    at = span.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

export const spansFor = (m: Pick<OutboundManifest, 'spans'>, part: string): RedactionSpan[] =>
  m.spans.filter((s) => s.part === part)

export const excerptPart = (e: Pick<OutboundExcerpt, 'chunkId'>): string => `excerpt:${e.chunkId}`

export const PART_LABEL: Record<string, string> = {
  system: 'Instructions',
  cacheableContext: 'Reference context',
}

/** "Instructions", "Message 2 (assistant)" or the part name as given. */
export function partLabel(name: string): string {
  if (PART_LABEL[name]) return PART_LABEL[name]
  const msg = /^messages?[.:[]?(\d+)\]?(?:[.:](\w+))?$/.exec(name)
  if (msg) return `Message ${Number(msg[1]) + 1}${msg[2] ? ` (${msg[2]})` : ''}`
  return name
}

export const formatCount = (n: number): string => n.toLocaleString()

export function totalRedactions(m: Pick<OutboundManifest, 'redactions'>): number {
  return Object.values(m.redactions).reduce((a, b) => a + (b ?? 0), 0)
}

/** "Draft · stage msel · item R12" */
export function taskLine(m: Pick<OutboundManifest, 'task' | 'stage' | 'itemId'>): string {
  return [`Task: ${m.task}`, m.stage ? `stage ${m.stage}` : '', m.itemId ? `item ${m.itemId}` : '']
    .filter(Boolean)
    .join(' · ')
}

/** What a project setting resolves to, given the global default. */
export function effectiveOf(global: PrivacySettings, project?: ProjectPrivacy): PrivacySettings {
  return {
    review: project?.review ?? global.review,
    redact: { ...global.redact, ...(project?.redact ?? {}) },
    alwaysRedact: project?.alwaysRedact ?? global.alwaysRedact,
    neverRedact: project?.neverRedact ?? global.neverRedact,
    neverSend: project?.neverSend ?? global.neverSend,
  }
}

/** Add a term to a list (trimmed, case-insensitive de-duplicated); null when invalid. */
export function addTerm(list: string[], raw: string): string[] | null {
  const term = raw.trim()
  if (term.length < 2 || term.length > 200) return null
  if (list.some((t) => t.toLowerCase() === term.toLowerCase())) return list
  return [...list, term]
}

// ---- provider markers (FR-17) ----

export type MarkerConfig = Pick<ProviderConfig, 'kind' | 'baseUrl' | 'options'>

/** The marker text for a provider, or null for one that runs on this computer. */
export function cloudMarkerText(config: MarkerConfig): string | null {
  if (isRemoteProvider(config)) {
    const host = providerHost(config)
    return host ? `Cloud: sends excerpts to ${host}` : 'Cloud: sends excerpts off this computer'
  }
  if (networkOption(config) === 'local' && canTreatAsLocal(config))
    return 'On your network, treated as local'
  return null
}

/** The ids with `id` added or removed. */
export function toggleId(ids: readonly string[], id: string, on: boolean): string[] {
  const rest = ids.filter((x) => x !== id)
  return on ? [...rest, id] : rest
}
