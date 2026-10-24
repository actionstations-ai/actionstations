// Which inject type a MSEL row becomes. Control rows (STARTEX / TIME_JUMP / ENDEX) always
// become control cards; every other row keeps its format when a template exists for it and
// otherwise falls back along a deterministic chain of the closest template-backed types.
// When nothing in the chain is installed the row keeps its taxonomy type with no template:
// the model then fills the taxonomy's key fields and the page is listed as text-only.
import type { MselRow } from '@shared/schemas'
import { injectTypeFitsDomain, injectTypeInfo, isInjectTypeId } from '@shared/taxonomy'

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
  tiktok_video_card: ['instagram_post', 'tweet'],
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
  fids_board: ['info_display_board', 'status_board', 'scene_photo'],
  bhs_scada_screen: ['scada_hmi', 'status_board', 'system_log'],
  info_display_board: ['fids_board', 'status_board', 'scene_photo'],
  scada_hmi: ['bhs_scada_screen', 'status_board', 'system_log'],
  uas_detection_alert: ['siem_alert', 'screenshot_generic', 'radio_call'],
  avl_fleet_map: ['status_board', 'map_annotation', 'scene_photo'],
  incident_alert_notification: ['text_message', 'pa_announcement', 'memo'],
  field_report: ['sitrep', 'memo', 'scene_photo'],
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
  // Domain templates proposed by the research dossiers (#324)
  service_status_page: ['error_dialog', 'screenshot_generic', 'tweet'],
  leak_site_post: ['ransom_note', 'screenshot_generic', 'reddit_post'],
  security_advisory: ['regulatory_notice', 'email', 'memo'],
  alarm_summary: ['scada_hmi', 'system_log', 'siem_alert'],
  nws_weather_warning: ['incident_alert_notification', 'regulatory_notice', 'memo'],
  notam: ['regulatory_notice', 'official_letter', 'memo'],
  rider_service_alert: ['incident_alert_notification', 'text_message', 'tweet'],
  ics_213_general_message: ['memo', 'ics_201_prefill', 'email'],
  ics_214_activity_log: ['system_log', 'sitrep', 'memo'],
  chain_of_custody_form: ['field_report', 'memo', 'system_log'],
  regulatory_report_form: ['regulatory_notice', 'official_letter', 'memo'],
  lab_result_report: ['field_report', 'memo', 'official_letter'],
  breach_notification_letter: ['official_letter', 'memo', 'email'],
  downtime_notice: ['memo', 'email', 'helpdesk_ticket'],
  boil_water_notice: ['incident_alert_notification', 'press_release', 'official_letter'],
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
  info_display_board:
    'boardTitle, siteName, clock, rows[{primary,secondary,time,position,status,remarks,anomaly}], ticker',
  scada_hmi:
    'systemName, site, clock, state, mode, equipment[{tag,label,kind,state,value,units,setpoint}], readings[{label,value,units,alarm}], alarms[{time,priority,tag,text,acked}]',
  uas_detection_alert:
    'systemName, site, clock, tracks[{id,status,remoteIdSerial,altitudeFt,distanceM,operatorLocation,zone,threatLevel}], zones[{name}], events[{time,text}]',
  avl_fleet_map:
    'systemName, agency, clock, routes[{id,name,status}], vehicles[{id,route,status,lastReport,x,y}], alerts[{time,text,severity}]',
  incident_alert_notification:
    'sender, headline, body, issuedAt, areaAffected, instructions[], severity',
  field_report:
    'organization, reportNo, date, time, location, inspector, reportType, summary, findings[{item,condition,notes}], actionsTaken[], recommendations[]',
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
  service_status_page:
    'orgName, serviceName, overallStatus, incidentTitle, components[{name,status}], updates[{status,time,text}]',
  leak_site_post:
    'siteName, victimName, victimDomain, dataSize, deadline, status, description, fileList[{name,size}]',
  security_advisory:
    'publisher, advisoryId, title, tlp, released, severity, cves[], affectedProducts[{product,versions}], summary, iocs[{type,value}], mitigations[]',
  alarm_summary:
    'systemName, site, clock, operator, counts, alarms[{time,priority,tag,source,description,value,state}]',
  nws_weather_warning:
    'office, product, issued, warningFor[], until, at, hazard, source, impact, locations[], actions[]',
  notam:
    'notamNumber, facility, location, effectiveStart, effectiveEnd, text, tfr{type,reason,radiusNm,floor,ceiling,restrictions[]}',
  rider_service_alert:
    'agency, routes[{id,mode}], effect, cause, headline, description, activePeriod, alternatives[]',
  ics_213_general_message:
    'incidentName, to, from, subject, date, time, message, approvedBy, reply',
  ics_214_activity_log:
    'incidentName, opPeriod, name, icsPosition, homeAgency, resources[], entries[{time,activity}]',
  chain_of_custody_form:
    'org, caseNo, items[{itemNo,description,serial}], collectedBy, collectedAt, location, transfers[{dateTime,releasedBy,receivedBy,purpose}]',
  regulatory_report_form:
    'agency, formName, reportType, reportId, submittedAt, organization, sections[{heading,items[{label,value}]}], narrative',
  lab_result_report:
    'labName, client, sampleId, sampleLocation, sampledAt, reportedAt, results[{analyte,result,units,limit,method,flag}], comments',
  breach_notification_letter:
    'org, date, recipientName, whatHappened, whatInformation, whatWeAreDoing, whatYouCanDo, forMoreInformation, signerName',
  downtime_notice:
    'org, systemName, status, startedAt, expectedRestore, affected[], procedures[], contact',
  boil_water_notice:
    'utility, pwsId, noticeType, issuedAt, affectedArea, whatHappened, whatToDo[], whatIsBeingDone, expectedResolution, contact',
}

