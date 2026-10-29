// Translated material on disk and its review state (spec 0435 FR-7). Documents live beside
// their English source (documents/briefing.es.md) with a record in scenario.translations;
// inject translations live in the inject file. A translation is `stale` when the English it
// was made from has changed since: the hash is compared when status is read, never stored.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type {
  GlossaryEntry,
  Inject,
  InjectTranslation,
  Project,
  Scenario,
  Survey,
  SupportedLanguage,
  TranslatableDoc,
  TranslationStatus,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { toRel, writeFileAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { validateFields } from '../render/templates'
import {
  getScenario,
  listInjects,
  readScenarioDoc,
  saveInject,
  updateScenario,
} from '../scenario/store'
import { scenarioLayout } from '../scenario/layout'
import { loadProject } from '../project/store'
import { applyTranslation, translatableFields } from './fields'
import { schemaOf } from './inject'
import { effectiveGlossary, flagText, glossaryFlags } from './glossary'
import { docsInScope, playerInjects, type ItemRef } from './scope'
import { saveSurveyTranslation, surveySourceHash, surveysInScope, surveyTexts } from './survey'

type Json = Record<string, unknown>

const sha = (text: string): string => createHash('sha256').update(text).digest('hex')

export const docSourceHash = (markdown: string): string => sha(markdown.trim())

/** Hash of what a translation is made from: the title and the translatable fields. */
export function injectSourceHash(inject: Inject, root: string): string {
  const fields = translatableFields(schemaOf(inject, root), inject.fields)
  return sha(JSON.stringify({ title: inject.title, fields }))
}

export type ItemStatus = TranslationStatus | 'missing'

export interface TranslationItem {
  kind: ItemRef['kind']
  id: string
  label: string
  status: ItemStatus
  /** Glossary terms the translation does not use (reviewer hints). */
  flags: string[]
}

const DOC_LABELS: Record<TranslatableDoc, string> = {
  briefing: 'Player Briefing Packet',
  handouts: 'Player Handouts',
  handbook: 'Controller / Evaluator Handbook',
  controller_handouts: 'Controller Materials',
}

/** All strings in a value, joined: what a glossary check reads. */
function allText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(allText).join('\n')
  if (value && typeof value === 'object') return Object.values(value).map(allText).join('\n')
  return ''
}

function statusOf(
  stored: { status: TranslationStatus; sourceHash: string } | undefined,
  now: string,
) {
  if (!stored) return 'missing' as const
  return stored.sourceHash === now ? stored.status : ('stale' as const)
}

function docItem(
  scenario: Scenario,
  doc: TranslatableDoc,
  lang: SupportedLanguage,
  source: string,
  translated: string,
  glossary: GlossaryEntry[],
): TranslationItem {
  const stored = scenario.translations?.[lang]?.documents?.[doc]
  const status = statusOf(stored, docSourceHash(source))
  return {
    kind: 'doc',
    id: doc,
    label: DOC_LABELS[doc],
    status,
    flags: stored ? glossaryFlags(source, translated, glossary).map(flagText) : [],
  }
}

function injectItem(
  inject: Inject,
  lang: SupportedLanguage,
  root: string,
  glossary: GlossaryEntry[],
): TranslationItem {
  const stored = inject.translations?.[lang]
  const schema = schemaOf(inject, root)
  const sourceText = allText([inject.title, translatableFields(schema, inject.fields)])
  return {
    kind: 'inject',
    id: inject.id,
    label: `${inject.mselRowId}: ${inject.title}`,
    status: statusOf(stored, injectSourceHash(inject, root)),
    flags: stored
      ? glossaryFlags(sourceText, allText([stored.title, stored.fields]), glossary).map(flagText)
      : [],
  }
}

function surveyItem(
  survey: Survey,
  lang: SupportedLanguage,
  glossary: GlossaryEntry[],
): TranslationItem {
  const stored = survey.translations?.[lang]
  return {
    kind: 'survey',
    id: survey.id,
    label: `Survey: ${survey.title}`,
    status: statusOf(stored, surveySourceHash(survey)),
    flags: stored
      ? glossaryFlags(allText(surveyTexts(survey)), allText(stored.text), glossary).map(flagText)
      : [],
  }
}

/** The injects a translation covers: players' rows whose MSEL row still exists. */
export async function injectsInScope(root: string, scenarioId: string): Promise<Inject[]> {
  const [scenario, all] = await Promise.all([
    getScenario(root, scenarioId),
    listInjects(root, scenarioId),
  ])
  const rows = new Set(scenario.msel.map((r) => r.id))
  return playerInjects(
    scenario,
    all.filter((i) => rows.has(i.mselRowId)),
  )
}

