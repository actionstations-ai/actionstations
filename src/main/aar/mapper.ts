// Map the aar stage's output onto aar.json (#419, FR-4, FR-8): evidence refs are checked
// against the record and a finding left without evidence is dropped (the record, not the model,
// decides what counts); citation keys resolve to retrieved sections ("C3") or sections the
// scenario already cites ("S2"), other keys are dropped; role keys become role ids; and what a
// person decided in the previous draft (confirmed ratings, locked findings and actions, typed
// owners and dates) is carried over by capability and normalized text.
import { isCoreCapability, type CoreCapabilityId } from '@shared/core-capabilities'
import {
  AAR_LIMITS,
  recordRefs,
  type Aar,
  type CapabilityAnalysis,
  type CorrectiveAction,
  type ExerciseRecord,
  type Finding,
  type ObservationCounts,
} from '@shared/schemas/aar'
import type { Citation } from '@shared/schemas/common'
import type { AarOutput } from '@shared/schemas/generation'
import type { Scenario } from '@shared/schemas/scenario'
import { resolveToRoles } from '../generate/mappers'
import { resolveCitations, type RetrievedChunk } from '../generate/retrieval'

export const AAR_UNSUPPORTED_FINDING = 'AAR_UNSUPPORTED_FINDING'
export const CITATION_DROPPED = 'CITATION_DROPPED'

export interface ScenarioCitation {
  /** Key shown in the prompt, "S3". */
  key: string
  citation: Citation
}

const citationId = (c: Citation): string => `${c.documentId}|${c.headingPath}|${c.page ?? ''}`

/** Sections the scenario already cites (overview, MSEL rows, EEG tasks), keyed S1…Sn. */
export function scenarioCitations(s: Scenario): ScenarioCitation[] {
  const all: Citation[] = [
    ...(s.overview?.coreSectionsTested ?? []),
    ...(s.evaluation?.eegs ?? []).flatMap((e) => e.criticalTasks.map((t) => t.citation)),
    ...s.msel.flatMap((r) => r.citations),
  ]
  const seen = new Set<string>()
  const out: ScenarioCitation[] = []
  for (const c of all) {
    const id = citationId(c)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ key: `S${out.length + 1}`, citation: c })
  }
  return out
}

export interface ApplyContext {
  scenario: Scenario
  record: ExerciseRecord
  retrieved: RetrievedChunk[]
  scenarioCitations: ScenarioCitation[]
  previous: Aar | null
  newId: () => string
}

