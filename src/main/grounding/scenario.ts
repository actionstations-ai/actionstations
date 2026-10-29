// Grounding a scenario (#423, FR-1/FR-6): one result per MSEL row, inject, overview section and
// idea, keyed by item ("row:I-07", "inject:<id>", "overview:<n>", "idea:<id>"). A result is
// reused while its fingerprint (claim text, citations, the resolved passages' text, checker
// version) is unchanged; otherwise it is recomputed, so a stale result is never shown as current.
// The user's override and the model's verdict stay while the fingerprint does.
import { createHash } from 'node:crypto'
import {
  GROUNDING_REVIEW,
  GROUNDING_UNSUPPORTED,
  effectiveLabel,
  groundingKey,
  type Citation,
  type GroundingResult,
  type Inject,
  type LintWarning,
  type Scenario,
  type ScenarioGrounding,
  type ScenarioIdea,
} from '@shared/schemas'
import type { EmbeddingProvider } from '../providers/types'
import { splitClaims } from './claims'
import { GROUNDING_VERSION } from './constants'
import { labelClaims, sectionName, type LabelOutput } from './label'
import { collapseSpace, phraseKey } from './normalize'
import { PassageResolver, passageHash, type GroundingIndex } from './resolve'
import { preparePassage, type FactKeys, type Passage } from './support'

const CONTROL_TAGS = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])

export interface GroundingContext {
  index: GroundingIndex
  /** Facility facts and the scenario's role names, as phrase keys. */
  facts: FactKeys
  /** Role abbreviations and keys: the claim's subjects, not terms a plan must state. */
  ignore: string[]
  /** Similarity is computed with this embedder, never with the hash embedder (FR-3.4). */
  embedder?: EmbeddingProvider
  now: () => string
}

/** One item to ground: its claim, the citations it rests on, and how to label it. */
export interface GroundingItem {
  key: string
  kind: 'row' | 'inject' | 'overview' | 'idea'
  claimText: string
  referenceText?: string
  citations: Citation[]
  /** STARTEX / ENDEX / TIME_JUMP rows make no plan claim. */
  control?: boolean
}

/** Facts for the checker: facility fact entries and role names as phrase keys. */
export function factKeys(entries: string[], roles: { name: string }[] = []): FactKeys {
  return new Set([...entries, ...roles.map((r) => r.name)].map(phraseKey).filter(Boolean))
}

/** Role abbreviations and keys of the scenario's players ("IT", "WQ", "ops"). */
export function roleIgnores(roles: { id: string; abbreviation?: string }[]): string[] {
  return roles.flatMap((r) => [r.id, r.abbreviation ?? '']).filter(Boolean)
}

export function scenarioItems(s: Scenario, injects: Inject[]): GroundingItem[] {
  const rows = new Map(s.msel.map((r) => [r.id, r]))
  return [
    ...s.msel.map((r): GroundingItem => ({
      key: groundingKey.row(r.id),
      kind: 'row',
      claimText: r.expectedAction,
      referenceText: r.event,
      citations: r.citations,
      control: CONTROL_TAGS.has(r.purposeTag),
    })),
    ...injects.map((i): GroundingItem => {
      const row = rows.get(i.mselRowId)
      return {
        key: groundingKey.inject(i.id),
        kind: 'inject',
        claimText: i.instructorNote ?? '',
        citations: i.citations.length ? i.citations : (row?.citations ?? []),
        control: !!row && CONTROL_TAGS.has(row.purposeTag),
      }
    }),
    ...(s.overview?.coreSectionsTested ?? []).map((c, n): GroundingItem => ({
      key: groundingKey.overview(n),
      kind: 'overview',
      claimText: c.quote ?? c.headingPath,
      citations: [c],
    })),
  ]
}

export function ideaItems(ideas: ScenarioIdea[]): GroundingItem[] {
  return ideas.map((i) => ({
    key: groundingKey.idea(i.id),
    kind: 'idea',
    claimText: i.whyItTeaches,
    citations: i.sectionsExercised,
  }))
}

interface Resolved {
  item: GroundingItem
  passages: Passage[]
  fingerprint: string
}

