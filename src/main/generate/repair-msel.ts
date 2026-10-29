// Repair the MSEL of a finished scenario in place (generate:repair): the structural repairs and
// lints the pipeline now runs (#164, #167, #174, #182) applied to what is saved, without
// regenerating it. Code repairs first (exact repeats, ENDEX order, rows re-timed into their
// phase, recipient labels, a phase over the density limit trimmed); then one
// model call per phase that still lacks an inject-mix tag; then the revision pass for the rows
// still flagged, and nothing else. Unflagged rows are never rewritten. The role cap (#174) is
// not applied: on a finished scenario the handbook, briefing and rubric already use every
// role, so a role over the audience count is left for the designer. The summary names every
// row whose text changed, so only their injects are regenerated (repair.ts).
import {
  exerciseMinutes,
  type Inject,
  type LintWarning,
  type MselPhaseOutput,
  type MselRow,
  type Phase,
  type Scenario,
  type StageRun,
} from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { nowIso } from '../lib/ids'
import { pipelineDeps } from './deps'
import type { DomainContext } from './domain'
import {
  OVERVIEW_ROW,
  PIPELINE_WARNINGS,
  ROLE_KEY_UNKNOWN,
  call,
  ensureSeams,
  mselVars,
  openEnv,
  reportMapping,
  reportStructure,
  reviseFromCritique,
  reviseStructureAgain,
  pruneRubricLinks,
  structuralIssues,
  writeDoc,
  type Env,
  type StepInput,
} from './engine'
import { markStaleCritique } from './critique-notes'
import { FACILITY_UNKNOWN_ID, lintFacilityIds } from './facility'
import { describeStaleInjects, markInjectsStale } from './inject-stale'
import {
  DENSITY_MIN_MINUTES,
  lintScenario,
  overfillRows,
  phaseMixGaps,
  rowNeeds,
  spareRows,
} from './lint'
import { applyMselPhase, resolveToRoles } from './mappers'
import { seamKeyMap, seamMixGaps } from './lint-seams'
import { applySeamRows, relinkSeamRows } from './seams'
import { repairStructure, sortMsel } from './mappers-structure'
import { renderMselMarkdown } from './docs'
import { FIELD_WARNINGS, settledFieldInjects } from './injects/store'
import { INJECT_TEXT_FAILED } from './injects/text-job'
import { listInjects } from '../scenario/store'
import { StageFailure } from './stage'
import { rowVars } from './vars'

export interface MselRepairSummary {
  /** Rows moved into their phase window or before ENDEX. */
  retimed: { rowId: string; from: string; to: string }[]
  /** Exact repeats and extra ENDEX rows dropped. */
  duplicates: string[]
  /** Rows dropped so a phase fits the density limit (one inject every 5 minutes at most). */
  trimmed: string[]
  /** Rows whose recipients were re-resolved against the roles ("as" → ASO). */
  relabeled: string[]
  /** Rows the mix call rewrote or added for a missing inject-mix tag. */
  mixed: string[]
  /** Rows the revision pass (or the facilitator-prompt fallback) rewrote. */
  revised: string[]
  /** Rows whose text (source, event, expected action, format) changed or that are new. */
  textChanged: string[]
  /** Rows no longer in the MSEL. */
  removed: string[]
}

/** The parts of a row its inject is written from. */
const textOf = (r: MselRow): string => JSON.stringify([r.from, r.event, r.expectedAction, r.format])

const isMixCode = (code: string): boolean => code.startsWith('MIX_')

/**
 * Recipient labels re-resolved against the roles: a key the current matcher resolves ("as"
 * for ASO) joins the row's roles, and junk keys of one or two letters are dropped. Rows with
 * nothing to fix are left exactly as they are.
 */
export function relabelRecipients(s: Scenario): string[] {
  const changed: string[] = []
  for (const row of s.msel) {
    if (row.locked || !row.toLabel || row.toLabel === 'All') continue
    const to = resolveToRoles(
      row.toLabel.split(',').map((k) => k.trim()),
      s.roles,
    )
    const known = new Set(row.toRoleIds)
    const added = to.ids.filter((id) => !known.has(id))
    const junk = new Set(to.unresolved.filter((k) => k.length < 3))
    if (!added.length && !junk.size) continue
    const label = to.label
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && !junk.has(k))
    if (!label.length) continue
    row.toRoleIds = [...row.toRoleIds, ...added]
    row.toLabel = label.join(', ')
    changed.push(row.id)
  }
  return changed
}

