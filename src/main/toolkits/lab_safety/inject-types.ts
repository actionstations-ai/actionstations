// The inject types the lab safety toolkit adds (templates ship in the same pack) and the
// text-bearing built-in types the research_labs domain prefers. The guardrail rule reads all of
// them: a lab exercise can put a sentence about an agent in an email as easily as in a report.
export const LAB_OWN_INJECT_TYPES = [
  'lab_incident_report',
  'lab_theft_loss_worksheet',
  'lab_exposure_evaluation',
  'lab_work_restriction_memo',
  'lab_stop_work_order',
  'lab_corrective_action_plan',
  'lab_ibc_minutes',
  'lab_data_breach_notice',
  'lab_responder_briefing',
] as const

export const LAB_TEXT_INJECT_TYPES = [
  'email',
  'email_forward',
  'memo',
  'official_letter',
  'regulatory_notice',
  'regulatory_report_form',
  'press_release',
  'phone_call',
  'voicemail',
  'text_message',
  'helpdesk_ticket',
  'sitrep',
  'field_report',
  'ics_201_prefill',
  'ics_213_general_message',
  'incident_alert_notification',
  'breach_notification_letter',
  'chain_of_custody_form',
  'news_article',
  'tweet',
  'facebook_post',
  'media_inquiry_phone_slip',
] as const

export const LAB_GUARDRAIL_INJECT_TYPES: readonly string[] = [
  ...LAB_OWN_INJECT_TYPES,
  ...LAB_TEXT_INJECT_TYPES,
]