export interface TypeChoice {
  type: string
  /** A template for `type` is installed (fields are validated against its schema). */
  hasTemplate: boolean
  /** The type the row asked for, when a fallback was used. */
  requested?: string
  /** Why the row's format was changed before the fallback chain (logged). */
  note?: string
}

/**
 * A built-in type, one the registry has from user or pack templates (ADR-0018), or one the
 * project has a template for (a project copy of a pack template after the pack is gone).
 */
const isKnownType = (id: string, installed: ReadonlySet<string>): boolean =>
  isInjectTypeId(id) || installed.has(id)

/** A caller the media phone slip is for: a newsroom, a reporter, an outlet. */
const MEDIA_SOURCE =
  /\b(?:media|press|reporter|journalist|news|newsroom|tv|radio station|channel\s?\d|journal|times|post|gazette|herald|tribune|dispatch|assignment desk|producer|anchor|station|network|broadcast)\b/i

/**
 * A media phone slip for a row whose source is not a media outlet (TSA, a vendor) would come
 * back as a newsroom call from the template's examples (#105); it is written as a phone call.
 */
function formatForSource(row: MselRow, format: string): { format: string; note?: string } {
  if (format !== 'media_inquiry_phone_slip') return { format }
  if (MEDIA_SOURCE.test(row.from) || MEDIA_SOURCE.test(row.event.slice(0, 120))) return { format }
  return {
    format: 'phone_call',
    note: `media_inquiry_phone_slip is for media callers and the row's source is "${row.from}"; written as phone_call`,
  }
}

/** A type the project's domain may use (untagged, or tagged for this domain). */
const fitsDomain = (type: string, domainId: string | undefined): boolean => {
  if (!domainId) return true
  const info = injectTypeInfo(type)
  return !info || injectTypeFitsDomain(info, domainId)
}

/**
 * Deterministic: the first installed type along the fallback chain, else the type itself.
 * With a domain id, a type tagged for other domains (a FIDS board in a transit project) is
 * treated as unavailable and the chain finds the generic equivalent.
 */
export function chooseInjectType(
  row: MselRow,
  installed: Iterable<string>,
  domainId?: string,
): TypeChoice {
  const all = new Set(installed)
  const have = new Set([...all].filter((t) => fitsDomain(t, domainId)))
  const control = CONTROL_TYPES[row.purposeTag]
  const format = row.format?.trim() ?? ''
  const wanted = control ?? (isKnownType(format, all) ? format : 'scenario_update')
  const { format: requested, note: sourceNote } = control
    ? { format: wanted }
    : formatForSource(row, wanted)
  const note =
    sourceNote ??
    (!control && !fitsDomain(requested, domainId)
      ? `${requested} belongs to another domain than ${domainId}; using the closest equivalent`
      : undefined)
  const withNote = note ? { note } : {}
  if (have.has(requested)) return { type: requested, hasTemplate: true, ...withNote }
  for (const alt of TYPE_FALLBACKS[requested] ?? []) {
    if (have.has(alt)) return { type: alt, hasTemplate: true, requested, ...withNote }
  }
  if (!fitsDomain(requested, domainId)) {
    return {
      type: 'scenario_update',
      hasTemplate: have.has('scenario_update'),
      requested,
      ...withNote,
    }
  }
  return { type: requested, hasTemplate: false, ...withNote }
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
