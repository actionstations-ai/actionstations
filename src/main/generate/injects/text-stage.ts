// inject_text for one MSEL row: pick the type (template-backed when possible), show the
// model the template's schema, the facility facts and the facts established so far, normalise
// the fields, validate them with the template's JSON Schema plus the content checks
// (consistency.ts), send every issue back once, and keep the inject with a lint warning when
// the repair also misses (a page the user can fix beats a failed job).
import type {
  Inject,
  InjectTextOutput,
  LintWarning,
  MselRow,
  Project,
  Scenario,
  StageRun,
} from '@shared/schemas'
import { injectTypeInfo } from '@shared/taxonomy'
import type { JobContext } from '../../jobs/manager'
import { newId } from '../../lib/ids'
import type { SearchIndex } from '../deps'
import type { DomainContext } from '../domain'
import { facilitySheet, type FacilityFacts } from '../facility'
import { stripKeysDeep } from '../mappers'
import { resolveCitations, type RetrievedChunk } from '../retrieval'
import { runStage, StageFailure, type StageResult } from '../stage'
import { baseVars, dataSafe, rowVars } from '../vars'
import { contentIssues, type ContentIssue, type OrgNames } from './consistency'
import type { InjectDeps } from './deps'
import { factsSoFar, formatFacts, storyTexts } from './facts'
import { controlCardFields } from './control-fallback'
import { normalizeFields } from './normalize'
import { formatRepairs, repairFields, type FieldRepair, type RepairMode } from './repair'
import {
  chooseInjectType,
  CONTROL_TYPES,
  defaultDelivery,
  KEY_FIELDS,
  schemaHints,
  type TypeChoice,
} from './type-map'

export const INJECT_FIELDS_INVALID = 'INJECT_FIELDS_INVALID'
export const INJECT_TYPE_FALLBACK = 'INJECT_TYPE_FALLBACK'
export const INJECT_TEMPLATE_MISSING = 'INJECT_TEMPLATE_MISSING'
export const INJECT_CONTENT_ISSUE = 'INJECT_CONTENT_ISSUE'
export const CITATION_DROPPED = 'CITATION_DROPPED'
export const INJECT_FIELDS_REPAIRED = 'INJECT_FIELDS_REPAIRED'
export const INJECT_TEXT_FALLBACK = 'INJECT_TEXT_FALLBACK'
/** The template refused the inject's fields at render time (media job, #175). */
export const INJECT_RENDER_INVALID = 'INJECT_RENDER_INVALID'

export interface InjectEnv {
  root: string
  deps: InjectDeps
  index: SearchIndex
  project: Project
  /** Identifiers the project's documents state (#84). */
  facility: FacilityFacts
  /** The project's domain profile and the scenario's threat family (ADR-0014). */
  domain: DomainContext
  ctx: JobContext
}

export interface InjectTextInput {
  env: InjectEnv
  scenario: Scenario
  row: MselRow
  /** Inject being regenerated (its id, versions and deck flag are kept). */
  existing?: Inject
  /** Injects already written for other rows (consistency source). */
  priorInjects: Inject[]
  instructions?: string
}

export interface InjectTextResult {
  inject: Inject
  run: StageRun
  warnings: LintWarning[]
  /** True when the model failed and the page was built from the row (control cards). */
  fallback?: boolean
}

const TITLE_MAX = 80

type Fields = Record<string, unknown>

function fallbackTitle(row: MselRow): string {
  const text = row.event.replace(/^[^:"\n]{0,40}:\s*/, '').replace(/["“”]/g, '')
  const first = text.split(/[.!?\n]/)[0]?.trim() ?? ''
  return (first || row.event).slice(0, TITLE_MAX)
}

/** Purpose tags written into content ("CORE_NARRATIVE: Verification plan…"); the plain-word
 *  tags (NOISE, CLUE…) are only removed as a leading "TAG:" label. */
const UNDERSCORE_TAGS =
  /\s*\b(?:CORE_NARRATIVE|RED_HERRING|TECH_HURDLE|DECISION_POINT|OPERATIONAL_FRICTION|TIME_JUMP|END_GAME)\b:?\s*/g
