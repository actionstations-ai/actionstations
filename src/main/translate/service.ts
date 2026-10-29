// What the translate:* handlers do, kept out of the handler file so tests reach it directly.
import type { ItemRef as ItemRefT, TranslateRoute, TranslationItemText } from '@shared/ipc'
import { isRemoteRequest } from '@shared/provider-network'
import type { GlossaryEntry, ScenarioLanguages, SupportedLanguage } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { jobs } from '../jobs/manager'
import { loadProject, updateProject } from '../project/store'
import { getRoutingView } from '../providers/resolve'
import { getSettings } from '../settings/store'
import { getScenario, readScenarioDoc, updateScenario } from '../scenario/store'
import { translatableFields } from './fields'
import { effectiveGlossary } from './glossary'
import { runTranslation } from './job'
import {
  acceptItems,
  injectsInScope,
  readTranslatedDoc,
  saveInjectTranslation,
  schemaOf,
  translationItems,
  writeTranslatedDoc,
} from './store'

/** The provider (and whether it is a cloud one) `translate` is routed to; draft when unset. */
export async function translationRoute(root: string): Promise<TranslateRoute | null> {
  const { effective } = await getRoutingView(root)
  const ref = effective.translate ?? effective.draft
  if (!ref) return null
  const config = (await getSettings()).providers.find((p) => p.id === ref.providerId)
  if (!config) return null
  const model = ref.model ?? config.defaultModel
  return {
    providerLabel: config.label,
    ...(model ? { model } : {}),
    cloud: isRemoteRequest(config, model),
  }
}

export async function statusFor(root: string, scenarioId: string, lang: SupportedLanguage) {
  const [scenario, project] = await Promise.all([getScenario(root, scenarioId), loadProject(root)])
  return {
    languages: scenario.languages ?? { player: [], controller: false },
    items: await translationItems(root, scenarioId, lang, project),
    route: await translationRoute(root),
    glossary: effectiveGlossary(lang, project.glossary),
  }
}

const sameItem = (a: ItemRefT, b: { kind: string; id: string }): boolean =>
  a.kind === b.kind && a.id === b.id

/** One item side by side. */
export async function itemText(
  root: string,
  scenarioId: string,
  lang: SupportedLanguage,
  ref: ItemRefT,
): Promise<TranslationItemText> {
  const items = await translationItems(root, scenarioId, lang)
  const item = items.find((i) => sameItem(ref, i))
  if (!item) throw new AppError('NOT_FOUND', 'That item is not part of the translation')
  if (ref.kind === 'doc') {
    return {
      ...item,
      source: await readScenarioDoc(root, scenarioId, ref.id),
      translated: await readTranslatedDoc(root, scenarioId, ref.id, lang),
    }
  }
  const inject = (await injectsInScope(root, scenarioId)).find((i) => i.id === ref.id)!
  const stored = inject.translations?.[lang]
  return {
    ...item,
    sourceTitle: inject.title,
    sourceFields: translatableFields(schemaOf(inject, root), inject.fields),
    translatedTitle: stored?.title ?? '',
    translatedFields: stored?.fields ?? {},
  }
}

export interface SaveItem {
  item: ItemRefT
  markdown?: string | undefined
  title?: string | undefined
  fields?: Record<string, unknown> | undefined
}

/** A person's edit: the item is reviewed from here on. */
export async function saveItem(
  root: string,
  scenarioId: string,
  lang: SupportedLanguage,
  save: SaveItem,
): Promise<void> {
  if (save.item.kind === 'doc') {
    if (save.markdown === undefined) throw new AppError('VALIDATION', 'No text to save')
    await writeTranslatedDoc(root, scenarioId, save.item.id, lang, save.markdown, 'reviewed')
    return
  }
  const inject = (await injectsInScope(root, scenarioId)).find((i) => i.id === save.item.id)
  if (!inject) throw new AppError('NOT_FOUND', 'That inject is not part of the translation')
  await saveInjectTranslation(
    root,
    scenarioId,
    inject.id,
    lang,
    { title: save.title ?? inject.title, fields: save.fields ?? {} },
    'reviewed',
  )
}

export const accept = acceptItems

export function start(
  root: string,
  scenarioId: string,
  lang: SupportedLanguage,
  items?: ItemRefT[],
  retranslate?: boolean,
): string {
  const job = jobs.start(
    'translate',
    (ctx) =>
      runTranslation(ctx, {
        root,
        scenarioId,
        lang,
        ...(items ? { items } : {}),
        ...(retranslate ? { retranslate } : {}),
      }),
    { projectPath: root, scenarioId, payload: { lang, items: items?.length ?? 'all' } },
  )
  return job.id
}

export async function setLanguages(
  root: string,
  scenarioId: string,
  languages: ScenarioLanguages,
): Promise<void> {
  await updateScenario(
    root,
    scenarioId,
    (s) => {
      s.languages = languages
    },
    { by: 'user', snapshot: false },
  )
}

export async function setGlossary(
  root: string,
  lang: SupportedLanguage,
  entries: GlossaryEntry[],
): Promise<void> {
  const seen = new Set<string>()
  for (const e of entries) {
    const key = e.term.toLowerCase()
    if (seen.has(key)) throw new AppError('VALIDATION', `"${e.term}" is listed twice`)
    seen.add(key)
  }
  await updateProject(root, (p) => {
    p.glossary = { ...(p.glossary ?? {}), [lang]: entries }
  })
}
