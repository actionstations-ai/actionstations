// Which inject type a MSEL row becomes. Control rows (STARTEX / TIME_JUMP / ENDEX) always
// become control cards; every other row keeps its format when a template exists for it and
// otherwise falls back along a deterministic chain of the closest template-backed types.
// When nothing in the chain is installed the row keeps its taxonomy type with no template:
// the model then fills the taxonomy's key fields and the page is listed as text-only.
import type { MselRow } from '@shared/schemas'
import { INJECT_TYPE_IDS, injectTypeInfo } from '@shared/taxonomy'

export const CONTROL_TYPES: Partial<Record<MselRow['purposeTag'], string>> = {
  STARTEX: 'startex_card',
  TIME_JUMP: 'time_jump_card',
  ENDEX: 'endex_card',
}

/** Closest template-backed substitutes, best first (docs/03 categories). */
export const TYPE_FALLBACKS: Record<string, string[]> = {
  tweet: ['facebook_post', 'text_message'],
  facebook_post: ['tweet', 'reddit_post'],
  instagram_post: ['tweet', 'facebook_post'],
  tiktok_video_card: ['tweet', 'instagram_post'],
  reddit_post: ['facebook_post', 'tweet'],
  social_video: ['tiktok_video_card', 'tweet'],
  press_release: ['memo', 'official_letter'],
  news_chyron_still: ['news_article', 'tweet'],
  news_article: ['press_release', 'memo'],
  media_inquiry_phone_slip: ['reporter_email', 'email'],
  reporter_email: ['email', 'media_inquiry_phone_slip'],
  email: ['memo', 'email_forward'],
  email_forward: ['email', 'memo'],
  memo: ['email', 'official_letter'],
  helpdesk_ticket: ['email', 'memo'],
  chat_transcript: ['text_message', 'email'],
  text_message: ['chat_transcript', 'tweet'],
  voicemail: ['phone_call', 'media_inquiry_phone_slip'],
  radio_call: ['phone_call', 'scenario_update'],
  phone_call: ['radio_call', 'scenario_update'],
  pa_announcement: ['scenario_update', 'phone_call'],
  '911_cad_entry': ['system_log', 'memo'],
  system_log: ['console_dump', 'siem_alert'],
  siem_alert: ['system_log', 'email'],
  console_dump: ['system_log', 'error_dialog'],
  error_dialog: ['system_log', 'screenshot_generic'],
  network_diagram: ['memo', 'system_log'],
  email_header_analysis: ['email', 'system_log'],
  ransom_note: ['error_dialog', 'memo'],
  screenshot_generic: ['error_dialog', 'system_log'],
  fids_board: ['status_board', 'scene_photo'],
  bhs_scada_screen: ['status_board', 'system_log'],
  pacs_alarm_panel: ['status_board', 'siem_alert'],
  cctv_still: ['scene_photo', 'signage_photo'],
  scene_photo: ['cctv_still', 'signage_photo'],
  map_annotation: ['scene_photo', 'memo'],
  signage_photo: ['scene_photo', 'cctv_still'],
  official_letter: ['memo', 'regulatory_notice'],
  regulatory_notice: ['official_letter', 'memo'],
  ics_201_prefill: ['sitrep', 'memo'],
  ics_203_prefill: ['ics_201_prefill', 'memo'],
  status_board: ['sitrep', 'memo'],
  sitrep: ['memo', 'scenario_update'],
  startex_card: ['scenario_update', 'time_jump_card'],
  time_jump_card: ['scenario_update', 'startex_card'],
  scenario_update: ['time_jump_card', 'memo'],
  endex_card: ['scenario_update', 'time_jump_card'],
  simcell_script: ['scenario_update', 'memo'],
}