const LEADING_TAG =
  /^(?:(?:CORE_NARRATIVE|NOISE|RED_HERRING|PRESSURE|MISINFORMATION|CLUE|TECH_HURDLE|DECISION_POINT|OPERATIONAL_FRICTION|CONFUSION|DISTRACTION|TIME_JUMP|END_GAME)\s*[:—-]\s*)+/

export function scrubTags<T>(value: T): T {
  if (typeof value === 'string') {
    const cleaned = value.replace(LEADING_TAG, '').replace(UNDERSCORE_TAGS, ' ').trim()
    return (cleaned || value) as T
  }
  if (Array.isArray(value)) return value.map(scrubTags) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubTags(v)]),
    ) as T
  }
  return value
}

/** The narrative date every artifact shows (the scenario has a clock but no calendar date). */
export function exerciseDate(now = new Date()): string {
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function phaseVars(s: Scenario, row: MselRow) {
  const p = s.phases.find((x) => x.id === row.phaseId)
  return p
    ? { number: p.index + 1, title: p.title, startTime: p.startTime, endTime: p.endTime }
    : { number: 0, title: '', startTime: '', endTime: '' }
}

function storySoFar(s: Scenario, row: MselRow) {
  const at = s.msel.findIndex((r) => r.id === row.id)
  return s.msel.slice(0, Math.max(0, at)).map((r) => ({
    id: r.id,
    time: r.time,
    wallClock: r.wallClock ?? '',
    from: r.from,
    to: rowVars(r, s.roles).to,
    event: r.event,
  }))
}

function templateVars(env: InjectEnv, choice: TypeChoice) {
  if (!choice.hasTemplate) {
    return { hasTemplate: false, fieldSchema: '', keyFields: KEY_FIELDS[choice.type] ?? 'text' }
  }
  const t = env.deps.templates.loadTemplate(choice.type, env.root)
  return {
    hasTemplate: true,
    fieldSchema: schemaHints(t.schema),
    keyFields: '',
    variants: t.meta.variants,
    imageSlots: t.meta.imageSlots,
  }
}

function buildVars(input: InjectTextInput, choice: TypeChoice): Record<string, unknown> {
  const { env, scenario: s, row, existing, priorInjects, instructions } = input
  const facts = factsSoFar(s.msel, row, priorInjects)
  const info = injectTypeInfo(choice.type)
  return {
    ...baseVars({
      project: env.project,
      scenario: s,
      domain: env.domain,
      ...(instructions ? { instructions } : {}),
    }),
    row: rowVars(row, s.roles),
    phase: phaseVars(s, row),
    exerciseDate: exerciseDate(),
    injectType: choice.type,
    injectTypeLabel: info?.label ?? choice.type,
    injectCategory: info?.category ?? 'documents',
    requestedType: choice.requested ?? '',
    defaultDelivery: defaultDelivery(choice.type),
    ...templateVars(env, choice),
    facts: dataSafe(formatFacts(facts)),
    facility: facilitySheet(env.facility),
    storySoFar: dataSafe(storySoFar(s, row)),
    priorInjects: dataSafe(
      priorInjects.map((i) => ({ id: i.mselRowId, type: i.type, title: i.title })),
    ),
    brand: env.project.brand,
    previous: existing
      ? dataSafe({
          title: existing.title,
          fields: existing.fields,
          instructorNote: existing.instructorNote ?? '',
        })
      : undefined,
  }
}

/**
 * Top-level keys the template schema does not declare are removed in place (the template
 * cannot render them and `additionalProperties: false` would otherwise cost a repair call).
 * Returns the removed keys. Only applied when the schema declares properties.
 */
export function dropUnknownFields(out: InjectTextOutput, known: string[]): string[] {
  if (!known.length) return []
  const allowed = new Set(known)
  const dropped = Object.keys(out.fields).filter((k) => !allowed.has(k))
  for (const k of dropped) delete out.fields[k]
  return dropped
}

const formatIssues = (issues: ContentIssue[]): string =>
  issues
    .slice(0, 25)
    .map((i) => `- ${i.path}: ${i.message}`)
    .join('\n')

async function callText(
  input: InjectTextInput,
  injectId: string,
  vars: Record<string, unknown>,
): Promise<StageResult<InjectTextOutput>> {
  const { env } = input
  const r = await runStage<InjectTextOutput>({
    stage: 'inject_text',
    itemId: injectId,
    projectPath: env.root,
    vars,
    ctx: env.ctx,
    deps: env.deps,
    index: env.index,
  })
  return { ...r, output: scrubTags(stripKeysDeep(r.output)) }
}

const sumInto = (into: StageRun, run: StageRun): void => {
  into.inputTokens = (into.inputTokens ?? 0) + (run.inputTokens ?? 0)
  into.outputTokens = (into.outputTokens ?? 0) + (run.outputTokens ?? 0)
  into.costUsd = (into.costUsd ?? 0) + (run.costUsd ?? 0)
  into.repairAttempts += 1 + run.repairAttempts
}

/** The model may switch type only to another installed template (e.g. tweet → facebook_post). */
function finalType(
  env: InjectEnv,
  choice: TypeChoice,
  out: InjectTextOutput,
  rowId: string,
): TypeChoice {
  const wanted = out.type.trim()
  if (!wanted || wanted === choice.type) return choice
  if (env.deps.templates.listTemplateTypes(env.root).includes(wanted)) {
    env.ctx.log(
      `inject_text ${rowId}: model chose type ${wanted} instead of ${choice.type}`,
      'info',
      {
        stage: 'inject_text',
        itemId: rowId,
      },
    )
    return { type: wanted, hasTemplate: true }
  }
  return choice
}

interface Validated {
  output: InjectTextOutput
  retrieved: RetrievedChunk[]
  /** Template schema violations (ajv), paths prefixed "fields". */
  issues: ContentIssue[]
  /** Content checks that still fail (consistency.ts). */
  content: ContentIssue[]
  /** Deterministic repairs applied to the kept draft (repair.ts). */
  repairs: FieldRepair[]
}

type Checked = Pick<Validated, 'issues' | 'content' | 'repairs'>

/**
 * One draft: unknown fields dropped (nested ones too), fields normalised, then the schema
 * issues and the content issues. Both lists go back to the model in the single repair round.
 * `mode: 'all'` also fixes enum, pattern and length violations in code (repair.ts).
 */
function checkDraft(
  input: InjectTextInput,
  injectId: string,
  choice: TypeChoice,
  out: InjectTextOutput,
  mode: RepairMode = 'keys',
): Checked {
  const { env, row, scenario, priorInjects } = input
  const extra = { stage: 'inject_text' as const, itemId: injectId }
  const template = choice.hasTemplate
    ? env.deps.templates.loadTemplate(choice.type, env.root)
    : undefined
  const schema = (template?.schema ?? {}) as Record<string, unknown>
  if (template) {
    const dropped = dropUnknownFields(out, Object.keys((schema.properties ?? {}) as object))
    if (dropped.length)
      env.ctx.log(
        `inject_text ${row.id}: dropped field(s) the ${choice.type} template does not have: ${dropped.join(', ')}`,
        'info',
        extra,
      )
  }
  const notes = normalizeFields({
    type: choice.type,
    fields: out.fields,
    row,
    required: (schema.required as string[] | undefined) ?? [],
    carrier: {
      storyText: storyTexts(scenario.msel, row, priorInjects).join('\n'),
      aliases: env.project.brand.aliases,
    },
  })
  if (notes.length)
    env.ctx.log(`inject_text ${row.id}: normalised ${notes.join('; ')}`, 'info', extra)
  const repairs = template ? repairFields(schema, out.fields, mode) : []
  if (repairs.length)
    env.ctx.log(`inject_text ${row.id}: repaired ${formatRepairs(repairs)}`, 'info', extra)
  const issues = template
    ? env.deps.templates
        .validateFields(choice.type, out.fields, env.root)
        .map((i) => ({ path: `fields${i.path}`, message: i.message }))
    : []
  const content = contentIssues({
    type: choice.type,
    fields: out.fields,
    schema,
    row,
    facility: env.facility,
    storyTexts: storyTexts(scenario.msel, row, priorInjects),
    knownText: knownNames(env.project, scenario),
    orgNames: orgNamesOf(env.project, scenario, env.facility),
  })
  return { issues, content, repairs }
}

/** Names that belong to this scenario, so a template example that matches one is not a leak. */
function knownNames(project: Project, s: Scenario): string {
  return [
    s.title,
    project.orgName,
    project.name,
    ...Object.values(project.brand.aliases),
    ...s.roles.flatMap((r) => [r.name, r.abbreviation, r.team]),
  ].join('\n')
}

/** The organization's own names, and the other names the project knows (#221). */
function orgNamesOf(project: Project, s: Scenario, facility: FacilityFacts): OrgNames {
  const { org, ...rest } = project.brand.aliases
  return {
    official: [project.name, project.orgName, org ?? ''].filter(Boolean),
    other: [
      ...Object.values(rest),
      ...s.roles.flatMap((r) => [r.name, r.team]),
      ...facility.categories.flatMap((c) => c.entries),
    ].filter((n): n is string => !!n),
  }
}

/** Schema issues left after the model's turn: fixed in code where they can be (#175, #177). */
function settle(
  input: InjectTextInput,
  injectId: string,
  choice: TypeChoice,
  out: InjectTextOutput,
  checked: Checked,
): Checked {
  if (!checked.issues.length) return checked
  const again = checkDraft(input, injectId, choice, out, 'all')
  return { ...again, repairs: [...checked.repairs, ...again.repairs] }
}

/** Validate the draft; on any issue, one more call carrying all of them. */
async function validateWithRepair(
  input: InjectTextInput,
  injectId: string,
  vars: Record<string, unknown>,
  first: StageResult<InjectTextOutput>,
  choice: TypeChoice,
): Promise<Validated> {
  const { env, row } = input
  const extra = { stage: 'inject_text' as const, itemId: injectId }
  const checked = checkDraft(input, injectId, choice, first.output)
  const all = [...checked.issues, ...checked.content]
  if (!all.length) return { output: first.output, retrieved: first.retrieved, ...checked }
  env.ctx.log(
    `inject_text ${row.id}: ${checked.issues.length} schema and ${checked.content.length} content issue(s), asking for a repair\n${formatIssues(all)}`,
    'warn',
    extra,
  )
  env.ctx.token('inject_text', '\n\n[repair round]\n', injectId)
  try {
    const fix = await callText(input, injectId, {
      ...vars,
      injectType: choice.type,
      repairIssues: formatIssues(all),
      previousOutput: JSON.stringify(first.output, null, 2),
    })
    sumInto(first.run, fix.run)
    const fixed = { ...fix.output, type: choice.type }
    const after = checkDraft(input, injectId, choice, fixed)
    return {
      output: fixed,
      retrieved: fix.retrieved,
      ...settle(input, injectId, choice, fixed, after),
    }
  } catch (err) {
    if (!(err instanceof StageFailure)) throw err
    sumInto(first.run, err.run)
    env.ctx.log(
      `inject_text ${row.id}: repair reply was not valid JSON; keeping the first draft`,
      'warn',
      extra,
    )
    return {
      output: first.output,
      retrieved: first.retrieved,
      ...settle(input, injectId, choice, first.output, checked),
    }
  }
}

function typeWarnings(choice: TypeChoice, row: MselRow, injectId: string): LintWarning[] {
  const base = { source: 'lint' as const, rowId: row.id, injectId }
  if (choice.requested) {
    return [
      {
        ...base,
        code: INJECT_TYPE_FALLBACK,
        severity: 'info',
        message: `${row.id}: no template for ${choice.requested}; rendered as ${choice.type}`,
      },
    ]
  }
  if (!choice.hasTemplate) {
    return [
      {
        ...base,
        code: INJECT_TEMPLATE_MISSING,
        severity: 'info',
        message: `${row.id}: no template installed for ${choice.type}; the page is text-only until one exists`,
        suggestion: `Add templates/injects/${choice.type}/ or change the row's format`,
      },
    ]
  }
  return []
}

/** The model's variant when the template has it, else the regenerated inject's, else none. */
export function chooseVariant(
  variants: readonly string[],
  wanted: string | undefined,
  kept: string | undefined,
): { variant?: string; rejected?: string } {
  const w = wanted?.trim()
  if (w && variants.includes(w)) return { variant: w }
  const fallback = kept && variants.includes(kept) ? { variant: kept } : {}
  return w ? { ...fallback, rejected: w } : fallback
}

/** Variants that show a corrupted or failing screen ("glitch"). */
const DISTRESSED_VARIANT = /glitch|corrupt/i
/** Rows that resolve the incident: their artifact shows systems back to normal (#222). */
const RECOVERY_TAGS = new Set(['END_GAME', 'ENDEX'])

/**
 * The variant the row's purpose allows: a recovery row never gets a distressed variant; it
 * takes the template's "default" (or first normal) one, or none so the template default renders.
 */
export function variantForPurpose(
  variants: readonly string[],
  variant: string | undefined,
  purposeTag: string,
): string | undefined {
  if (!variant || !RECOVERY_TAGS.has(purposeTag) || !DISTRESSED_VARIANT.test(variant))
    return variant
  return variants.includes('default')
    ? 'default'
    : variants.find((v) => !DISTRESSED_VARIANT.test(v))
}

function variantOf(
  input: InjectTextInput,
  injectId: string,
  choice: TypeChoice,
  wanted: string | undefined,
): string | undefined {
  if (!choice.hasTemplate) return undefined
  const { variants } = input.env.deps.templates.loadTemplate(choice.type, input.env.root).meta
  const picked = chooseVariant(variants, wanted, input.existing?.variant)
  if (picked.rejected) {
    const kept = picked.variant ? `kept ${picked.variant}` : 'the default is used'
    input.env.ctx.log(
      `inject_text ${input.row.id}: variant "${picked.rejected}" is not one of the ${choice.type} template's (${variants.join(', ')}); ${kept}`,
      'info',
      { stage: 'inject_text', itemId: injectId },
    )
  }
  const variant = variantForPurpose(variants, picked.variant, input.row.purposeTag)
  if (variant !== picked.variant)
    input.env.ctx.log(
      `inject_text ${input.row.id}: ${input.row.purposeTag} row shows recovery; variant "${picked.variant}" replaced by ${variant ? `"${variant}"` : 'the default'}`,
      'info',
      { stage: 'inject_text', itemId: injectId },
    )
  return variant
}

function toInject(
  input: InjectTextInput,
  injectId: string,
  choice: TypeChoice,
  v: Validated,
): { inject: Inject; dropped: string[] } {
  const { row, existing } = input
  const { citations, dropped } = resolveCitations(v.output.citations, v.retrieved)
  const note = v.output.instructorNote?.trim()
  const variant = variantOf(input, injectId, choice, v.output.variant)
  const inject: Inject = {
    id: injectId,
    mselRowId: row.id,
    type: choice.type,
    ...(variant ? { variant } : {}),
    title: v.output.title.trim() || fallbackTitle(row),
    deliveryMode: v.output.deliveryMode ?? defaultDelivery(choice.type),
    fields: v.output.fields,
    ...(note ? { instructorNote: note } : {}),
    citations,
    assets: existing?.assets ?? [],
    versions: existing?.versions ?? [],
    includeInDeck: existing?.includeInDeck ?? true,
    locked: false,
  }
  return { inject, dropped }
}

const warningBase = (row: MselRow, injectId: string) => ({
  source: 'lint' as const,
  rowId: row.id,
  injectId,
})

/** One INJECT_FIELDS_REPAIRED warning per deterministic repair. */
export function repairWarnings(
  row: MselRow,
  injectId: string,
  repairs: FieldRepair[],
): LintWarning[] {
  return repairs.map((r) => ({
    ...warningBase(row, injectId),
    code: INJECT_FIELDS_REPAIRED,
    severity: 'warning',
    message: `${row.id}: fields${r.path} repaired to fit the template — ${r.message}`,
    suggestion: 'Check the repaired field in the inject editor',
  }))
}

function validationWarnings(
  row: MselRow,
  injectId: string,
  choice: TypeChoice,
  v: Checked,
): LintWarning[] {
  const warnings = repairWarnings(row, injectId, v.repairs)
  if (v.issues.length) {
    warnings.push({
      ...warningBase(row, injectId),
      code: INJECT_FIELDS_INVALID,
      severity: 'warning',
      message: `${row.id}: fields still do not match the ${choice.type} template after one repair:\n${formatIssues(v.issues)}`,
      suggestion: 'Open the inject editor and fix the flagged fields',
    })
  }
  if (v.content.length) {
    warnings.push({
      ...warningBase(row, injectId),
      code: INJECT_CONTENT_ISSUE,
      severity: 'warning',
      message: `${row.id}: content still inconsistent after one repair:\n${formatIssues(v.content)}`,
      suggestion: 'Open the inject editor and fix the flagged content',
    })
  }
  return warnings
}

const firstLine = (run: StageRun): string => run.error?.split('\n')[0] ?? 'invalid output'

/**
 * The first draft. A reply that fails the output schema even after the stage's own repair
 * round (a runaway reply with no JSON, a truncated object) gets one fresh call with a clean
 * conversation before the row counts as failed (#166).
 */
async function firstDraft(
  input: InjectTextInput,
  injectId: string,
  vars: Record<string, unknown>,
): Promise<StageResult<InjectTextOutput>> {
  try {
    return await callText(input, injectId, vars)
  } catch (err) {
    if (!(err instanceof StageFailure)) throw err
    input.env.ctx.log(
      `inject_text ${input.row.id}: no valid reply (${firstLine(err.run)}); trying once more`,
      'warn',
      { stage: 'inject_text', itemId: injectId },
    )
    try {
      const again = await callText(input, injectId, vars)
      sumInto(again.run, err.run)
      return again
    } catch (second) {
      if (second instanceof StageFailure) sumInto(second.run, err.run)
      throw second
    }
  }
}

function fallbackInject(input: InjectTextInput, injectId: string, type: string, fields: Fields) {
  const { row, existing } = input
  return {
    id: injectId,
    mselRowId: row.id,
    type,
    title: fallbackTitle(row),
    deliveryMode: defaultDelivery(type),
    fields,
    citations: [],
    assets: existing?.assets ?? [],
    versions: existing?.versions ?? [],
    includeInDeck: existing?.includeInDeck ?? true,
    locked: false,
  } satisfies Inject
}

/**
 * A control row whose replies all failed: the card is built from the row (control-fallback.ts)
 * and kept with an INJECT_TEXT_FALLBACK warning; the failed run is returned as the stage's run.
 */
function controlFallback(
  input: InjectTextInput,
  injectId: string,
  choice: TypeChoice,
  failure: StageFailure,
): InjectTextResult | undefined {
  const { env, row } = input
  if (!choice.hasTemplate || !Object.values(CONTROL_TYPES).includes(choice.type)) return undefined
  const fields = controlCardFields(choice.type, row, input.scenario.title)
  if (!fields) return undefined
  const schema = env.deps.templates.loadTemplate(choice.type, env.root).schema as Record<
    string,
    unknown
  >
  const known = Object.keys((schema.properties ?? {}) as object)
  for (const k of Object.keys(fields)) if (known.length && !known.includes(k)) delete fields[k]
  const repairs = repairFields(schema, fields)
  const issues = env.deps.templates
    .validateFields(choice.type, fields, env.root)
    .map((i) => ({ path: `fields${i.path}`, message: i.message }))
  const warnings: LintWarning[] = [
    {
      ...warningBase(row, injectId),
      code: INJECT_TEXT_FALLBACK,
      severity: 'warning',
      message: `${row.id}: the model gave no valid ${choice.type} after a retry (${firstLine(failure.run)}); the card was built from the MSEL row`,
      suggestion: 'Review the card, or regenerate this inject',
    },
    ...validationWarnings(row, injectId, choice, { issues, content: [], repairs }),
  ]
  const extra = { stage: 'inject_text' as const, itemId: injectId }
  for (const w of warnings) env.ctx.log(w.message, 'warn', extra)
  const inject = fallbackInject(input, injectId, choice.type, fields)
  return { inject, run: failure.run, warnings, fallback: true }
}

/**
 * Expand one MSEL row into an inject. Throws StageFailure when the model gives no valid
 * reply after a retry, except for control rows, which fall back to a card built from the row.
 */
export async function runInjectText(input: InjectTextInput): Promise<InjectTextResult> {
  const { env, row, existing } = input
  const injectId = existing?.id ?? newId()
  const chosen = chooseInjectType(
    row,
    env.deps.templates.listTemplateTypes(env.root),
    env.domain.profile.id,
  )
  const extra = { stage: 'inject_text' as const, itemId: injectId }
  if (chosen.note) env.ctx.log(`inject_text ${row.id}: ${chosen.note}`, 'info', extra)
  if (chosen.requested)
    env.ctx.log(
      `inject_text ${row.id}: ${chosen.requested} → ${chosen.type} (no template)`,
      'info',
      extra,
    )
  const vars = buildVars(input, chosen)
  let first: StageResult<InjectTextOutput>
  try {
    first = await firstDraft(input, injectId, vars)
  } catch (err) {
    const fallback = err instanceof StageFailure && controlFallback(input, injectId, chosen, err)
    if (fallback) return fallback
    throw err
  }
  const choice = finalType(env, chosen, first.output, row.id)
  const validated = await validateWithRepair(input, injectId, vars, first, choice)
  const { inject, dropped } = toInject(input, injectId, choice, validated)
  const warnings = [
    ...typeWarnings(choice, row, injectId),
    ...validationWarnings(row, injectId, choice, validated),
  ]
  if (dropped.length) {
    warnings.push({
      ...warningBase(row, injectId),
      code: CITATION_DROPPED,
      severity: 'warning',
      message: `inject_text (${row.id}) cited ${dropped.join(', ')}, which was not among the retrieved sections; dropped`,
    })
  }
  for (const w of warnings) env.ctx.log(w.message, w.severity === 'info' ? 'info' : 'warn', extra)
  return { inject, run: first.run, warnings }
}

export interface InjectRecheck {
  /** Template schema issues the deterministic repair cannot fix (paths "fields…"). */
  issues: ContentIssue[]
  /** Content checks (consistency.ts) that still fail. */
  content: ContentIssue[]
  /** INJECT_FIELDS_INVALID / INJECT_CONTENT_ISSUE warnings for what is still wrong. */
  warnings: LintWarning[]
}

/**
 * The checks a fresh draft gets, run on a stored inject (generate:repair): a warning an older
 * generator recorded that the current checks no longer raise can go without rewriting the
 * inject. The inject is not changed (the fields are checked on a copy); schema violations the
 * code repair fixes are left to the media job, which repairs and saves before it renders.
 */
export function recheckInject(input: InjectTextInput, inject: Inject): InjectRecheck {
  const hasTemplate = input.env.deps.templates
    .listTemplateTypes(input.env.root)
    .includes(inject.type)
  const choice: TypeChoice = { type: inject.type, hasTemplate }
  const copy = {
    type: inject.type,
    title: inject.title,
    fields: structuredClone(inject.fields),
    citations: [],
  } as unknown as InjectTextOutput
  const checked = checkDraft(input, inject.id, choice, copy, 'all')
  const warnings = validationWarnings(input.row, inject.id, choice, { ...checked, repairs: [] })
  return { issues: checked.issues, content: checked.content, warnings }
}
