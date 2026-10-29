// translate:* and project:glossary:set (spec 0435): player-language translation with a
// person's review. The Languages panel reads translate:status, starts translate:run (a job of
// kind 'translate') and reviews item by item.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import {
  GlossaryEntry,
  MAX_GLOSSARY_ENTRIES,
  ScenarioLanguages,
  SupportedLanguage,
  TranslatableDoc,
} from '../schemas/translation'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })
const SL = S.extend({ lang: SupportedLanguage })

export const ItemRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('doc'), id: TranslatableDoc }),
  z.object({ kind: z.literal('inject'), id: SafeId }),
])
export type ItemRef = z.infer<typeof ItemRef>

export const TranslationItemView = z.object({
  kind: z.enum(['doc', 'inject']),
  id: z.string(),
  label: z.string(),
  status: z.enum(['missing', 'machine', 'reviewed', 'stale']),
  /** Glossary terms the translation does not use. */
  flags: z.array(z.string()),
})
export type TranslationItemView = z.infer<typeof TranslationItemView>

/** The provider a Translate run would send text to, named before it runs (NFR-2). */
export const TranslateRoute = z.object({
  providerLabel: z.string(),
  model: z.string().optional(),
  cloud: z.boolean(),
})
export type TranslateRoute = z.infer<typeof TranslateRoute>

export const TranslationStatusView = z.object({
  languages: ScenarioLanguages,
  items: z.array(TranslationItemView),
  route: TranslateRoute.nullable(),
  /** Defaults plus the project's own entries. */
  glossary: z.array(GlossaryEntry),
})
export type TranslationStatusView = z.infer<typeof TranslationStatusView>

/** One item side by side: the English and its translation. */
export const TranslationItemText = z.object({
  kind: z.enum(['doc', 'inject']),
  id: z.string(),
  label: z.string(),
  status: z.enum(['missing', 'machine', 'reviewed', 'stale']),
  flags: z.array(z.string()),
  /** Documents: the English and the translated Markdown. */
  source: z.string().optional(),
  translated: z.string().optional(),
  /** Injects: title and translatable fields, English and translated, in the same shape. */
  sourceFields: z.record(z.string(), z.unknown()).optional(),
  translatedFields: z.record(z.string(), z.unknown()).optional(),
  sourceTitle: z.string().optional(),
  translatedTitle: z.string().optional(),
})
export type TranslationItemText = z.infer<typeof TranslationItemText>

export const translateChannels = {
  'translate:status': channel(SL, TranslationStatusView),
  'translate:get-item': channel(SL.extend({ item: ItemRef }), TranslationItemText),
  /** Start the job: every item that needs it, or the listed ones (`retranslate` redoes reviewed ones too). */
  'translate:run': channel(
    SL.extend({ items: z.array(ItemRef).max(500).optional(), retranslate: z.boolean().optional() }),
    z.object({ jobId: SafeId }),
  ),
  /** Save an edited translation; the item becomes reviewed. */
  'translate:save-item': channel(
    SL.extend({
      item: ItemRef,
      markdown: z.string().max(500_000).optional(),
      title: z.string().max(1000).optional(),
      fields: z.record(z.string(), z.unknown()).optional(),
    }),
    z.void(),
  ),
  /** Mark items reviewed; all in scope when `items` is omitted (stale ones are never accepted that way). */
  'translate:accept': channel(
    SL.extend({ items: z.array(ItemRef).max(500).optional() }),
    z.object({ accepted: z.number().int() }),
  ),
  'translate:set-languages': channel(S.extend({ languages: ScenarioLanguages }), z.void()),
  'project:glossary:set': channel(
    z.object({
      projectPath: z.string(),
      lang: SupportedLanguage,
      entries: z.array(GlossaryEntry).max(MAX_GLOSSARY_ENTRIES),
    }),
    z.void(),
  ),
}
