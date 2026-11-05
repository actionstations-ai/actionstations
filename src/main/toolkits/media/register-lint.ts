// The media environment's `media.*` format rules, registered with the field lint registry so
// they run on the injects of the types the toolkit adds (spec 0458 FR-4). Importing this module
// registers them; lint-rules.ts lists it. Only types the toolkit adds are named, so a scenario
// without it is checked exactly as before.
import { registerFieldLintRule, type FieldLintRule } from '../field-lint'
import { ATTRIBUTION_TYPES, lintMediaInject, type MediaIssue } from './lint'

const ALL_TYPES = [
  'broadcast_rundown',
  'correction_notice',
  'holding_statement',
  'jic_schedule',
  'live_blog',
  'media_advisory',
  'media_inquiry_phone_slip',
  'message_map',
  'news_article',
  'news_chyron_still',
  'push_alert',
  'reporter_email',
  'verification_note',
  'wire_alert',
] as const

/** A rule over the types it reads: the toolkit's checks for one such type, this rule's findings. */
function rule(id: string, injectTypes: readonly string[]): FieldLintRule {
  return {
    id,
    injectTypes,
    check: (fields) =>
      lintMediaInject(injectTypes[0]!, fields)
        .filter((i: MediaIssue) => i.rule === id)
        .map((i) => ({ path: 'fields', message: i.message })),
  }
}

const ATTRIBUTED = ALL_TYPES.filter((t) => ATTRIBUTION_TYPES.has(t))

for (const r of [
  rule('media.attribution', ATTRIBUTED),
  rule('media.clock', ALL_TYPES),
  rule('media.correction', ['correction_notice']),
  rule('media.holding_statement', ['holding_statement']),
  rule('media.fictional_names', ALL_TYPES),
])
  registerFieldLintRule(r)
