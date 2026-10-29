// The export model in a second language (spec 0435 FR-10, FR-11): documents and injects are
// replaced by their translations, and an export that would print a translation nobody has
// reviewed is refused unless the person asked for the stamped override.
import type { SupportedLanguage, TranslatableDoc } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { availablePaths, type ExportModel } from '../export/model'
import { planMediaFiles } from '../export/naming'
import { translatedInject } from './inject'
import { readTranslatedDoc, translationItems, type TranslationItem } from './store'

const CONTROLLER_DOCS: readonly TranslatableDoc[] = ['handbook', 'controller_handouts']

export interface TranslatedExportOptions {
  /** Controller material goes out in this language too. */
  controller: boolean
  /** Export even with unreviewed items; every page is stamped. */
  allowUnreviewed: boolean
}

const STATUS_TEXT: Record<TranslationItem['status'], string> = {
  missing: 'not translated',
  machine: 'machine translation, not reviewed',
  stale: 'English changed since it was translated',
  reviewed: 'reviewed',
}

/** Items the export would print that a person has not reviewed. */
export async function unreviewedItems(
  root: string,
  scenarioId: string,
  lang: SupportedLanguage,
  controller: boolean,
): Promise<TranslationItem[]> {
  const items = await translationItems(root, scenarioId, lang)
  return items
    .filter((i) => controller || !(i.kind === 'doc' && CONTROLLER_DOCS.includes(i.id as never)))
    .filter((i) => i.status !== 'reviewed')
}

/** Refuse with the list of items when any is unreviewed; true when the override stamps pages. */
export async function assertReviewed(
  root: string,
  scenarioId: string,
  lang: SupportedLanguage,
  opts: TranslatedExportOptions,
): Promise<boolean> {
  const open = await unreviewedItems(root, scenarioId, lang, opts.controller)
  if (!open.length) return false
  if (opts.allowUnreviewed) return true
  const list = open.map((i) => `${i.label} (${STATUS_TEXT[i.status]})`).join('; ')
  throw new AppError(
    'VALIDATION',
    `These translated items are not reviewed yet: ${list}. Review them in Languages, or choose "Export unreviewed translation" to print them stamped.`,
    open,
  )
}

/** The model with player (and, when asked, controller) material in `lang`. */
export async function translatedModel(
  model: ExportModel,
  lang: SupportedLanguage,
  opts: { controller: boolean; unreviewed: boolean },
): Promise<ExportModel> {
  const { root, scenario } = model
  const docs = { ...model.docs }
  const kinds: TranslatableDoc[] = ['briefing', 'handouts']
  if (opts.controller) kinds.push(...CONTROLLER_DOCS)
  for (const kind of kinds) {
    const text = await readTranslatedDoc(root, scenario.id, kind, lang)
    if (text.trim()) docs[kind] = text
  }
  const injects = model.injects.map((i) => translatedInject(i, lang, root))
  const media = planMediaFiles(model.scenarioNo, injects)
  return {
    ...model,
    docs,
    injects,
    media,
    available: await availablePaths(root, injects, model.project.brand.logoPath),
    lang,
    unreviewed: opts.unreviewed,
  }
}