/** ROLE_KEY_UNKNOWN for every recipient key that still matches no role. */
export function recipientWarnings(s: Scenario): LintWarning[] {
  return s.msel.flatMap((row): LintWarning[] => {
    if (!row.toLabel || row.toLabel === 'All') return []
    const keys = row.toLabel.split(',').map((k) => k.trim())
    const { unresolved } = resolveToRoles(keys, s.roles)
    if (!unresolved.length) return []
    return [
      {
        code: ROLE_KEY_UNKNOWN,
        severity: 'warning',
        message: `Row ${row.id} is addressed to "${unresolved.join('", "')}", which is not a role key`,
        source: 'lint',
        rowId: row.id,
      },
    ]
  })
}

/** The most rows a phase may hold before DENSITY_HIGH (one inject every 5 minutes). */
export const densityCap = (phase: Phase): number =>
  Math.floor(
    (exerciseMinutes(phase.endTime) - exerciseMinutes(phase.startTime)) / DENSITY_MIN_MINUTES,
  )

/**
 * Rows to drop so each phase fits the density cap (overfillRows, #167). Rows the rubric links
 * are kept like locked rows: the evaluation guide scores the players on them.
 */
export function densityTrim(s: Scenario, domain: DomainContext): string[] {
  const linked = new Set(s.rubric?.metrics.flatMap((m) => m.linkedInjectIds) ?? [])
  const view = { ...s, msel: s.msel.map((r) => (linked.has(r.id) ? { ...r, locked: true } : r)) }
  const drop = new Set<string>()
  for (const phase of s.phases)
    for (const r of overfillRows(view, phase, densityCap(phase), domain)) drop.add(r.id)
  s.msel = s.msel.filter((r) => !drop.has(r.id))
  return [...drop]
}

/**
 * The deterministic part (pure apart from mutating `s`): structure, recipients and the density
 * trim. Returns what changed.
 */
export function repairMselStructure(
  s: Scenario,
  domain: DomainContext,
): Pick<MselRepairSummary, 'retimed' | 'duplicates' | 'trimmed' | 'relabeled'> {
  const fix = repairStructure(s)
  const relabeled = relabelRecipients(s)
  const trimmed = densityTrim(s, domain)
  return {
    retimed: fix.retimed,
    duplicates: [...fix.duplicates.map((d) => d.rowId), ...fix.extraEndex],
    trimmed,
    relabeled,
  }
}

const upper = (id: string): string => id.trim().toUpperCase()

/**
 * One msel_phase call for the inject-mix tags a phase lacks (MIX_* lints): spare NOISE /
 * PRESSURE rows are rewritten first, new rows are added only below the density cap. Role
 * coverage (ROLE_NO_INJECT) is left to the designer. Returns the ids written.
 */
async function fillMixGaps(env: Env, s: Scenario, phase: Phase): Promise<string[]> {
  // An untested plan seam (#427) is a need like a missing tag; code assigns a row as a last resort.
  const gaps = [
    ...phaseMixGaps(s, phase, env.domain).filter((g) => isMixCode(g.code)),
    ...seamMixGaps(s, phase),
  ]
  if (!gaps.length) return []
  const needs = rowNeeds(gaps)
  const current = s.msel.filter((r) => r.phaseId === phase.id)
  const replace = spareRows(s, phase, env.domain).slice(0, needs.length)
  const room = Math.max(0, densityCap(phase) - current.length)
  const add = Math.min(needs.length - replace.length, room)
  if (!replace.length && !add) return []
  const input: StepInput = { env, scenario: s, step: { stage: 'msel_phase', itemId: phase.id } }
  const base = mselVars(input, phase, true)
  const count = replace.length + add
  const fix = await call<MselPhaseOutput>(input, {
    ...base,
    priorRows: [...(base.priorRows as unknown[]), ...current.map((r) => rowVars(r, s.roles))],
    targetRowCount: count,
    maxRowCount: count,
    mixPass: true,
    mixGaps: needs.slice(0, count),
    mixReplaceRows: replace.map((r) => rowVars(r, s.roles)),
    mixAddCount: add,
  })
  const spares = new Map(replace.map((r) => [upper(r.id), r]))
  const existing = new Set(current.map((r) => upper(r.id)))
  const rewrites = fix.output.rows.flatMap((r) => {
    const spare = spares.get(upper(r.id))
    return spare ? [{ ...r, id: spare.id, time: spare.time }] : []
  })
  const fresh = fix.output.rows
    .filter((r) => !spares.has(upper(r.id)) && !existing.has(upper(r.id)))
    .filter((r) => !['STARTEX', 'TIME_JUMP', 'ENDEX'].includes(r.purposeTag))
    .slice(0, add + replace.length - rewrites.length)
  const rows = [...rewrites, ...fresh]
  if (!rows.length) return []
  const rewritten = new Set(rewrites.map((r) => r.id))
  const keepIds = new Set(current.map((r) => r.id).filter((id) => !rewritten.has(id)))
  const mapped = applyMselPhase(s, phase, { rows }, fix.retrieved, {
    keepIds,
    seamKeys: seamKeyMap(s),
  })
  applySeamRows(s, phase)
  const owned = new Set(mapped.rows.map((r) => r.id).filter((id) => !keepIds.has(id)))
  reportMapping(s, phase, mapped, env.ctx, owned)
  env.ctx.log(
    `repair: phase ${phase.index + 1} lacked ${gaps.map((g) => g.code).join(', ')}; wrote ${[...owned].join(', ')}`,
    'info',
    { stage: 'msel_phase', itemId: phase.id },
  )
  return [...owned]
}

