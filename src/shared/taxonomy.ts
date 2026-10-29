// Inject taxonomy (docs/03-INJECT-TAXONOMY.md). Source of truth for purpose tags,
// inject types, and how each type renders. Template field schemas live beside each
// template in templates/injects/<type>/schema.json.
import { z } from 'zod'

export const PURPOSE_TAGS = [
  'STARTEX',
  'CORE_NARRATIVE',
  'NOISE',
  'RED_HERRING',
  'PRESSURE',
  'MISINFORMATION',
  'CLUE',
  'TECH_HURDLE',
  'DECISION_POINT',
  'OPERATIONAL_FRICTION',
  'CONFUSION',
  'DISTRACTION',
  'TIME_JUMP',
  'END_GAME',
  'ENDEX',
] as const
export const PurposeTag = z.enum(PURPOSE_TAGS)
export type PurposeTag = z.infer<typeof PurposeTag>

export const PURPOSE_TAG_INFO: Record<PurposeTag, { label: string; meaning: string }> = {
  STARTEX: { label: 'STARTEX', meaning: 'Exercise start; sets baseline conditions' },
  CORE_NARRATIVE: { label: 'Core narrative', meaning: 'Advances the main storyline' },
  NOISE: { label: 'Noise', meaning: 'Distraction unrelated to the incident; tests triage' },
  RED_HERRING: { label: 'Red herring', meaning: 'Plausible but false lead; drains resources' },
  PRESSURE: { label: 'Pressure', meaning: 'External stakeholder demands a response now' },
  MISINFORMATION: { label: 'Misinformation', meaning: 'Rumor the PIO must counter' },
  CLUE: { label: 'Clue', meaning: 'Forensic or attribution breadcrumb' },
  TECH_HURDLE: { label: 'Tech hurdle', meaning: 'Recovery complication' },
  DECISION_POINT: { label: 'Decision point', meaning: 'Forces a high-consequence call' },
  OPERATIONAL_FRICTION: { label: 'Operational friction', meaning: 'Tenant or partner conflict' },
  CONFUSION: { label: 'Confusion', meaning: 'Physical-security side effect' },
  DISTRACTION: { label: 'Distraction', meaning: 'Public-sentiment noise aimed at the PIO' },
  TIME_JUMP: { label: 'Time jump', meaning: 'Facilitator control card that advances the clock' },
  END_GAME: { label: 'End game', meaning: 'Resolution inject leading to ENDEX' },
  ENDEX: { label: 'ENDEX', meaning: 'Exercise end; transition to hot wash' },
}

export const INJECT_CATEGORIES = [
  'social',
  'news',
  'internal',
  'voice',
  'technical',
  'operational',
  'documents',
  'control',
] as const
export type InjectCategory = (typeof INJECT_CATEGORIES)[number]

/** Delivery methods in the HSEEP MSEL sense (#420): how an inject reaches the players. */
export const DELIVERY_METHODS = [
  'Phone',
  'Radio',
  'Email',
  'Social media',
  'Document / handout',
  'Visual (main screen)',
  'Audio',
  'Verbal / facilitator',
] as const
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]
export const DEFAULT_DELIVERY_METHOD: DeliveryMethod = 'Verbal / facilitator'

/** How an inject type's media is produced. T = HTML template, AI = ComfyUI image/video, TTS = voice. */
export type RenderPath = 'template' | 'ai_image' | 'ai_video' | 'tts'

export interface InjectTypeInfo {
  id: string
  label: string
  category: InjectCategory
  render: RenderPath[]
  /** Paper-style injects also export a PDF page. */
  paper: boolean
  /** Part of the M2/M3 minimum viable template set. */
  mvp: boolean
  defaultDelivery: 'hand_to_role' | 'display_main_screen' | 'play_audio' | 'read_aloud'
  /**
   * How the inject reaches players, as the Excel MSEL's Delivery Method column names it (#420).
   * Absent: derived from the category (CATEGORY_DELIVERY_METHOD).
   */
  deliveryMethod?: DeliveryMethod
  /**
   * Domain profile ids this type belongs to (src/shared/domains). Absent = every domain.
   * A domain-tagged type is offered only to projects of those domains (type-map.ts).
   */
  domains?: string[]
  /**
   * Where a type that is not built in comes from (ADR-0018 template layers): its template's
   * layer and, for packs and project copies of pack templates, the pack. Absent = built-in.
   */
  source?: 'project' | 'user' | 'pack'
  pack?: { id: string; version: string; name?: string; bundled?: boolean }
}

