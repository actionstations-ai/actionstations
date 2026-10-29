// Compliance coverage (#426, spec 0426 FR-13/FR-14): for each enabled framework, which controls
// the exercise planned, delivered and observed, with the evidence; and every regulatory clock
// with its deadline, filing and result. Pure: the export, the AAR draft (#419) and any preview
// build it from the same inputs.
import type { ThreatFamilyId } from '../domains/schema'
import {
  NOT_LEGAL_ADVICE,
  REGULATION_STATUS_LABEL,
  regulationLabel,
  splitControlRef,
  type ComplianceSession,
  type Control,
  type Framework,
  type Regulation,
} from '../schemas/compliance'
import type { MselRow } from '../schemas/scenario'
import { CLOCK_STATUS_LABEL, clockViews, type ClockStatus } from './clock'
import { suggestControls } from './rules'
import { formatLocal, scenarioAt, type StartSource } from './scenario-time'

/** Evidence levels, weakest first (FR-13). */
export const EVIDENCE_LEVELS = ['none', 'planned', 'delivered', 'observed'] as const
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number]

export interface CoverageControlRow {
  controlId: string
  /** Ancestor titles, top first ("Respond", "Incident Response Reporting and Communication"). */
  path: string[]
  title: string
  /** MSEL rows mapped to the control (accepted, or suggested by a rule). */
  rowIds: string[]
  /** Whether every mapping came from a rule the user has not accepted yet. */
  suggestedOnly: boolean
  evidence: EvidenceLevel
  references: string[]
  /** Missed or overdue clocks of regulations that list the control (shown as gaps). */
  gaps: string[]
}

export interface CoverageFramework {
  id: string
  label: string
  shortLabel: string
  version: string
  levels: string[]
  rows: CoverageControlRow[]
  /** Leaf controls with no row in a category where some other control has one. */
  gapCount: number
}

export interface CoverageClock {
  /** Cite key for the AAR draft (FR-15): K1, K2… */
  cite: string
  key: string
  regulation: string
  status: string
  clock: string
  recipient: string
  triggeredAt?: string
  dueAt?: string
  filedAt?: string
  result: ClockStatus
  resultLabel: string
  note: string
}

export interface CoverageReport {
  scenarioTitle: string
  startSource: StartSource
  frameworks: CoverageFramework[]
  clocks: CoverageClock[]
  disclaimer: string
}

export interface CoverageInput {
  scenarioTitle: string
  msel: readonly MselRow[]
  threatFamily?: ThreatFamilyId | undefined
  frameworks: readonly Framework[]
  regulations: readonly Regulation[]
  session: ComplianceSession
  start: { at: Date; source: StartSource }
  /** Exercise minutes "now" (the facilitator clock) for clock results. */
  nowMin: number
  delivered: Readonly<Record<string, { exerciseTime: string }>>
  notes: Readonly<Record<string, string>>
  /** Row ids an evaluator observation names. */
  observedRows: ReadonlySet<string>
}

const rank = (e: EvidenceLevel): number => EVIDENCE_LEVELS.indexOf(e)
const atLeast = (a: EvidenceLevel, b: EvidenceLevel): EvidenceLevel => (rank(a) >= rank(b) ? a : b)

function ancestry(c: Control, byId: Map<string, Control>): string[] {
  const out: string[] = []
  for (let p = c.parent; p !== undefined; p = byId.get(p)?.parent) {
    const parent = byId.get(p)
    if (!parent) break
    out.unshift(parent.title)
  }
  return out
}

/** Controls with no children: the rows of the matrix. */
function leaves(f: Framework): Control[] {
  const parents = new Set(f.controls.map((c) => c.parent).filter(Boolean))
  return f.controls.filter((c) => !parents.has(c.id))
}

/** Row ids per control ref, and whether each mapping was accepted. */
function mappings(input: CoverageInput, f: Framework): Map<string, Map<string, boolean>> {
  const out = new Map<string, Map<string, boolean>>()
  const add = (ref: string, rowId: string, accepted: boolean) => {
    const m = out.get(ref) ?? new Map<string, boolean>()
    m.set(rowId, (m.get(rowId) ?? false) || accepted)
    out.set(ref, m)
  }
  for (const row of input.msel) {
    for (const ref of row.controls ?? []) if (ref.startsWith(`${f.id}:`)) add(ref, row.id, true)
    const suggested = [
      ...suggestControls(f, row, { threatFamily: input.threatFamily }),
      ...(row.controlSuggestions ?? []).map((s) => s.ref).filter((r) => r.startsWith(`${f.id}:`)),
    ]
    for (const ref of suggested) add(ref, row.id, false)
  }
  return out
}

interface ClockFacts {
  views: CoverageClock[]
  /** Control ref → met clock labels / missed clock labels. */
  met: Map<string, string[]>
  missed: Map<string, string[]>
}