export interface ApplyResult {
  capabilities: CapabilityAnalysis[]
  /** Findings dropped because none of their evidence refs exist in the record. */
  unsupported: { capability: string; title: string }[]
  /** Evidence refs the model wrote that the record does not have. */
  unknownRefs: string[]
  /** Citation keys the prompt never showed. */
  droppedCitations: string[]
  unknownRoles: string[]
  unknownCapabilities: string[]
  keptLocked: number
  keptRatings: number
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')
const clip = (s: string | undefined, max: number): string => (s ?? '').trim().slice(0, max)

type OutCapability = AarOutput['capabilities'][number]
type OutFinding = OutCapability['strengths'][number]
type OutArea = OutCapability['areasForImprovement'][number]

/** Observations per rating on the capability's critical tasks. */
export function observationCounts(
  record: ExerciseRecord,
  scenario: Scenario,
  capability: CoreCapabilityId,
): ObservationCounts {
  const taskIds = new Set(
    (scenario.evaluation?.eegs ?? [])
      .filter((e) => e.capability === capability)
      .flatMap((e) => e.criticalTasks.map((t) => t.id)),
  )
  const counts: ObservationCounts = { met: 0, partial: 0, not_met: 0, not_observed: 0 }
  for (const o of record.observations) if (o.taskId && taskIds.has(o.taskId)) counts[o.rating]++
  return counts
}

const total = (c: ObservationCounts): number => c.met + c.partial + c.not_met + c.not_observed

function resolveAarCitations(
  keys: string[],
  ctx: ApplyContext,
  result: ApplyResult,
): Citation[] {
  const scenarioKeys = keys.filter((k) => /^S\d+$/i.test(k.trim()))
  const retrievedKeys = keys.filter((k) => !/^S\d+$/i.test(k.trim()))
  const { citations, dropped } = resolveCitations(retrievedKeys, ctx.retrieved)
  result.droppedCitations.push(...dropped)
  const byKey = new Map(ctx.scenarioCitations.map((c) => [c.key, c.citation]))
  const seen = new Set(citations.map(citationId))
  for (const raw of scenarioKeys) {
    const c = byKey.get(raw.trim().toUpperCase())
    if (!c) result.droppedCitations.push(raw)
    else if (!seen.has(citationId(c))) {
      seen.add(citationId(c))
      citations.push(c)
    }
  }
  return citations.slice(0, AAR_LIMITS.citationsPerFinding)
}

function mapAction(
  a: OutArea['correctiveActions'][number],
  ctx: ApplyContext,
  result: ApplyResult,
): CorrectiveAction | undefined {
  const action = clip(a.action, AAR_LIMITS.action)
  if (!action) return undefined
  let ownerRole: string | undefined
  if (a.ownerRole?.trim()) {
    const role = resolveToRoles([a.ownerRole], ctx.scenario.roles)
    ownerRole = role.ids.length === 1 ? role.ids[0] : undefined
    if (!ownerRole) result.unknownRoles.push(a.ownerRole)
  }
  return {
    id: ctx.newId(),
    action,
    element: a.element,
    ...(ownerRole ? { ownerRole } : {}),
    ownerOrganization: '',
    poc: '',
    status: 'open',
    locked: false,
  }
}

function mapFinding(
  f: OutFinding | OutArea,
  capability: string,
  objectiveRefs: string[],
  ctx: ApplyContext,
  result: ApplyResult,
  refs: Set<string>,
): Finding | undefined {
  const evidence: string[] = []
  for (const raw of f.evidence) {
    const ref = raw.trim().replace(/^\[|\]$/g, '')
    if (refs.has(ref)) {
      if (!evidence.includes(ref)) evidence.push(ref)
    } else result.unknownRefs.push(raw)
  }
  const title = clip(f.title, AAR_LIMITS.title) || 'Untitled finding'
  if (!evidence.length) {
    result.unsupported.push({ capability, title })
    return undefined
  }
  const area = 'recommendation' in f ? f : undefined
  const actions = (area?.correctiveActions ?? [])
    .map((a) => mapAction(a, ctx, result))
    .filter((a): a is CorrectiveAction => !!a)
    .slice(0, AAR_LIMITS.actionsPerFinding)
  return {
    id: ctx.newId(),
    title,
    analysisMd: clip(f.analysisMd, AAR_LIMITS.analysis),
    citations: resolveAarCitations(f.citations, ctx, result),
    evidence: evidence.slice(0, AAR_LIMITS.evidencePerFinding),
    objectiveRefs,
    recommendation: clip(area?.recommendation, AAR_LIMITS.recommendation),
    correctiveActions: actions,
    locked: false,
  }
}

/** Carry a person's typed fields and locks from a previous action onto its fresh counterpart. */
function keepActionFields(fresh: CorrectiveAction, prev: CorrectiveAction): CorrectiveAction {
  if (prev.locked) return prev
  return {
    ...fresh,
    ownerOrganization: prev.ownerOrganization,
    poc: prev.poc,
    ...(prev.startDate ? { startDate: prev.startDate } : {}),
    ...(prev.dueDate ? { dueDate: prev.dueDate } : {}),
    status: prev.status,
  }
}

/** Fresh actions with the previous finding's typed fields and its locked actions kept. */
function mergeActions(fresh: CorrectiveAction[], prev: Finding, result: ApplyResult) {
  const out = fresh.map((a) => {
    const p = prev.correctiveActions.find((x) => norm(x.action) === norm(a.action))
    return p ? keepActionFields(a, p) : a
  })
  for (const p of prev.correctiveActions) {
    if (!p.locked || out.some((a) => norm(a.action) === norm(p.action))) continue
    out.push(p)
    result.keptLocked++
  }
  return out
}

/** Fresh findings with the previous draft's locked findings kept (replaced or appended). */
function mergeFindings(fresh: Finding[], previous: Finding[], result: ApplyResult): Finding[] {
  const out = fresh.map((f) => {
    const prev = previous.find((p) => norm(p.title) === norm(f.title))
    if (!prev) return f
    if (prev.locked) {
      result.keptLocked++
      return prev
    }
    return { ...f, correctiveActions: mergeActions(f.correctiveActions, prev, result) }
  })
  for (const p of previous) {
    if (!p.locked || out.some((f) => norm(f.title) === norm(p.title))) continue
    out.push(p)
    result.keptLocked++
  }
  return out.slice(0, AAR_LIMITS.findingsPerCapability)
}

/** Proposed rating only where the record holds something for the capability (FR-4). */
function proposedRating(
  c: OutCapability,
  counts: ObservationCounts,
  findings: number,
): Pick<CapabilityAnalysis, 'proposedRating' | 'ratingRationale'> {
  const rationale = clip(c.ratingRationale, AAR_LIMITS.rationale)
  if (c.proposedRating && (total(counts) > 0 || findings > 0))
    return { proposedRating: c.proposedRating, ratingRationale: rationale }
  return {
    ratingRationale:
      rationale || 'Not enough evidence: no observation or note covers this capability.',
  }
}

function mapCapability(
  c: OutCapability,
  ctx: ApplyContext,
  result: ApplyResult,
  refs: Set<string>,
): CapabilityAnalysis {
  const capability = c.capability
  const objectiveRefs = (ctx.scenario.evaluation?.objectiveCapabilities ?? [])
    .filter((p) => p.capability === capability)
    .map((p) => p.objectiveId)
  const prev = ctx.previous?.capabilities.find((p) => p.capability === capability)
  const map = (list: (OutFinding | OutArea)[]) =>
    list
      .map((f) => mapFinding(f, capability, objectiveRefs, ctx, result, refs))
      .filter((f): f is Finding => !!f)
  const strengths = mergeFindings(map(c.strengths), prev?.strengths ?? [], result)
  const areas = mergeFindings(map(c.areasForImprovement), prev?.areasForImprovement ?? [], result)
  const counts = observationCounts(ctx.record, ctx.scenario, capability)
  if (prev?.rating) result.keptRatings++
  return {
    capability,
    ...(prev?.rating ? { rating: prev.rating } : {}),
    ...proposedRating(c, counts, strengths.length + areas.length),
    observationCounts: counts,
    objectiveRefs,
    strengths,
    areasForImprovement: areas,
  }
}

/** Previous capabilities the model dropped but a person had decided on: kept as they were. */
function decidedLeftovers(ctx: ApplyContext, mapped: CapabilityAnalysis[]): CapabilityAnalysis[] {
  const have = new Set(mapped.map((c) => c.capability))
  return (ctx.previous?.capabilities ?? []).filter(
    (c) =>
      !have.has(c.capability) &&
      (c.rating ||
        c.strengths.some((f) => f.locked) ||
        c.areasForImprovement.some((f) => f.locked)),
  )
}

export function applyAar(out: AarOutput, ctx: ApplyContext): ApplyResult {
  const result: ApplyResult = {
    capabilities: [],
    unsupported: [],
    unknownRefs: [],
    droppedCitations: [],
    unknownRoles: [],
    unknownCapabilities: [],
    keptLocked: 0,
    keptRatings: 0,
  }
  const refs = recordRefs(ctx.record)
  const seen = new Set<string>()
  for (const c of out.capabilities) {
    if (!isCoreCapability(c.capability)) {
      result.unknownCapabilities.push(c.capability)
      continue
    }
    if (seen.has(c.capability)) continue
    seen.add(c.capability)
    result.capabilities.push(mapCapability(c, ctx, result, refs))
  }
  result.capabilities.push(...decidedLeftovers(ctx, result.capabilities))
  result.capabilities = result.capabilities.slice(0, AAR_LIMITS.capabilities)
  return result
}
