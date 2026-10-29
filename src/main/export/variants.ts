// Player material in more than one language and print size (spec 0435). The regular English
// files are written by the ordinary targets; this adds the large-print English files, the
// Spanish set (regular and large print) in <folder>/es/, and the Spanish controller files.
// Spanish never goes out unless every translated item is reviewed, or the person chose the
// stamped override.
import { join } from 'node:path'
import type { ExportOptions } from '@shared/ipc'
import { AppError } from '../lib/errors'
import { assertReviewed, translatedModel } from '../translate/overlay'
import { renderTranslatedInjects } from '../translate/render'
import { buildDocumentHtml, docLabel, type ExportDoc } from './documents'
import type { ExportModel } from './model'
import { variantFileName, type DocumentFileNames } from './naming'
import { htmlToPdf } from './pdf'
import { playerInjectsView } from './views'

export type PlayerDoc = 'briefing' | 'handouts' | 'player_injects'
export type ControllerDoc = 'handbook' | 'controller_handouts'

const FILE_OF: Record<PlayerDoc | ControllerDoc, keyof DocumentFileNames> = {
  briefing: 'briefing',
  handouts: 'handouts',
  player_injects: 'playerInjects',
  handbook: 'handbook',
  controller_handouts: 'controllerHandouts',
}

/** Where Spanish files go inside the export folder (facilitator/es/ and players/es/ in the ZIP). */
export const ES_DIR = 'es'

export interface VariantState {
  model: ExportModel
  names: DocumentFileNames
  options: ExportOptions
  /** The model in Spanish; set by prepareSpanish when the export asks for Spanish. */
  es?: ExportModel
  /** English files for players/ beyond the usual ones: player injects, large print. */
  playerExtra: string[]
  /** Spanish files for players/es/. */
  playerEs: string[]
  warnings: string[]
  /** Write `data` at `rel` inside the export folder and list it among the run's files. */
  write(rel: string, data: Uint8Array): Promise<void>
}

export const wantsSpanish = (o: ExportOptions): boolean =>
  !!o.playerLanguages?.includes('es') || !!o.controllerLanguages?.includes('es')

export const wantsEnglishPlayers = (o: ExportOptions): boolean =>
  !o.playerLanguages || o.playerLanguages.includes('en')

/**
 * Refuse an export that asks for Spanish when it is not switched on or has unreviewed items.
 * Returns true when the override lets unreviewed items through (pages are stamped).
 */
export async function assertSpanishReady(
  model: ExportModel,
  options: ExportOptions,
): Promise<boolean> {
  if (!wantsSpanish(options)) return false
  if (!model.scenario.languages?.player.includes('es'))
    throw new AppError('VALIDATION', 'Spanish is not switched on for this scenario (Languages).')
  return assertReviewed(model.root, model.scenario.id, 'es', {
    controller: !!options.controllerLanguages?.includes('es'),
    allowUnreviewed: !!options.allowUnreviewed,
  })
}

/**
 * Check the Spanish translation is reviewed (refuse otherwise), render its pictures and build
 * the Spanish model. Run once before any file is written, so a refusal leaves nothing behind.
 */
export async function prepareSpanish(state: VariantState): Promise<void> {
  const { model, options } = state
  const stamped = await assertSpanishReady(model, options)
  if (!wantsSpanish(options)) return
  const controller = !!options.controllerLanguages?.includes('es')
  let source = model
  if (options.playerLanguages?.includes('es')) {
    const rendered = await renderTranslatedInjects(model, 'es')
    state.warnings.push(...rendered.warnings)
    source = { ...model, injects: rendered.injects }
  }
  state.es = await translatedModel(source, 'es', { controller, unreviewed: stamped })
}

async function writeDoc(
  state: VariantState,
  model: ExportModel,
  doc: ExportDoc,
  rel: string,
): Promise<void> {
  const html = buildDocumentHtml(model, doc, 'pdf')
  await state.write(rel, await htmlToPdf(html, docLabel(model, doc), [model.root]))
}

/** The document has something to print in this model. */
export function hasContent(model: ExportModel, doc: PlayerDoc | ControllerDoc): boolean {
  if (doc === 'player_injects') return playerInjectsView(model, '', 'pdf').cards.length > 0
  if (doc === 'handbook') return true
  return !!model.docs[doc].trim()
}

/** Large-print English, and the Spanish files (regular and large print) of one player document. */
export async function writePlayerVariants(state: VariantState, doc: PlayerDoc): Promise<void> {
  const { model, names, options } = state
  const base = names[FILE_OF[doc]]
  if (!hasContent(model, doc)) return
  const english = wantsEnglishPlayers(options)
  if (options.largePrint) {
    const name = variantFileName(base, { largePrint: true })
    await writeDoc(state, { ...model, largePrint: true }, doc, name)
    if (english) state.playerExtra.push(name)
  }
  if (!state.es || !options.playerLanguages?.includes('es') || !hasContent(state.es, doc)) return
  for (const largePrint of options.largePrint ? [false, true] : [false]) {
    const name = variantFileName(base, { lang: 'es', largePrint })
    await writeDoc(state, { ...state.es, largePrint }, doc, join(ES_DIR, name))
    state.playerEs.push(name)
  }
}

/** The Spanish handbook and controller materials, for facilitator/es/ only. */
export async function writeControllerSpanish(
  state: VariantState,
  doc: ControllerDoc,
): Promise<void> {
  if (!state.es || !state.options.controllerLanguages?.includes('es')) return
  if (!hasContent(state.es, doc)) return
  const name = variantFileName(state.names[FILE_OF[doc]], { lang: 'es' })
  await writeDoc(state, state.es, doc, join(ES_DIR, name))
}