function clockFacts(input: CoverageInput): ClockFacts {
  const views: CoverageClock[] = []
  const met = new Map<string, string[]>()
  const missed = new Map<string, string[]>()
  const push = (m: Map<string, string[]>, refs: string[], label: string) => {
    for (const r of refs) m.set(r, [...(m.get(r) ?? []), label])
  }
  for (const reg of input.regulations) {
    const fired = input.session.fired.filter((f) => f.regulationId === reg.id)
    for (const v of clockViews(reg, input.session, input.start.at, input.nowMin)) {
      const clock = reg.clocks.find((c) => c.id === v.clockId)!
      const anchorTrigger = clock.dueAt
        .map((t) => fired.find((f) => f.triggerId === t.from))
        .find(Boolean)
      const label = `${regulationLabel(reg)}: ${v.label}`
      if (v.status === 'met') push(met, reg.controls, label)
      if (v.status === 'missed' || v.status === 'overdue') push(missed, reg.controls, label)
      views.push({
        cite: `K${views.length + 1}`,
        key: v.key,
        regulation: regulationLabel(reg),
        status: REGULATION_STATUS_LABEL[reg.status],
        clock: v.label,
        recipient: v.recipient,
        ...(anchorTrigger ? { triggeredAt: anchorTrigger.scenarioAt } : {}),
        ...(v.dueAt ? { dueAt: formatLocal(v.dueAt) } : {}),
        ...(v.completion?.atDate ? { filedAt: formatLocal(v.completion.atDate) } : {}),
        result: v.status,
        resultLabel: CLOCK_STATUS_LABEL[v.status],
        note: v.completion?.note ?? '',
      })
    }
  }
  return { views, met, missed }
}

function controlRow(
  input: CoverageInput,
  f: Framework,
  c: Control,
  byId: Map<string, Control>,
  rows: Map<string, boolean> | undefined,
  facts: ClockFacts,
): CoverageControlRow {
  const ref = `${f.id}:${c.id}`
  const rowIds = [...(rows?.keys() ?? [])]
  let evidence: EvidenceLevel = rowIds.length ? 'planned' : 'none'
  const references: string[] = []
  for (const id of rowIds) {
    const d = input.delivered[id]
    if (d) {
      evidence = atLeast(evidence, 'delivered')
      references.push(`${id} delivered ${d.exerciseTime}`)
    }
    if (input.notes[id]?.trim()) {
      evidence = atLeast(evidence, 'observed')
      references.push(`note ${id}`)
    }
    if (input.observedRows.has(id)) {
      evidence = atLeast(evidence, 'observed')
      references.push(`observation ${id}`)
    }
  }
  for (const label of facts.met.get(ref) ?? []) {
    evidence = 'observed'
    references.push(`clock met: ${label}`)
  }
  return {
    controlId: c.id,
    path: ancestry(c, byId),
    title: c.title,
    rowIds,
    suggestedOnly: rowIds.length > 0 && [...rows!.values()].every((accepted) => !accepted),
    evidence,
    references,
    gaps: (facts.missed.get(ref) ?? []).map((l) => `clock not met: ${l}`),
  }
}

function frameworkCoverage(input: CoverageInput, f: Framework, facts: ClockFacts) {
  const byId = new Map(f.controls.map((c) => [c.id, c]))
  const mapped = mappings(input, f)
  const rows = leaves(f).map((c) =>
    controlRow(input, f, c, byId, mapped.get(`${f.id}:${c.id}`), facts),
  )
  const usedParents = new Set(
    rows.filter((r) => r.rowIds.length).map((r) => byId.get(r.controlId)?.parent),
  )
  const gapCount = rows.filter(
    (r) => !r.rowIds.length && usedParents.has(byId.get(r.controlId)?.parent),
  ).length
  return {
    id: f.id,
    label: f.label,
    shortLabel: f.shortLabel ?? f.label,
    version: f.version,
    levels: f.levels,
    rows,
    gapCount,
  }
}

export function buildCoverage(input: CoverageInput): CoverageReport {
  const facts = clockFacts(input)
  return {
    scenarioTitle: input.scenarioTitle,
    startSource: input.start.source,
    frameworks: input.frameworks.map((f) => frameworkCoverage(input, f, facts)),
    clocks: facts.views,
    disclaimer: NOT_LEGAL_ADVICE,
  }
}

/** "<frameworkId>:<controlId>" → a short label for chips and cites. */
export function controlLabel(ref: string, frameworks: readonly Framework[]): string {
  const { frameworkId, controlId } = splitControlRef(ref)
  const c = frameworks.find((f) => f.id === frameworkId)?.controls.find((x) => x.id === controlId)
  return c ? `${controlId} ${c.title}` : ref
}

/** Scenario date-time at exercise minute `min`, as stored ("2026-03-12T10:40"). */
export const scenarioStamp = (start: Date, min: number): string =>
  formatLocal(scenarioAt(start, min))
