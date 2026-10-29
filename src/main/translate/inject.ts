// An inject in a second language (spec 0435): the English inject with the translated title and
// fields over it. Kept apart from the store so the renderer can use it without file access.
import type { Inject, SupportedLanguage } from '@shared/schemas'
import { loadTemplate } from '../render/templates'
import { applyTranslation } from './fields'

/** The template schema of an inject's type; an unknown type translates its title only. */
export function schemaOf(inject: Pick<Inject, 'type'>, root: string): Record<string, unknown> {
  try {
    return loadTemplate(inject.type, root).schema
  } catch {
    return {}
  }
}

/** One inject in the language: translated title and fields, translated renders for its picture. */
export function translatedInject(inject: Inject, lang: SupportedLanguage, root: string): Inject {
  const t = inject.translations?.[lang]
  if (!t) return inject
  const own = inject.assets.filter((a) => a.role !== 'rendered' && a.role !== 'composite')
  return {
    ...inject,
    title: t.title,
    fields: applyTranslation(schemaOf(inject, root), inject.fields, t.fields),
    assets: [...own, ...t.assets],
  }
}
