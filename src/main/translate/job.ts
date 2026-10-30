// The translate:run job (spec 0435 FR-5): one provider call per document and per inject, sent
// to the provider routed to the `translate` task. Output is structured (ADR-0007), checked
// against a zod schema, and an inject's translated fields are checked against its template's
// schema before they are stored. A failed item is reported and the rest carry on; running the
// job again picks up the items still missing (the job is resumable by being idempotent).
import { z } from 'zod'
import type {
  Inject,
  Project,
  PromptFile,
  SupportedLanguage,
  TranslatableDoc,
} from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { AppError, toAppError } from '../lib/errors'
import { extractJson, jsonSpec } from '../providers/json'
import type { ResolvedText } from '../providers/resolve'
import type { RenderedPrompt } from '../prompts'
import { getScenario, readScenarioDoc } from '../scenario/store'
import { loadProject } from '../project/store'
import { readSurvey } from '../surveys/store'
import { saveSurveyTranslation, surveyTexts } from './survey'
import { translatableFields } from './fields'
import { effectiveGlossary } from './glossary'
import { itemKey, type ItemRef } from './scope'
import {
  injectsInScope,
  saveInjectTranslation,
  schemaOf,
  translationItems,
  writeTranslatedDoc,
  type TranslationItem,
} from './store'

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = { es: 'Spanish' }
const AUDIENCE: Record<SupportedLanguage, string> = {
  es: 'Spanish-speaking players, responders and staff in the United States',
}

const DocOutput = z.object({ markdown: z.string().min(1) })
const SurveyOutput = z.object({ texts: z.record(z.string(), z.unknown()) })
const InjectOutput = z.object({
  title: z.string(),
  fields: z.record(z.string(), z.unknown()),
})

export interface TranslateDeps {
  resolveTextProvider(task: 'translate', projectPath: string): Promise<ResolvedText>
  loadPrompt(name: string, projectPath: string): Promise<PromptFile>
  renderPrompt(prompt: PromptFile, vars: Record<string, unknown>): RenderedPrompt
  /** Called after an inject's translation is stored (renders its media); optional. */
  afterInject?(
    root: string,
    scenarioId: string,
    injectId: string,
    lang: SupportedLanguage,
  ): Promise<void>
}

export async function realDeps(): Promise<TranslateDeps> {
  const [{ resolveTextProvider }, { loadPrompt, renderPrompt }] = await Promise.all([
    import('../providers/resolve'),
    import('../prompts'),
  ])
  return { resolveTextProvider, loadPrompt, renderPrompt }
}

export interface TranslateRequest {
  root: string
  scenarioId: string
  lang: SupportedLanguage
  /** Only these items; all in scope when omitted. */
  items?: ItemRef[]
  /** Translate again even where a translation exists (reviewed ones included). */
  retranslate?: boolean
}

export interface TranslateResult {
  translated: number
  skipped: number
  failed: { item: string; error: string }[]
}

interface Call {
  deps: TranslateDeps
  ctx: Pick<JobContext, 'jobId' | 'signal' | 'log'>
  resolved: ResolvedText
  prompt: PromptFile
  project: Project
  lang: SupportedLanguage
  root: string
  scenarioId: string
}

const SPEC_NAMES = {
  doc: 'TranslateDocument',
  inject: 'TranslateInject',
  survey: 'TranslateSurvey',
} as const

async function ask<T>(
  call: Call,
  source: string,
  kind: 'doc' | 'inject' | 'survey',
  schema: z.ZodType<T>,
  itemId: string,
): Promise<T> {
  const isDocument = kind === 'doc'
  const vars = {
    languageName: LANGUAGE_NAMES[call.lang],
    audience: AUDIENCE[call.lang],
    glossary: effectiveGlossary(call.lang, call.project.glossary),
    isDocument,
    isSurvey: kind === 'survey',
    source,
  }
  const rendered = call.deps.renderPrompt(call.prompt, vars)
  const fm = rendered.frontmatter
  const res = await call.resolved.provider.chat({
    model: call.resolved.model,
    system: rendered.system,
    messages: [{ role: 'user', content: rendered.user }],
    ...(fm.modelHints.temperature !== undefined ? { temperature: fm.modelHints.temperature } : {}),
    ...(fm.modelHints.maxTokens !== undefined ? { maxTokens: fm.modelHints.maxTokens } : {}),
    json: jsonSpec(SPEC_NAMES[kind], schema),
    signal: call.ctx.signal,
    outbound: {
      jobId: call.ctx.jobId,
      projectPath: call.root,
      task: 'translate',
      stage: 'translate',
      itemId,
      excerpts: [],
    },
  })
  const parsed = schema.safeParse(res.json ?? extractJson(res.text))
  if (!parsed.success)
    throw new AppError('VALIDATION', `The model's reply was not a usable translation (${itemId})`)
  return parsed.data
}

