// Player-language translation (spec 0435): which languages a scenario carries, and the review
// state of every translated item. English is always the source language.
import { z } from 'zod'
import { IsoDateTime, RelPath } from './common'
import { MediaAsset } from './media'

/** Languages the model can translate into. Left-to-right only (spec 0435 FR-18). */
export const SupportedLanguage = z.enum(['es'])
export type SupportedLanguage = z.infer<typeof SupportedLanguage>

/** `machine` = fresh from the model, `reviewed` = a person accepted it, `stale` = the English changed. */
export const TranslationStatus = z.enum(['machine', 'reviewed', 'stale'])
export type TranslationStatus = z.infer<typeof TranslationStatus>

export const TRANSLATABLE_DOCS = [
  'briefing',
  'handouts',
  'handbook',
  'controller_handouts',
] as const
export const TranslatableDoc = z.enum(TRANSLATABLE_DOCS)
export type TranslatableDoc = z.infer<typeof TranslatableDoc>

/** Documents players read; the rest are controller material (translated only on request). */
export const PLAYER_DOCS: readonly TranslatableDoc[] = ['briefing', 'handouts']

export const DocTranslation = z.object({
  /** Project-relative path, e.g. scenarios/<id>/documents/briefing.es.md */
  path: RelPath,
  sourceHash: z.string(),
  status: TranslationStatus,
  updatedAt: IsoDateTime,
})
export type DocTranslation = z.infer<typeof DocTranslation>

export const ScenarioLanguages = z.object({
  /** Extra player languages; one at most in this release. */
  player: z.array(SupportedLanguage).max(1).default([]),
  /** Also translate controller material (off by default). */
  controller: z.boolean().default(false),
})
export type ScenarioLanguages = z.infer<typeof ScenarioLanguages>

export const ScenarioTranslations = z.partialRecord(
  SupportedLanguage,
  z.object({ documents: z.partialRecord(TranslatableDoc, DocTranslation).default({}) }),
)
export type ScenarioTranslations = z.infer<typeof ScenarioTranslations>

export const InjectTranslation = z.object({
  title: z.string(),
  /** Only the translatable keys (spec 0435 FR-3); merged over the English fields when used. */
  fields: z.record(z.string(), z.unknown()),
  sourceHash: z.string(),
  status: TranslationStatus,
  /** Renders of the template with the translated fields. */
  assets: z.array(MediaAsset).default([]),
  updatedAt: IsoDateTime,
})
export type InjectTranslation = z.infer<typeof InjectTranslation>

export const GlossaryEntry = z.object({
  term: z.string().min(1).max(200),
  translation: z.string().min(1).max(200),
})
export type GlossaryEntry = z.infer<typeof GlossaryEntry>
export const MAX_GLOSSARY_ENTRIES = 500

export const ProjectGlossary = z.partialRecord(
  SupportedLanguage,
  z.array(GlossaryEntry).max(MAX_GLOSSARY_ENTRIES),
)
export type ProjectGlossary = z.infer<typeof ProjectGlossary>

/** Default glossary: the exercise marking. Confirm against FEMA Spanish exercise material before release. */
export const DEFAULT_GLOSSARY: Record<SupportedLanguage, GlossaryEntry[]> = {
  es: [{ term: 'EXERCISE', translation: 'EJERCICIO' }],
}