/** Key fields per type for rows whose type has no installed template (docs/03 table). */
export const KEY_FIELDS: Record<string, string> = {
  tweet: 'handle, displayName, text, timestampRel, metrics{replies,reposts,likes}',
  facebook_post: 'groupName, authorName, text, shares, reactions, comments[]',
  instagram_post: 'handle, caption, likes',
  tiktok_video_card: 'handle, caption, viewCount',
  reddit_post: 'subreddit, title, body, upvotes, commentCount',
  social_video: 'platform, caption, durationSec',
  press_release: 'org, dateline, headline, subhead, body, mediaContact, boilerplate',
  news_chyron_still: 'station, headline, lowerThird, liveBadge',
  news_article: 'outlet, headline, byline, dek, body',
  media_inquiry_phone_slip: 'to, fromName, outlet, desk, time, message, deadline',
  reporter_email: 'outlet, reporterName, subject, body, deadline',
  email: 'from, to, cc, subject, body, attachments[]',
  email_forward: 'forwarderNote, from, to, subject, body',
  memo: 'from, to, subject, urgency, body, signatureBlock',
  helpdesk_ticket: 'ticketNo, priority, requester, subject, description, status, assignee',
  chat_transcript: 'platform, participants[], messages[{sender,time,text}]',
  text_message: 'fromLabel, bubbles[{from,text,time}]',
  voicemail: 'caller, durationSec, transcript',
  radio_call: 'channel, callsign, transcript, background',
  phone_call: 'caller, callee, transcript',
  pa_announcement: 'text, voiceStyle',
  '911_cad_entry': 'time, caller, location, narrative',
  system_log: 'systemName, host, ip, os, lines[{ts,level,msg}]',
  siem_alert: 'product, severity, rule, source, dest, details',
  console_dump: 'prompt, commands[], output',
  error_dialog: 'os, title, message, buttons[]',
  network_diagram: 'mermaid',
  email_header_analysis: 'rawHeaders, highlights[]',
  ransom_note: 'text, wallet, timer',
  screenshot_generic: 'appName, windowTitle, caption',
  fids_board: 'rows[{flight,dest,time,gate,status}], anomalies[], boardStyle',
  bhs_scada_screen: 'belts[], alarms[], state',
  pacs_alarm_panel: 'doors[], alarms[]',
  cctv_still: 'camera, timestamp, sceneBrief',
  scene_photo: 'sceneBrief, style, caption',
  map_annotation: 'markers[], labels[]',
  signage_photo: 'text, placement',
  official_letter: 'letterhead, to, from, date, body',
  regulatory_notice: 'agency, noticeType, text',
  ics_201_prefill: 'incidentName, situationSummary, objectives[]',
  ics_203_prefill: 'assignments[]',
  status_board: 'resources[{name,status,notes}]',
  sitrep: 'number, time, summary, actions[]',
  startex_card: 'exerciseTime, weather, load, status, narration',
  time_jump_card: 'newTime, narration, worldState[]',
  scenario_update: 'narration',
  endex_card: 'resolution, transition',
  simcell_script: 'rolePlayed, hardQuestions[], concessions[]',
}

export interface TypeChoice {
  type: string
  /** A template for `type` is installed (fields are validated against its schema). */
  hasTemplate: boolean
  /** The type the row asked for, when a fallback was used. */
  requested?: string
}

const isKnownType = (id: string): boolean => INJECT_TYPE_IDS.includes(id)

/** Deterministic: the first installed type along the fallback chain, else the type itself. */
export function chooseInjectType(row: MselRow, installed: Iterable<string>): TypeChoice {
  const have = new Set(installed)
  const control = CONTROL_TYPES[row.purposeTag]
  const format = row.format?.trim() ?? ''
  const requested = control ?? (isKnownType(format) ? format : 'scenario_update')
  if (have.has(requested)) return { type: requested, hasTemplate: true }
  for (const alt of TYPE_FALLBACKS[requested] ?? []) {
    if (have.has(alt)) return { type: alt, hasTemplate: true, requested }
  }
  return { type: requested, hasTemplate: false }
}

export function defaultDelivery(
  type: string,
): NonNullable<ReturnType<typeof injectTypeInfo>>['defaultDelivery'] {
  return injectTypeInfo(type)?.defaultDelivery ?? 'hand_to_role'
}

// ---- JSON Schema → prompt hints ------------------------------------------------------------

type JsonSchema = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function typeLabel(s: JsonSchema): string {
  const t = s.type
  if (Array.isArray(s.enum)) return `one of ${s.enum.map((e) => JSON.stringify(e)).join(' | ')}`
  if (t === 'array') {
    const items = (s.items ?? {}) as JsonSchema
    return items.type === 'object'
      ? `array of {${objectKeys(items)}}`
      : `array of ${str(items.type) || 'string'}`
  }
  if (t === 'object') return `object {${objectKeys(s)}}`
  return str(t) || 'string'
}

function objectKeys(s: JsonSchema): string {
  const props = (s.properties ?? {}) as Record<string, JsonSchema>
  return Object.entries(props)
    .map(([k, v]) => `${k}: ${typeLabel(v)}`)
    .join(', ')
}

/**
 * One line per field: name, type, required, description, example. This is what the model
 * sees, so it fills `fields` exactly as the template expects (additionalProperties: false).
 */
export function schemaHints(schema: JsonSchema): string {
  const props = (schema.properties ?? {}) as Record<string, JsonSchema>
  const required = new Set((schema.required as string[] | undefined) ?? [])
  return Object.entries(props)
    .map(([name, s]) => {
      const parts = [`${name} (${typeLabel(s)}${required.has(name) ? ', required' : ''})`]
      if (str(s.description)) parts.push(str(s.description))
      const ex = Array.isArray(s.examples) ? s.examples[0] : undefined
      if (ex !== undefined) parts.push(`e.g. ${JSON.stringify(ex)}`)
      return `- ${parts.join(' — ')}`
    })
    .join('\n')
}