async function fillAllMixGaps(env: Env, s: Scenario): Promise<string[]> {
  const written: string[] = []
  for (const phase of s.phases) {
    env.ctx.throwIfCancelled()
    try {
      written.push(...(await fillMixGaps(env, s, phase)))
    } catch (err) {
      if (!(err instanceof StageFailure)) throw err
      env.ctx.log(`repair: mix call for phase ${phase.index + 1} failed; rows kept`, 'warn', {
        stage: 'msel_phase',
        itemId: phase.id,
      })
    }
    ensureSeams(s, phase, env)
  }
  return written
}

/** What a relint learns from outside the scenario (#342). */
interface RelintEvidence {
  /** The rows the repair started from. */
  before: MselRow[]
  injects: Inject[]
  /** Injects whose field warnings go: saved by the user last, fields valid. */
  settled: Set<string>
}

/**
 * The lints recomputed; critique notes, pipeline notes and inject warnings of live rows kept,
 * except the field warnings of settled injects. Critique notes whose row or inject changed
 * since the review are marked stale.
 */
function relint(s: Scenario, env: Env, evidence: RelintEvidence): void {
  const rowIds = new Set(s.msel.map((x) => x.id))
  const live = (w: LintWarning): boolean =>
    !w.rowId || w.rowId === OVERVIEW_ROW || rowIds.has(w.rowId)
  const recomputed = new Set([ROLE_KEY_UNKNOWN, FACILITY_UNKNOWN_ID])
  // Row-level lint codes (INJECT_SCRIPTS_PLAYERS, INJECT_PLAYER_VOICE …) are recomputed;
  // only inject warnings and the injects job's row failures are carried over.
  const settled = (w: LintWarning): boolean =>
    !!w.injectId && evidence.settled.has(w.injectId) && FIELD_WARNINGS.has(w.code)
  const kept = s.warnings.filter(
    (w) =>
      live(w) &&
      !settled(w) &&
      (w.source === 'critique' ||
        !!w.injectId ||
        w.code === INJECT_TEXT_FAILED ||
        (PIPELINE_WARNINGS.has(w.code) && !recomputed.has(w.code))),
  )
  s.warnings = [
    ...kept,
    ...recipientWarnings(s),
    ...lintFacilityIds(s, env.facility),
    ...lintScenario(s, env.domain),
  ]
  markStaleCritique(s, { before: evidence.before, injects: evidence.injects })
}

function revisionRun(): StageRun {
  return {
    stage: 'critique',
    startedAt: nowIso(),
    status: 'ok',
    repairAttempts: 0,
  }
}

const CONTROL_TAGS = new Set<MselRow['purposeTag']>(['STARTEX', 'TIME_JUMP', 'ENDEX'])
const CONTROL_NOTE =
  ' This row is a control card: keep it a facilitator-narrated card of the same format that says what has changed in the world; state no player decision.'

/** The structural issues, with a note on control cards so a rewrite stays a card. */
export function flaggedIssues(s: Scenario, env: Env): ReturnType<typeof structuralIssues> {
  const control = new Set(s.msel.filter((r) => CONTROL_TAGS.has(r.purposeTag)).map((r) => r.id))
  return structuralIssues(s, env).map((i) =>
    control.has(i.rowId!) ? { ...i, suggestion: `${i.suggestion}${CONTROL_NOTE}` } : i,
  )
}

/**
 * A control card (STARTEX, TIME_JUMP, ENDEX) keeps its format and its facilitator source
 * through a revision: the deck needs the time-jump card, whatever the model returned.
 */