function fingerprintOf(item: GroundingItem, resolved: (Passage | undefined)[]): string {
  const text = JSON.stringify([
    item.kind,
    collapseSpace(item.claimText),
    collapseSpace(item.referenceText ?? ''),
    !!item.control,
    item.citations.map((c, i) => {
      const p = resolved[i]
      return [c.documentId, c.chunkId ?? null, p ? [p.chunkId, passageHash(p)] : null]
    }),
  ])
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function resolveItem(item: GroundingItem, resolver: PassageResolver): Resolved {
  const each = item.citations.map((c) => resolver.resolve(c))
  const seen = new Set<number>()
  const passages = each.filter((p): p is Passage => {
    if (!p || seen.has(p.chunkId)) return false
    seen.add(p.chunkId)
    return true
  })
  return { item, passages, fingerprint: fingerprintOf(item, each) }
}

/** An overview "section tested" claims the section exists and says what its quote says. */
function labelOverview(r: Resolved): LabelOutput {
  const c = r.item.citations[0]
  const p = r.passages[0]
  if (!c || !p)
    return {
      label: 'unsupported',
      reason:
        'The cited section is no longer in the index (the document was removed or imported again).',
      claims: [],
    }
  const quote = collapseSpace(c.quote ?? '').replace(/…$/, '')
  const fits = !quote || collapseSpace(p.text).includes(quote.slice(0, 120))
  return {
    label: fits ? 'grounded' : 'review',
    reason: fits
      ? `${sectionName(p.headingPath)} is in the index as cited.`
      : `The quote shown for this section is not in ${sectionName(p.headingPath)}.`,
    claims: [
      {
        text: c.headingPath,
        chunkId: p.chunkId,
        headingPath: p.headingPath,
        overlap: fits ? 1 : 0,
        matched: [],
        missing: [],
        conflicting: [],
      },
    ],
  }
}

const cosine = (a: Float32Array, b: Float32Array): number => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/**
 * FR-3.4: similarity of every claim sentence to every passage it cites, in one embed batch.
 * Skipped (undefined) with the hash embedder or when embedding fails.
 */
export async function similarities(
  items: Resolved[],
  embedder: EmbeddingProvider | undefined,
): Promise<Map<string, Map<string, Map<number, number>>> | undefined> {
  if (!embedder || embedder.id === 'hash') return undefined
  const sentences = new Set<string>()
  const chunks = new Map<number, string>()
  for (const r of items) {
    if (r.item.kind === 'overview') continue
    for (const s of splitClaims(r.item.claimText)) sentences.add(s)
    for (const p of r.passages) chunks.set(p.chunkId, p.text)
  }
  if (!sentences.size || !chunks.size) return undefined
  const texts = [...sentences, ...chunks.values()]
  const vectors = await embedder.embed(texts).catch(() => undefined)
  if (!vectors || vectors.length !== texts.length) return undefined
  const vecOf = new Map(texts.map((t, i) => [t, vectors[i]!]))
  const chunkVec = new Map([...chunks].map(([id, t]) => [id, vecOf.get(t)!]))
  const out = new Map<string, Map<string, Map<number, number>>>()
  for (const r of items) {
    const perSentence = new Map<string, Map<number, number>>()
    for (const s of splitClaims(r.item.claimText))
      perSentence.set(
        s,
        new Map(
          r.passages.map((p) => [p.chunkId, cosine(vecOf.get(s)!, chunkVec.get(p.chunkId)!)]),
        ),
      )
    out.set(r.item.key, perSentence)
  }
  return out
}

function compute(
  r: Resolved,
  ctx: GroundingContext,
  sim: Map<string, Map<number, number>> | undefined,
): LabelOutput {
  if (r.item.control)
    return { label: 'none', reason: 'No claim about the plans to check.', claims: [] }
  if (r.item.kind === 'overview') return labelOverview(r)
  return labelClaims({
    claimText: r.item.claimText,
    ...(r.item.referenceText ? { referenceText: r.item.referenceText } : {}),
    citations: r.item.citations,
    passages: r.passages.map(preparePassage),
    facts: ctx.facts,
    ...(sim ? { similarity: sim } : {}),
    anchorOptions: { ignore: ctx.ignore },
  })
}

/**
 * Results for the items, reusing every stored result whose fingerprint and version still hold.
 * Results of items that no longer exist are dropped.
 */
export async function groundItems(
  items: GroundingItem[],
  stored: Record<string, GroundingResult>,
  ctx: GroundingContext,
): Promise<Record<string, GroundingResult>> {
  const resolver = new PassageResolver(ctx.index)
  const resolved = items.map((item) => resolveItem(item, resolver))
  const stale = resolved.filter((r) => {
    const old = stored[r.item.key]
    return !old || old.fingerprint !== r.fingerprint || old.version !== GROUNDING_VERSION
  })
  const sims = await similarities(stale, ctx.embedder)
  const staleKeys = new Set(stale.map((r) => r.item.key))
  const out: Record<string, GroundingResult> = {}
  for (const r of resolved) {
    const old = stored[r.item.key]
    if (!staleKeys.has(r.item.key) && old) {
      out[r.item.key] = old
      continue
    }
    const fresh = compute(r, ctx, sims?.get(r.item.key))
    const same = old?.fingerprint === r.fingerprint
    out[r.item.key] = {
      ...fresh,
      fingerprint: r.fingerprint,
      at: ctx.now(),
      version: GROUNDING_VERSION,
      ...(same && old?.model ? { model: old.model } : {}),
      ...(same && old?.override ? { override: old.override } : {}),
    }
  }
  return out
}

/** The scenario's grounding, recomputing stale items only (FR-6). */
export async function groundScenario(
  s: Scenario,
  injects: Inject[],
  ctx: GroundingContext,
): Promise<ScenarioGrounding> {
  const items = await groundItems(scenarioItems(s, injects), s.grounding?.items ?? {}, ctx)
  return { ...(s.grounding ?? {}), items }
}

export interface LabelCounts {
  grounded: number
  review: number
  unsupported: number
}

export function labelCounts(items: Record<string, GroundingResult>): LabelCounts {
  const counts: LabelCounts = { grounded: 0, review: 0, unsupported: 0 }
  for (const r of Object.values(items)) {
    const label = effectiveLabel(r)
    if (label !== 'none') counts[label] += 1
  }
  return counts
}

/** "41 grounded · 6 to review · 2 unsupported" (FR-9). */
export function countsLine(c: LabelCounts): string {
  return `${c.grounded} grounded · ${c.review} to review · ${c.unsupported} unsupported`
}

/**
 * FR-9: one warning per unsupported item and one info per item to review, for the checks.
 * Overview sections are listed under the overview's row id.
 */
export function groundingWarnings(s: Scenario, overviewRow = 'overview'): LintWarning[] {
  const items = s.grounding?.items ?? {}
  const rows = new Set(s.msel.map((r) => r.id))
  const out: LintWarning[] = []
  for (const [key, r] of Object.entries(items)) {
    const label = effectiveLabel(r)
    if (label !== 'unsupported' && label !== 'review') continue
    const [kind, id = ''] = splitKey(key)
    if (kind === 'idea' || (kind === 'row' && !rows.has(id))) continue
    const where =
      kind === 'row' ? { rowId: id } : kind === 'inject' ? { injectId: id } : { rowId: overviewRow }
    const what = kind === 'row' ? `Row ${id}` : kind === 'inject' ? 'Inject' : 'Overview section'
    out.push({
      code: label === 'unsupported' ? GROUNDING_UNSUPPORTED : GROUNDING_REVIEW,
      severity: label === 'unsupported' ? 'warning' : 'info',
      message: `${what}: ${r.override?.note ? `${r.reason} Note: ${r.override.note}` : r.reason}`,
      source: 'lint',
      ...where,
    })
  }
  return out
}

function splitKey(key: string): [string, string | undefined] {
  const at = key.indexOf(':')
  return at < 0 ? [key, undefined] : [key.slice(0, at), key.slice(at + 1)]
}