async function translateDoc(call: Call, doc: TranslatableDoc) {
  const source = await readScenarioDoc(call.root, call.scenarioId, doc)
  const out = await ask(call, source, 'doc', DocOutput, doc)
  await writeTranslatedDoc(call.root, call.scenarioId, doc, call.lang, out.markdown, 'machine')
}

async function translateInject(call: Call, inject: Inject) {
  const fields = translatableFields(schemaOf(inject, call.root), inject.fields)
  const source = JSON.stringify({ title: inject.title, fields }, null, 2)
  const out = await ask(call, source, 'inject', InjectOutput, inject.id)
  await saveInjectTranslation(call.root, call.scenarioId, inject.id, call.lang, out, 'machine')
  await call.deps.afterInject?.(call.root, call.scenarioId, inject.id, call.lang)
}

async function translateSurvey(call: Call, surveyId: string) {
  const survey = await readSurvey(call.root, call.scenarioId, surveyId)
  const source = JSON.stringify(surveyTexts(survey), null, 2)
  const out = await ask(call, source, 'survey', SurveyOutput, surveyId)
  await saveSurveyTranslation(call.root, call.scenarioId, surveyId, call.lang, out.texts, 'machine')
}

const wantsItem = (req: TranslateRequest, item: TranslationItem): boolean => {
  if (req.items) return req.items.some((r) => itemKey(r) === `${item.kind}:${item.id}`)
  return req.retranslate || item.status === 'missing' || item.status === 'stale'
}

/** Run the translation of every item in scope that needs it. */
export async function runTranslation(
  ctx: Pick<JobContext, 'jobId' | 'signal' | 'progress' | 'log' | 'throwIfCancelled'>,
  req: TranslateRequest,
  deps?: TranslateDeps,
): Promise<TranslateResult> {
  const d = deps ?? (await realDeps())
  const { root, scenarioId, lang } = req
  const [project, scenario] = await Promise.all([loadProject(root), getScenario(root, scenarioId)])
  if (!scenario.languages?.player.includes(lang))
    throw new AppError('VALIDATION', `${LANGUAGE_NAMES[lang]} is not switched on for this scenario`)
  const items = await translationItems(root, scenarioId, lang, project)
  const todo = items.filter((i) => wantsItem(req, i))
  const injects = new Map((await injectsInScope(root, scenarioId)).map((i) => [i.id, i]))
  const resolved = await d.resolveTextProvider('translate', root)
  const prompt = await d.loadPrompt('translate', root)
  const call: Call = {
    deps: d,
    ctx,
    resolved,
    prompt,
    project,
    lang,
    root,
    scenarioId,
  }
  const result: TranslateResult = { translated: 0, skipped: items.length - todo.length, failed: [] }
  for (const [n, item] of todo.entries()) {
    ctx.throwIfCancelled()
    ctx.progress(n / todo.length, `Translating ${item.label}…`, {
      stage: 'translate',
      itemId: item.id,
    })
    try {
      if (item.kind === 'doc') await translateDoc(call, item.id as TranslatableDoc)
      else if (item.kind === 'survey') await translateSurvey(call, item.id)
      else await translateInject(call, injects.get(item.id)!)
      result.translated++
    } catch (e) {
      const err = toAppError(e)
      if (err.code === 'CANCELLED') throw err
      result.failed.push({ item: item.label, error: err.message })
      ctx.log(`${item.label}: ${err.message}`, 'warn', { stage: 'translate', itemId: item.id })
    }
  }
  if (todo.length && !result.translated)
    throw new AppError(
      'INTERNAL',
      `Nothing was translated: ${result.failed[0]?.error ?? 'unknown error'}`,
    )
  ctx.progress(1, `Translated ${result.translated} item${result.translated === 1 ? '' : 's'}`)
  return result
}
