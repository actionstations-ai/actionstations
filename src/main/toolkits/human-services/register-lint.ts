// The behavioral health safeguards (spec 0464 FR-13) as field lint rules: an inject whose text
// breaks safe messaging, shows a real helpline number without the EXERCISE banner or tells a
// player to call a real line goes back to the model with the issue named. Importing this module
// registers them (lint-rules.ts lists it).
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  lintHelplineBanner,
  lintNoRealLineForPlayers,
  lintSafeMessaging,
  type SafeguardProblem,
} from './safeguards-lint'
import {
  lint988Routing,
  lintCrisisCounselingDurations,
  lintFnssIntegration,
  lintReleaseIdentity,
} from './lint'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Every string in `value`, depth first, skipping drawn `figures` data. */
export function fieldStrings(value: unknown, out: string[] = [], key = ''): string[] {
  if (key === 'figures') return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) fieldStrings(v, out)
  else if (isRecord(value)) for (const [k, v] of Object.entries(value)) fieldStrings(v, out, k)
  return out
}

/** Text-bearing types that can carry crisis or helpline content. */
const TEXT_TYPES = [
  'hotline_call_notes',
  'chat_transcript',
  'phone_call',
  'radio_call',
  'sitrep',
  'memo',
  'email',
  'press_release',
  'public_information_statement',
  'push_alert',
  'facebook_post',
  'instagram_post',
  'reddit_post',
  'tweet',
  'news_article',
  'media_inquiry_phone_slip',
  'correction_notice',
  'official_letter',
  'field_report',
  'reunification_notice',
  'content_notice_card',
  'facilitator_wellbeing_check',
  'pfa_handout',
  'hs_contact_summary',
  'hs_supervisor_escalation',
  'hs_state_coordinator_briefing',
  'hs_network_surge_notice',
  'hs_backup_activation_notice',
  'hs_daily_contact_report',
  'hs_queue_wait_board',
  'hs_staffing_coverage_summary',
] as const

/** Shelter and reunification products, which the broader text rules also read. */
const SHELTER_TYPES = [
  'hs_shelter_status_report',
  'hs_open_shelters_list',
  'hs_fnss_support_request',
  'hs_shelter_registration_form',
  'hs_shelter_daily_count',
  'hs_shelter_incident_report',
  'hs_shelter_health_referral',
  'hs_shelter_closing_report',
  'hs_eoc_mass_care_request',
] as const

const CRISIS_COUNSELING_TYPES = [
  'hs_crisis_counseling_request',
  'hs_state_disaster_plan_notice',
  'sitrep',
  'memo',
  'email',
  'press_release',
  'official_letter',
] as const

/** Types the public sees: a real helpline number there needs the banner. */
const PUBLIC_TYPES = [
  'press_release',
  'public_information_statement',
  'push_alert',
  'facebook_post',
  'instagram_post',
  'reddit_post',
  'tweet',
  'news_article',
  'correction_notice',
  'reunification_notice',
  'pfa_handout',
  'content_notice_card',
  'hs_parent_notification_text',
] as const

function rule(
  id: string,
  injectTypes: readonly string[],
  check: (text: string) => SafeguardProblem[],
): FieldLintRule {
  return {
    id,
    injectTypes,
    check(fields): FieldLintIssue[] {
      const text = fieldStrings(fields).join('\n')
      return check(text).map((p): FieldLintIssue => ({ path: 'fields', message: p.message }))
    },
  }
}

export const HS_FORMAT_RULES: FieldLintRule[] = [
  rule('hs_988_routing', TEXT_TYPES, lint988Routing),
  rule('hs_fnss_integration', [...SHELTER_TYPES, ...TEXT_TYPES], lintFnssIntegration),
  rule('hs_crisis_counseling_duration', CRISIS_COUNSELING_TYPES, lintCrisisCounselingDurations),
  {
    id: 'hs_release_identity',
    injectTypes: ['hs_release_log'],
    check: (fields): FieldLintIssue[] =>
      lintReleaseIdentity(fields.entries).map((p) => ({
        path: 'fields.entries',
        message: p.message,
      })),
  },
]

export const HS_SAFEGUARD_RULES = [
  rule('hs_safe_messaging', TEXT_TYPES, lintSafeMessaging),
  rule('hs_exercise_helpline', PUBLIC_TYPES, lintHelplineBanner),
  rule('hs_no_real_line_for_players', TEXT_TYPES, lintNoRealLineForPlayers),
]

for (const r of [...HS_SAFEGUARD_RULES, ...HS_FORMAT_RULES]) registerFieldLintRule(r)