/** Every item in scope for one language with its review state. */
export async function translationItems(
  root: string,
  scenarioId: string,
  lang: SupportedLanguage,
  project?: Pick<Project, 'glossary'>,
): Promise<TranslationItem[]> {
  const scenario = await getScenario(root, scenarioId)
  const glossary = effectiveGlossary(lang, (project ?? (await loadProject(root))).glossary)
  const items: TranslationItem[] = []
  for (const doc of docsInScope(scenario)) {
    const source = await readScenarioDoc(root, scenarioId, doc)
    if (!source.trim()) continue
    const translated = await readTranslatedDoc(root, scenarioId, doc, lang)
    items.push(docItem(scenario, doc, lang, source, translated, glossary))
  }
  for (const inject of await injectsInScope(root, scenarioId))
    items.push(injectItem(inject, lang, root, glossary))
  for (const survey of await surveysInScope(root, scenarioId))
    items.push(surveyItem(survey, lang, glossary))
  return items
}

export async function readTranslatedDoc(
  root: string,
  scenarioId: string,
  doc: TranslatableDoc,
  lang: SupportedLanguage,
): Promise<string> {
  try {
    return await fs.readFile(scenarioLayout(root, scenarioId).translatedDoc(doc, lang), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw e
  }
}

/** Write a translated document and record its status against the English it came from. */
export async function writeTranslatedDoc(
  root: string,
  scenarioId: string,
  doc: TranslatableDoc,
  lang: SupportedLanguage,
  markdown: string,
  status: TranslationStatus,
): Promise<void> {
  const source = await readScenarioDoc(root, scenarioId, doc)
  const file = scenarioLayout(root, scenarioId).translatedDoc(doc, lang)
  await writeFileAtomic(file, markdown)
  await updateScenario(
    root,
    scenarioId,
    (s) => {
      const entry = s.translations?.[lang] ?? { documents: {} }
      entry.documents = {
        ...entry.documents,
        [doc]: {
          path: toRel(root, file),
          sourceHash: docSourceHash(source),
          status,
          updatedAt: nowIso(),
        },
      }
      s.translations = { ...(s.translations ?? {}), [lang]: entry }
    },
    { by: 'user', snapshot: false },
  )
}

/** Save an inject's translation after checking the merged fields against its template. */
export async function saveInjectTranslation(
  root: string,
  scenarioId: string,
  injectId: string,
  lang: SupportedLanguage,
  text: { title: string; fields: Json },
  status: TranslationStatus,
): Promise<InjectTranslation> {
  const inject = (await listInjects(root, scenarioId)).find((i) => i.id === injectId)
  if (!inject) throw new AppError('NOT_FOUND', `Inject not found: ${injectId}`)
  const schema = schemaOf(inject, root)
  const fields = translatableFields(schema, applyTranslation(schema, inject.fields, text.fields))
  const merged = applyTranslation(schema, inject.fields, fields)
  const issues = Object.keys(schema).length ? validateFields(inject.type, merged, root) : []
  if (issues.length)
    throw new AppError(
      'VALIDATION',
      `The translation does not fit the ${inject.type} template: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
    )
  const translation: InjectTranslation = {
    title: text.title.trim() || inject.title,
    fields,
    sourceHash: injectSourceHash(inject, root),
    status,
    assets: inject.translations?.[lang]?.assets ?? [],
    updatedAt: nowIso(),
  }
  await saveInject(
    root,
    scenarioId,
    { ...inject, translations: { ...(inject.translations ?? {}), [lang]: translation } },
    { by: 'user', snapshot: false },
  )
  return translation
}

/** Mark items as reviewed (all in scope when `refs` is omitted); missing items are skipped. */
export async function acceptItems(
  root: string,
  scenarioId: string,
  lang: SupportedLanguage,
  refs?: ItemRef[],
): Promise<number> {
  const wanted = refs && new Set(refs.map((r) => `${r.kind}:${r.id}`))
  const pick = (kind: string, id: string): boolean => !wanted || wanted.has(`${kind}:${id}`)
  let accepted = 0
  const scenario = await getScenario(root, scenarioId)
  for (const doc of docsInScope(scenario)) {
    const stored = scenario.translations?.[lang]?.documents?.[doc]
    if (!stored || !pick('doc', doc) || stored.status === 'reviewed') continue
    // Accept-all never blesses a translation of text that has changed since.
    if (
      !wanted &&
      stored.sourceHash !== docSourceHash(await readScenarioDoc(root, scenarioId, doc))
    )
      continue
    const text = await readTranslatedDoc(root, scenarioId, doc, lang)
    await writeTranslatedDoc(root, scenarioId, doc, lang, text, 'reviewed')
    accepted++
  }
  for (const inject of await injectsInScope(root, scenarioId)) {
    const stored = inject.translations?.[lang]
    if (!stored || !pick('inject', inject.id) || stored.status === 'reviewed') continue
    if (!wanted && stored.sourceHash !== injectSourceHash(inject, root)) continue
    await saveInjectTranslation(root, scenarioId, inject.id, lang, stored, 'reviewed')
    accepted++
  }
  for (const survey of await surveysInScope(root, scenarioId)) {
    const stored = survey.translations?.[lang]
    if (!stored || !pick('survey', survey.id) || stored.status === 'reviewed') continue
    if (!wanted && stored.sourceHash !== surveySourceHash(survey)) continue
    await saveSurveyTranslation(root, scenarioId, survey.id, lang, stored.text, 'reviewed')
    accepted++
  }
  return accepted
}

export { schemaOf }
