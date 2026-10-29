// Survey templates (#422): surveys/templates/<templateId>.json in the app resources, turned
// into per-scenario Surveys. Paired templates (knowledge check, confidence) create both
// editions at once, linked by pairId and sharing question ids so results can be compared.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  Survey,
  SurveyTemplate,
  type Objective,
  type SurveyEdition,
  type SurveyTemplateInfo,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import { resourcePath } from '../lib/paths'

export const SURVEY_TEMPLATE_IDS = [
  'hseep-participant-feedback',
  'knowledge-check',
  'confidence-before',
  'confidence-after',
  'facilitator-debrief',
  'evaluator-debrief',
] as const

export const surveyTemplatesDir = (): string => resourcePath('surveys', 'templates')

let cache: Map<string, SurveyTemplate> | undefined

/** Read and validate every template file (cached; a bad file is an error, not skipped). */
export function loadSurveyTemplates(dir = surveyTemplatesDir()): Map<string, SurveyTemplate> {
  if (cache && dir === surveyTemplatesDir()) return cache
  const out = new Map<string, SurveyTemplate>()
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const parsed = SurveyTemplate.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')))
    if (!parsed.success)
      throw new AppError('VALIDATION', `Invalid survey template ${file}`, parsed.error.issues)
    out.set(parsed.data.templateId, parsed.data)
  }
  if (dir === surveyTemplatesDir()) cache = out
  return out
}

/** Template metadata in the order the picker shows it (the HSEEP form first). */
export function surveyTemplateInfo(templates = loadSurveyTemplates()): SurveyTemplateInfo[] {
  const rank = (id: string) => {
    const i = (SURVEY_TEMPLATE_IDS as readonly string[]).indexOf(id)
    return i < 0 ? SURVEY_TEMPLATE_IDS.length : i
  }
  const ordered = [...templates.values()].sort((a, b) => rank(a.templateId) - rank(b.templateId))
  return ordered.map((t) => ({
    id: t.templateId,
    version: t.templateVersion,
    title: t.survey.title,
    description: t.description,
    kind: t.survey.kind,
    ...(t.pairTemplateId ? { pairTemplateId: t.pairTemplateId } : {}),
    listed: t.listed,
  }))
}

/** One confidence statement per objective, with the objective id as the pair key. */
function objectiveStatements(objectives: Objective[], edition: SurveyEdition) {
  return objectives.map((o, i) => ({
    id: `obj-${o.id}`.slice(0, 128),
    type: 'confidence',
    text: o.name.trim() || `Objective ${i + 1}`,
    statement: `I could carry out my part in this objective: ${o.text.trim()}`,
    pairKey: o.id,
    edition,
    objectiveRef: o.id,
    required: false,
  }))
}

export interface InstantiateContext {
  now: string
  objectives: Objective[]
  /** Team names offered as role groups when the designer turns the question on. */
  roleGroups?: string[]
  id?: string
}

/** A new Survey from a template. Throws VALIDATION when the template does not yield one. */
export function instantiateTemplate(template: SurveyTemplate, ctx: InstantiateContext): Survey {
  const t = template.survey
  const edition = t.edition
  const sections = t.sections.map((s) => ({
    ...s,
    questions:
      template.statementsFromObjectives && edition && s.questions.length === 0
        ? objectiveStatements(ctx.objectives, edition)
        : s.questions,
  }))
  const parsed = Survey.safeParse({
    id: ctx.id ?? newId(),
    title: t.title,
    kind: t.kind,
    timing: t.timing,
    ...(edition ? { edition } : {}),
    introMd: t.introMd,
    askRoleGroup: t.askRoleGroup,
    roleGroups: ctx.roleGroups ?? [],
    sections,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    status: 'draft',
    createdAt: ctx.now,
    updatedAt: ctx.now,
  })
  if (!parsed.success)
    throw new AppError(
      'VALIDATION',
      `Survey template ${template.templateId} is invalid`,
      parsed.error.issues,
    )
  return parsed.data
}

/** The after edition of a self-paired template (the knowledge check): same questions. */
function afterEdition(before: Survey, ctx: InstantiateContext): Survey {
  return Survey.parse({
    ...structuredClone(before),
    id: newId(),
    title: before.title.replace(/\s*\(before\)$/, '') + ' (after)',
    timing: 'post',
    edition: 'after',
    createdAt: ctx.now,
    updatedAt: ctx.now,
  })
}

/**
 * The surveys a template creates: one, or for a paired template both editions, the
 * requested one first, linked to each other by pairId.
 */
export function surveysFromTemplate(
  templateId: string,
  ctx: InstantiateContext,
  templates = loadSurveyTemplates(),
): Survey[] {
  const template = templates.get(templateId)
  if (!template) throw new AppError('NOT_FOUND', `No survey template ${templateId}`)
  const first = instantiateTemplate(template, ctx)
  if (!template.pairTemplateId) return [first]
  if (template.pairTemplateId === templateId) {
    first.title = `${first.title} (before)`
    const second = afterEdition(first, ctx)
    return [
      { ...first, pairId: second.id },
      { ...second, pairId: first.id },
    ]
  }
  const pairTemplate = templates.get(template.pairTemplateId)
  if (!pairTemplate)
    throw new AppError('NOT_FOUND', `No survey template ${template.pairTemplateId}`)
  const second = instantiateTemplate(pairTemplate, { ...ctx, id: newId() })
  return [
    { ...first, pairId: second.id },
    { ...second, pairId: first.id },
  ]
}

/** A blank survey for "Start from scratch". */
export function blankSurvey(now: string, title = 'New survey'): Survey {
  return Survey.parse({
    id: newId(),
    title,
    kind: 'custom',
    timing: 'post',
    sections: [{ id: newId(), title: '', introMd: '', questions: [] }],
    createdAt: now,
    updatedAt: now,
  })
}

/** Tests only. */
export function resetSurveyTemplateCache(): void {
  cache = undefined
}
