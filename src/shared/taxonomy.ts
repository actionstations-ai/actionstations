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
}

const t = (
  id: string,
  label: string,
  category: InjectCategory,
  render: RenderPath[],
  opts: Partial<Pick<InjectTypeInfo, 'paper' | 'mvp' | 'defaultDelivery'>> = {},
): InjectTypeInfo => ({
  id,
  label,
  category,
  render,
  paper: opts.paper ?? false,
  mvp: opts.mvp ?? false,
  defaultDelivery: opts.defaultDelivery ?? 'hand_to_role',
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
  }),
  t('reporter_email', 'Reporter email', 'news', ['template']),
  // Internal communications
  t('email', 'Email', 'internal', ['template'], { mvp: true }),
  t('email_forward', 'Email forward', 'internal', ['template'], { mvp: true }),
  t('memo', 'Memo', 'internal', ['template'], { paper: true, mvp: true }),
  t('helpdesk_ticket', 'Helpdesk ticket', 'internal', ['template'], { mvp: true }),
  t('chat_transcript', 'Chat transcript', 'internal', ['template']),
  t('text_message', 'Text message', 'internal', ['template']),
  t('voicemail', 'Voicemail', 'internal', ['tts', 'template'], { defaultDelivery: 'play_audio' }),
  // Voice & radio
  t('radio_call', 'Radio call', 'voice', ['tts', 'template'], { mvp: true }),
  t('phone_call', 'Phone call', 'voice', ['tts', 'template'], { defaultDelivery: 'read_aloud' }),
  t('pa_announcement', 'PA announcement', 'voice', ['tts'], { defaultDelivery: 'play_audio' }),
  t('911_cad_entry', '911 CAD entry', 'voice', ['template']),
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
  // Operational displays & physical
  t('fids_board', 'FIDS board', 'operational', ['template'], {
    mvp: true,
    defaultDelivery: 'display_main_screen',
  }),
  t('bhs_scada_screen', 'BHS SCADA screen', 'operational', ['template']),
  t('pacs_alarm_panel', 'PACS alarm panel', 'operational', ['template']),
  t('cctv_still', 'CCTV still', 'operational', ['ai_image', 'template'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('scene_photo', 'Scene photo', 'operational', ['ai_image'], {
    defaultDelivery: 'display_main_screen',
  }),
  t('map_annotation', 'Annotated map', 'operational', ['template']),
  t('signage_photo', 'Signage photo', 'operational', ['ai_image', 'template']),
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

export const INJECT_TYPE_IDS = INJECT_TYPES.map((x) => x.id)
export const InjectType = z.string().refine((v) => INJECT_TYPE_IDS.includes(v), {
  message: 'Unknown inject type',
})
export type InjectType = string

export function injectTypeInfo(id: string): InjectTypeInfo | undefined {
  return INJECT_TYPES.find((x) => x.id === id)
}
