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
import { facilitySheet, type FacilityFacts } from '../facility'
import { stripKeysDeep } from '../mappers'
import { resolveCitations, type RetrievedChunk } from '../retrieval'
import { runStage, StageFailure, type StageResult } from '../stage'
import { baseVars, dataSafe, rowVars } from '../vars'
import { contentIssues, type ContentIssue } from './consistency'
import type { InjectDeps } from './deps'
import { factsSoFar, formatFacts, storyTexts } from './facts'
import { normalizeFields } from './normalize'
import {
  chooseInjectType,
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

export interface InjectEnv {
  root: string
  deps: InjectDeps
  index: SearchIndex
  project: Project
  /** Identifiers the project's documents state (#84). */
  facility: FacilityFacts
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
}

const TITLE_MAX = 80

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
  const t = env.deps.templates.loadTemplate(choice.type)
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
    ...baseVars({ project: env.project, scenario: s, ...(instructions ? { instructions } : {}) }),
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
  if (env.deps.templates.listTemplateTypes().includes(wanted)) {
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
}

type Checked = Pick<Validated, 'issues' | 'content'>

/**
 * One draft: unknown fields dropped, fields normalised, then the schema issues and the
 * content issues. Both lists go back to the model in the single repair round.
 */
function checkDraft(
  input: InjectTextInput,
  injectId: string,
  choice: TypeChoice,
  out: InjectTextOutput,
): Checked {
  const { env, row, scenario, priorInjects } = input
  const extra = { stage: 'inject_text' as const, itemId: injectId }
  const template = choice.hasTemplate ? env.deps.templates.loadTemplate(choice.type) : undefined
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
  })
  if (notes.length)
    env.ctx.log(`inject_text ${row.id}: normalised ${notes.join('; ')}`, 'info', extra)
  const issues = template
    ? env.deps.templates
        .validateFields(choice.type, out.fields)
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
  })
  return { issues, content }
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
    return {
      output: fixed,
      retrieved: fix.retrieved,
      ...checkDraft(input, injectId, choice, fixed),
    }
  } catch (err) {
    if (!(err instanceof StageFailure)) throw err
    sumInto(first.run, err.run)
    env.ctx.log(
      `inject_text ${row.id}: repair reply was not valid JSON; keeping the first draft`,
      'warn',
      extra,
    )
    return { output: first.output, retrieved: first.retrieved, ...checked }
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

function toInject(
  input: InjectTextInput,
  injectId: string,
  choice: TypeChoice,
  v: Validated,
): { inject: Inject; dropped: string[] } {
  const { row, existing } = input
  const { citations, dropped } = resolveCitations(v.output.citations, v.retrieved)
  const note = v.output.instructorNote?.trim()
  const inject: Inject = {
    id: injectId,
    mselRowId: row.id,
    type: choice.type,
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

/** Expand one MSEL row into an inject. Throws StageFailure only when the first call fails. */
export async function runInjectText(input: InjectTextInput): Promise<InjectTextResult> {
  const { env, row, existing } = input
  const injectId = existing?.id ?? newId()
  const chosen = chooseInjectType(row, env.deps.templates.listTemplateTypes())
  const extra = { stage: 'inject_text' as const, itemId: injectId }
  if (chosen.note) env.ctx.log(`inject_text ${row.id}: ${chosen.note}`, 'info', extra)
  if (chosen.requested)
    env.ctx.log(
      `inject_text ${row.id}: ${chosen.requested} → ${chosen.type} (no template)`,
      'info',
      extra,
    )
  const vars = buildVars(input, chosen)
  const first = await callText(input, injectId, vars)
  const choice = finalType(env, chosen, first.output, row.id)
  const validated = await validateWithRepair(input, injectId, vars, first, choice)
  const { inject, dropped } = toInject(input, injectId, choice, validated)
  const warnings = typeWarnings(choice, row, injectId)
  if (validated.issues.length) {
    warnings.push({
      code: INJECT_FIELDS_INVALID,
      severity: 'warning',
      message: `${row.id}: fields still do not match the ${choice.type} template after one repair:\n${formatIssues(validated.issues)}`,
      source: 'lint',
      rowId: row.id,
      injectId,
      suggestion: 'Open the inject editor and fix the flagged fields',
    })
  }
  if (validated.content.length) {
    warnings.push({
      code: INJECT_CONTENT_ISSUE,
      severity: 'warning',
      message: `${row.id}: content still inconsistent after one repair:\n${formatIssues(validated.content)}`,
      source: 'lint',
      rowId: row.id,
      injectId,
      suggestion: 'Open the inject editor and fix the flagged content',
    })
  }
  if (dropped.length) {
    warnings.push({
      code: CITATION_DROPPED,
      severity: 'warning',
      message: `inject_text (${row.id}) cited ${dropped.join(', ')}, which was not among the retrieved sections; dropped`,
      source: 'lint',
      rowId: row.id,
      injectId,
    })
  }
  for (const w of warnings) env.ctx.log(w.message, w.severity === 'info' ? 'info' : 'warn', extra)
  return { inject, run: first.run, warnings }
}