export function keepControlCards(s: Scenario, before: MselRow[]): string[] {
  const byId = new Map(before.map((r) => [r.id, r]))
  const fixed: string[] = []
  for (const row of s.msel) {
    const was = byId.get(row.id)
    if (!was || !CONTROL_TAGS.has(was.purposeTag)) continue
    if (row.format === was.format && row.from === was.from) continue
    row.format = was.format
    row.from = was.from
    fixed.push(row.id)
  }
  return fixed
}

/** The revision pass for the rows still flagged (structural lints, facility ids), twice at most. */
async function reviseFlagged(env: Env, s: Scenario): Promise<Set<string>> {
  const input: StepInput = { env, scenario: s, step: { stage: 'critique' } }
  const run = revisionRun()
  const issues = flaggedIssues(s, env)
  if (!issues.length) return new Set()
  env.ctx.log(
    `repair: revising ${new Set(issues.map((i) => i.rowId)).size} flagged row(s)`,
    'info',
    { stage: 'critique' },
  )
  const rewritten = await reviseFromCritique(input, issues, run)
  await reviseStructureAgain(input, run, rewritten, false)
  return rewritten
}

/**
 * A revision rewrites rows; it never removes one. A rewrite the mapper or the structural
 * repair then dropped (it repeated another row) is put back as it was before the revision, so
 * the repair cannot lose a row — least of all the DECISION_POINT.
 */
export function restoreDropped(s: Scenario, before: MselRow[], ctx: JobContext): string[] {
  const live = new Set(s.msel.map((r) => r.id))
  const lost = before.filter((r) => !live.has(r.id))
  if (!lost.length) return []
  s.msel.push(...lost)
  sortMsel(s)
  for (const r of lost)
    ctx.log(`repair: the revision dropped row ${r.id}; the original row is kept`, 'warn', {
      stage: 'critique',
    })
  return lost.map((r) => r.id)
}

/**
 * Repair the saved MSEL of `scenarioId` and save it (one history snapshot). Returns the
 * repaired scenario and what changed.
 */
export async function repairMsel(
  root: string,
  scenarioId: string,
  ctx: JobContext,
): Promise<{ scenario: Scenario; summary: MselRepairSummary }> {
  const deps = await pipelineDeps()
  const s = await deps.store.getScenario(root, scenarioId)
  const env = await openEnv(root, s, ctx)
  relinkSeamRows(s)
  const before = new Map(s.msel.map((r) => [r.id, textOf(r)]))
  const beforeRows = structuredClone(s.msel)
  ctx.progress(0.05, 'Repairing the MSEL structure', { stage: 'critique' })
  const structure = repairMselStructure(s, env.domain)
  reportStructure({ duplicates: [], extraEndex: [], retimed: structure.retimed }, ctx, {
    stage: 'critique',
  })
  for (const id of structure.trimmed)
    ctx.log(`repair: row ${id} dropped to bring its phase under the density limit`, 'warn')
  ctx.progress(0.15, 'Completing the inject mix', { stage: 'msel_phase' })
  const mixed = await fillAllMixGaps(env, s)
  repairStructure(s)
  ctx.progress(0.3, 'Revising flagged rows', { stage: 'critique' })
  const beforeRevision = structuredClone(s.msel)
  const rewritten = await reviseFlagged(env, s)
  restoreDropped(s, beforeRevision, ctx)
  for (const id of keepControlCards(s, beforeRevision))
    ctx.log(`repair: row ${id} kept its control-card format and source`, 'info', {
      stage: 'critique',
    })
  pruneRubricLinks(s, ctx)
  const injects = await listInjects(root, scenarioId)
  const settled = await settledFieldInjects(root, injects, s.warnings)
  relint(s, env, { before: beforeRows, injects, settled })
  const after = new Map(s.msel.map((r) => [r.id, textOf(r)]))
  const textChanged = [...after].filter(([id, t]) => before.get(id) !== t).map(([id]) => id)
  const removed = [...before.keys()].filter((id) => !after.has(id))
  const revised = [...after.keys()].filter(
    (id) => rewritten.has(id) || (before.get(id) !== after.get(id) && !mixed.includes(id)),
  )
  const summary: MselRepairSummary = { ...structure, mixed, revised, textChanged, removed }
  const staleNote = describeStaleInjects(markInjectsStale(beforeRows, s))
  if (staleNote) ctx.log(staleNote, 'warn')
  s.updatedAt = nowIso()
  await writeDoc(env, s, 'overview', renderMselMarkdown(s), 'repair')
  const saved = await deps.store.saveScenario(root, s, { by: 'ai', note: 'repair' })
  return { scenario: saved, summary }
}
