// Translated inject media (spec 0435 FR-9), rendered when a Spanish export runs so the
// pictures always match the reviewed text: the same template, the translated fields,
// `lang="es"` and labels/es.json, stored as assets of the translation. AI photographs are
// reused, never regenerated.
import type { Inject, SupportedLanguage } from '@shared/schemas'
import type { ExportModel } from '../export/model'
import { toAppError } from '../lib/errors'
import { renderInjectTranslation } from '../render/inject'
import { saveInject } from '../scenario/store'
import { playerInjects } from './scope'

export interface RenderedTranslations {
  injects: Inject[]
  warnings: string[]
}

/** Render the translation of every player inject that has one; failures become warnings. */
export async function renderTranslatedInjects(
  model: ExportModel,
  lang: SupportedLanguage,
): Promise<RenderedTranslations> {
  const wanted = new Set(playerInjects(model.scenario, model.injects).map((i) => i.id))
  const warnings: string[] = []
  const injects: Inject[] = []
  for (const inject of model.injects) {
    if (!wanted.has(inject.id) || !inject.translations?.[lang]) {
      injects.push(inject)
      continue
    }
    try {
      const translation = await renderInjectTranslation(
        model.root,
        model.scenario.id,
        inject,
        lang,
        { brand: model.project.brand },
      )
      const next = { ...inject, translations: { ...inject.translations, [lang]: translation } }
      const saved = await saveInject(model.root, model.scenario.id, next, {
        by: 'user',
        snapshot: false,
      })
      injects.push(saved)
    } catch (e) {
      warnings.push(
        `${inject.mselRowId}: translated picture not rendered (${toAppError(e).message})`,
      )
      injects.push(inject)
    }
  }
  return { injects, warnings }
}