const t = (
  id: string,
  label: string,
  category: InjectCategory,
  render: RenderPath[],
  opts: Partial<
    Pick<InjectTypeInfo, 'paper' | 'mvp' | 'defaultDelivery' | 'domains' | 'deliveryMethod'>
  > = {},
): InjectTypeInfo => ({
  id,
  label,
  category,
  render,
  paper: opts.paper ?? false,
  mvp: opts.mvp ?? false,
  defaultDelivery: opts.defaultDelivery ?? 'hand_to_role',
  ...(opts.domains ? { domains: opts.domains } : {}),
  ...(opts.deliveryMethod ? { deliveryMethod: opts.deliveryMethod } : {}),
})

export const INJECT_TYPES: readonly InjectTypeInfo[] = [
  // Social media
  t('tweet', 'Tweet / X post', 'social', ['template', 'ai_image'], { mvp: true }),
  t('facebook_post', 'Facebook post', 'social', ['template', 'ai_image'], { mvp: true }),
  t('instagram_post', 'Instagram post', 'social', ['template', 'ai_image']),
  t('tiktok_video_card', 'TikTok video card', 'social', ['template', 'ai_image', 'ai_video']),
  t('reddit_post', 'Reddit post', 'social', ['template']),
  t('social_video', 'Social video clip', 'social', ['ai_video'], {
    defaultDelivery: 'display_main_screen',
  }),
  // News & press
  t('press_release', 'Press release', 'news', ['template'], { paper: true }),
  t('news_chyron_still', 'TV news still', 'news', ['template', 'ai_image'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('news_article', 'News article', 'news', ['template', 'ai_image']),
  t('media_inquiry_phone_slip', 'Phone message slip', 'news', ['template'], {
    paper: true,
    mvp: true,
    deliveryMethod: 'Phone',
  }),
  t('reporter_email', 'Reporter email', 'news', ['template'], { deliveryMethod: 'Email' }),
  // Internal communications
  t('email', 'Email', 'internal', ['template'], { mvp: true }),
  t('email_forward', 'Email forward', 'internal', ['template'], { mvp: true }),
  t('memo', 'Memo', 'internal', ['template'], {
    paper: true,
    mvp: true,
    deliveryMethod: 'Document / handout',
  }),
  t('helpdesk_ticket', 'Helpdesk ticket', 'internal', ['template'], { mvp: true }),
  t('chat_transcript', 'Chat transcript', 'internal', ['template'], {
    deliveryMethod: 'Document / handout',
  }),
  t('text_message', 'Text message', 'internal', ['template'], { deliveryMethod: 'Phone' }),
  t('voicemail', 'Voicemail', 'internal', ['tts', 'template'], {
    defaultDelivery: 'play_audio',
    deliveryMethod: 'Phone',
  }),
  // Voice & radio
  t('radio_call', 'Radio call', 'voice', ['tts', 'template'], {
    mvp: true,
    deliveryMethod: 'Radio',
  }),
  t('phone_call', 'Phone call', 'voice', ['tts', 'template'], { defaultDelivery: 'read_aloud' }),
  t('pa_announcement', 'PA announcement', 'voice', ['tts'], {
    defaultDelivery: 'play_audio',
    deliveryMethod: 'Audio',
  }),
  t('911_cad_entry', '911 CAD entry', 'voice', ['template'], {
    deliveryMethod: 'Document / handout',
  }),
  // Technical evidence
  t('system_log', 'System log', 'technical', ['template'], { paper: true, mvp: true }),
  t('siem_alert', 'SIEM alert', 'technical', ['template']),
  t('console_dump', 'Console dump', 'technical', ['template'], { paper: true }),
  t('error_dialog', 'Error dialog', 'technical', ['template'], { mvp: true }),
  t('network_diagram', 'Network diagram', 'technical', ['template']),
  t('email_header_analysis', 'Email header analysis', 'technical', ['template']),
  t('ransom_note', 'Ransom note', 'technical', ['template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('screenshot_generic', 'Generic screenshot', 'technical', ['template', 'ai_image']),
  t('service_status_page', 'Public status page / outage banner', 'technical', ['template']),
  t('leak_site_post', 'Ransomware leak-site post', 'technical', ['template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('security_advisory', 'Security advisory (CISA / ISAC / vendor)', 'technical', ['template'], {
    paper: true,
  }),
  t('hl7_interface_monitor', 'HL7 interface engine monitor', 'technical', ['template'], {
    defaultDelivery: 'display_main_screen',
    domains: ['healthcare'],
  }),
  t('election_results_page', 'Election night results page', 'technical', ['template'], {
    defaultDelivery: 'display_main_screen',
    domains: ['elections'],
  }),
  // Operational displays & physical
  t('fids_board', 'FIDS board', 'operational', ['template'], {
    mvp: true,
    defaultDelivery: 'display_main_screen',
    domains: ['airport'],
  }),
  t('bhs_scada_screen', 'BHS SCADA screen', 'operational', ['template'], {
    domains: ['airport'],
  }),
  t('info_display_board', 'Information display board', 'operational', ['template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('scada_hmi', 'SCADA / process HMI', 'operational', ['template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('uas_detection_alert', 'UAS / drone detection alert', 'operational', ['template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('avl_fleet_map', 'AVL fleet map', 'operational', ['template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('incident_alert_notification', 'Mass-notification alert', 'operational', ['template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('pacs_alarm_panel', 'PACS alarm panel', 'operational', ['template']),
  t('cctv_still', 'CCTV still', 'operational', ['ai_image', 'template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('scene_photo', 'Scene photo', 'operational', ['ai_image', 'template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('map_annotation', 'Annotated map', 'operational', ['template']),
  t('signage_photo', 'Signage photo', 'operational', ['ai_image', 'template']),
  t('alarm_summary', 'Alarm summary (DCS / NOC / BMS)', 'operational', ['template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('nws_weather_warning', 'NWS weather warning', 'operational', ['template']),
  t('notam', 'NOTAM / TFR', 'operational', ['template'], {
    domains: ['airport', 'stadium_venue', 'unmanned_systems'],
  }),
  t('rider_service_alert', 'Rider service alert', 'operational', ['template'], {
    domains: ['transit'],
  }),
  t('gcs_telemetry_screen', 'UAS ground control station screen', 'operational', ['template'], {
    defaultDelivery: 'display_main_screen',
    domains: ['unmanned_systems'],
  }),
  t('track_bulletin', 'Track bulletin / track warrant', 'operational', ['template'], {
    paper: true,
    domains: ['freight_rail'],
  }),
  // Documents & forms
  t('official_letter', 'Official letter', 'documents', ['template'], { paper: true }),
  t('regulatory_notice', 'Regulatory notice', 'documents', ['template'], { paper: true }),
  t('ics_201_prefill', 'ICS-201 (pre-filled)', 'documents', ['template'], {
    paper: true,
    mvp: true,
  }),
  t('ics_203_prefill', 'ICS-203 (pre-filled)', 'documents', ['template'], { paper: true }),
  t('status_board', 'Status board', 'documents', ['template']),
  t('sitrep', 'SITREP', 'documents', ['template'], { paper: true }),
  t('field_report', 'Field / inspection report', 'documents', ['template'], { paper: true }),
  t('ics_213_general_message', 'ICS 213 General Message', 'documents', ['template'], {
    paper: true,
  }),
  t('ics_214_activity_log', 'ICS 214 Activity Log', 'documents', ['template'], { paper: true }),
  t('chain_of_custody_form', 'Chain of custody form', 'documents', ['template'], { paper: true }),
  t('regulatory_report_form', 'Regulatory incident report', 'documents', ['template'], {
    paper: true,
  }),
  t('lab_result_report', 'Laboratory result report', 'documents', ['template'], { paper: true }),
  t('breach_notification_letter', 'Breach notification letter', 'documents', ['template'], {
    paper: true,
  }),
  t('downtime_notice', 'System downtime notice', 'documents', ['template'], { paper: true }),
  t('boil_water_notice', 'Boil water / do not drink notice', 'documents', ['template'], {
    paper: true,
    domains: ['water_utility', 'public_health', 'municipal'],
  }),
  t('wire_transfer_request', 'Wire transfer / payment change request', 'documents', ['template'], {
    paper: true,
  }),
  t('sds_excerpt', 'Safety Data Sheet excerpt', 'documents', ['template'], { paper: true }),
  t('emergency_declaration', 'Local emergency declaration', 'documents', ['template'], {
    paper: true,
  }),
  t('reunification_notice', 'Family reunification notice / card', 'documents', ['template'], {
    paper: true,
  }),
  t('msib_cotp_order', 'USCG MSIB / Captain of the Port order', 'documents', ['template'], {
    paper: true,
    domains: ['port_maritime'],
  }),
  // Facilitator control
  t('startex_card', 'STARTEX card', 'control', ['template'], {
    paper: true,
    mvp: true,
    defaultDelivery: 'read_aloud',
  }),
  t('time_jump_card', 'Time jump card', 'control', ['template'], {
    paper: true,
    mvp: true,
    defaultDelivery: 'read_aloud',
  }),
  t('scenario_update', 'Scenario update', 'control', ['template'], {
    paper: true,
    defaultDelivery: 'read_aloud',
  }),
  t('endex_card', 'ENDEX card', 'control', ['template'], {
    paper: true,
    mvp: true,
    defaultDelivery: 'read_aloud',
  }),
  t('simcell_script', 'SimCell script', 'control', ['template'], { paper: true }),
] as const

/** Delivery method of a type without its own (#420). */
export const CATEGORY_DELIVERY_METHOD: Record<InjectCategory, DeliveryMethod> = {
  social: 'Social media',
  news: 'Document / handout',
  internal: 'Email',
  voice: 'Phone',
  technical: 'Document / handout',
  operational: 'Visual (main screen)',
  documents: 'Document / handout',
  control: 'Verbal / facilitator',
}

/**
 * The Excel MSEL's Delivery Method for a row (#420): the inject's delivery mode wins when it
 * says how the room receives it (main screen, audio, read aloud), except that a phone or radio
 * type stays Phone or Radio; otherwise the type's method; "Verbal / facilitator" when the type
 * is unknown or absent.
 */
export function deliveryMethodFor(
  format: string | undefined,
  deliveryMode?: InjectTypeInfo['defaultDelivery'],
): DeliveryMethod {
  const info = format ? injectTypeInfo(format) : undefined
  const own = info ? (info.deliveryMethod ?? CATEGORY_DELIVERY_METHOD[info.category]) : undefined
  if (own === 'Phone' || own === 'Radio') return own
  if (deliveryMode === 'display_main_screen') return 'Visual (main screen)'
  if (deliveryMode === 'play_audio') return 'Audio'
  if (deliveryMode === 'read_aloud') return 'Verbal / facilitator'
  return own ?? DEFAULT_DELIVERY_METHOD
}

/** The built-in type ids (pack, user and project types are in the registry below). */
export const INJECT_TYPE_IDS = INJECT_TYPES.map((x) => x.id)
const TYPE_ID = /^[a-z0-9_]+$/
/**
 * A stored inject's type: a type id in the template-folder format. Not limited to the
 * registry: an inject of a pack type must still load after the pack is uninstalled (its
 * template lives on as a project copy), and an unknown type already falls back to a
 * built-in one when it is generated (type-map.ts) and to its id as a label.
 */
export const InjectType = z.string().regex(TYPE_ID, { message: 'Unknown inject type' })
export type InjectType = string

// ---- registry (ADR-0018, #261) ---------------------------------------------------------------
// INJECT_TYPES stays the built-in list. Main registers the types that templates of the user
// layer and of enabled packs add through the `taxonomy` block of their meta.json; the renderer
// keeps its own copy filled over IPC (templates:taxonomy). A registered id never shadows a
// built-in entry: a pack template that replaces a built-in type keeps the built-in taxonomy.

let registered: readonly InjectTypeInfo[] = []
let all: readonly InjectTypeInfo[] = INJECT_TYPES
let hidden: ReadonlySet<string> = new Set()
let revision = 0
const listeners = new Set<() => void>()

/**
 * Replace the registered (non-built-in) types. Built-in ids and repeated ids are skipped.
 * `hiddenIds`: types whose template comes from a bundled pack the user disabled (ADR-0020);
 * they stay known (labels, existing injects) but are not offered for new use.
 */
export function registerInjectTypes(
  types: readonly InjectTypeInfo[],
  hiddenIds: Iterable<string> = [],
): void {
  hidden = new Set(hiddenIds)
  const seen = new Set(INJECT_TYPE_IDS)
  const next: InjectTypeInfo[] = []
  for (const t of types) {
    if (!TYPE_ID.test(t.id) || seen.has(t.id)) continue
    seen.add(t.id)
    next.push(t)
  }
  registered = Object.freeze(next)
  all = Object.freeze([...INJECT_TYPES, ...registered])
  revision++
  for (const l of listeners) l()
}

/** Built-in types followed by the registered ones. */
export const injectTypes = (): readonly InjectTypeInfo[] => all
/** The registered (pack, user, project) types only. */
export const registeredInjectTypes = (): readonly InjectTypeInfo[] => registered
export const injectTypesRevision = (): number => revision
export function subscribeInjectTypes(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether a type is hidden from new use (its bundled pack is disabled). */
export const isInjectTypeHidden = (id: string): boolean => hidden.has(id)
/** The hidden type ids. */
export const hiddenInjectTypes = (): readonly string[] => [...hidden]

/** A built-in or registered type id. */
export const isInjectTypeId = (id: string): boolean => all.some((x) => x.id === id)

export function injectTypeInfo(id: string): InjectTypeInfo | undefined {
  return all.find((x) => x.id === id)
}

/** A type is offered to a domain unless it is tagged for other domains only. */
export function injectTypeFitsDomain(
  info: Pick<InjectTypeInfo, 'domains'>,
  domainId: string,
): boolean {
  return !info.domains || info.domains.includes(domainId)
}

/**
 * Inject types a project of `domainId` may use for new injects (untagged types plus those
 * tagged for it), leaving out types hidden with their disabled bundled pack.
 */
export function injectTypesForDomain(domainId: string): InjectTypeInfo[] {
  return all.filter((x) => injectTypeFitsDomain(x, domainId) && !hidden.has(x.id))
}
