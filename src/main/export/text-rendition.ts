// The plain-text rendition of an inject (spec 0432 FR-13): its fields in reading order, for
// exercise platforms (Conducttr messages, EOC packages), screen readers and the alt text of
// deck images. Types with a renderer below read like the message they imitate; every other
// type falls back to a "Label: value" list built from the template schema's titles and order.
import { deriveFields } from '../render/derived'

export interface RenditionSource {
  type: string
  title?: string
  fields: Record<string, unknown>
}

type Fields = Record<string, unknown>

const str = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
const obj = (v: unknown): Fields => (v && typeof v === 'object' ? (v as Fields) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const strs = (v: unknown): string[] => arr(v).map(str).filter(Boolean)
const lines = (...parts: (string | undefined | false)[]): string =>
  parts.filter((p): p is string => !!p).join('\n')
const labeled = (label: string, value: string): string => (value ? `${label}: ${value}` : '')

function email(f: Fields): string {
  const from = [str(f.fromName), str(f.fromEmail) && `<${str(f.fromEmail)}>`]
    .filter(Boolean)
    .join(' ')
  return lines(
    labeled('From', from),
    labeled('To', str(f.to)),
    labeled('Cc', str(f.cc)),
    labeled('Sent', str(f.sentAt)),
    labeled('Subject', str(f.subject)),
    '',
    str(f.body),
    str(f.signature),
    strs(arr(f.attachments).map((a) => obj(a).name)).length
      ? `Attachments: ${strs(arr(f.attachments).map((a) => obj(a).name)).join(', ')}`
      : '',
  )
}

const tweet = (f: Fields): string =>
  lines(
    `${str(f.displayName)} ${str(f.handle)}`.trim(),
    labeled('Replying to', str(f.replyingTo)),
    str(f.text),
    str(f.attachedImageAlt) && `[Image: ${str(f.attachedImageAlt)}]`,
  )

const textMessage = (f: Fields): string =>
  lines(
    labeled('From', str(f.fromLabel)),
    ...arr(f.bubbles).map((b) => {
      const bubble = obj(b)
      return `${bubble.dir === 'out' ? 'Sent' : 'Received'}${str(bubble.timeLabel) ? ` ${str(bubble.timeLabel)}` : ''}: ${str(bubble.text)}`
    }),
  )

const newsArticle = (f: Fields): string =>
  lines(
    labeled('Outlet', str(f.outlet)),
    str(f.headline),
    str(f.dek),
    [str(f.byline), str(f.publishedAt)].filter(Boolean).join(' · '),
    '',
    str(f.body),
  )

const pressRelease = (f: Fields): string => {
  const c = obj(f.mediaContact)
  return lines(
    str(f.org),
    labeled('Date', str(f.releaseDate)),
    str(f.headline),
    str(f.subhead),
    [str(f.dateline), str(f.body)].filter(Boolean).join(' '),
    str(c.name) &&
      `Media contact: ${[c.name, c.title, c.phone, c.email].map(str).filter(Boolean).join(', ')}`,
  )
}

const radioCall = (f: Fields): string =>
  lines(
    [str(f.centerName), str(f.channel), str(f.frequency)].filter(Boolean).join(' · '),
    ...arr(f.lines).map((l) => {
      const line = obj(l)
      return `${str(line.time)} ${str(line.from)} to ${str(line.to)}: ${str(line.text)}`.trim()
    }),
  )

const phoneCall = (f: Fields): string =>
  lines(
    labeled('Caller', str(obj(f.caller).name) || str(obj(f.caller).number)),
    labeled('Received by', str(obj(f.callee).name) || str(obj(f.callee).number)),
    ...arr(f.transcript).map((t) => `${str(obj(t).speaker)}: ${str(obj(t).text)}`),
  )

function capAlert(f: Fields): string {
  const d = deriveFields('cap_alert', f)
  return lines(
    str(d.headline),
    `Status: ${str(d.status)} · ${str(f.msgType)} · ${str(f.severity)} / ${str(f.urgency)} / ${str(f.certainty)}`,
    labeled('Event', `${str(f.event)} (${str(f.eventCode)})`),
    labeled('From', str(f.senderName)),
    labeled('Area', str(f.areaDesc)),
    labeled('Effective', str(d.effective)),
    labeled('Expires', str(d.expires)),
    '',
    str(f.description),
    labeled('Instruction', str(f.instruction)),
    labeled('WEA text', str(f.cmamText)),
    labeled('WEA long text', str(f.cmamLongText)),
    str(d.note),
  )
}

function easBroadcast(f: Fields): string {
  const d = deriveFields('eas_broadcast', f)
  return lines(
    str(d.crawl),
    str(f.details),
    labeled('SAME header', str(d.sameHeader)),
    'EXERCISE - NOT A REAL ALERT',
  )
}

function notam(f: Fields): string {
  const d = deriveFields('notam', f)
  return lines(
    'EXERCISE NOTAM',
    str(d.icaoHeading),
    str(d.icaoQ),
    str(f.text),
    labeled('Effective', [str(f.effectiveStart), str(f.effectiveEnd)].filter(Boolean).join(' to ')),
  )
}

function nwsWarning(f: Fields): string {
  const d = deriveFields('nws_weather_warning', f)
  return lines(
    str(f.wmoHeader),
    str(d.ugc) || str(f.ugc),
    str(d.vtec) || str(f.vtec),
    str(f.bulletin),
    str(f.product),
    str(f.office),
    str(d.issued) || str(f.issued),
    '',
    ...strs(f.warningFor).map((a) => `* ${a}`),
    `* Until ${str(d.until) || str(f.until)}.`,
    `* ${str(f.at)}`,
    labeled('HAZARD', str(f.hazard)),
    labeled('SOURCE', str(f.source)),
    labeled('IMPACT', str(f.impact)),
    strs(f.locations).length ? `Locations: ${strs(f.locations).join(', ')}.` : '',
    ...strs(f.actions),
  )
}

function ics213(f: Fields): string {
  const who = (v: unknown): string =>
    [str(obj(v).name), str(obj(v).position)].filter(Boolean).join(', ')
  return lines(
    'GENERAL MESSAGE (ICS 213)',
    labeled('1. Incident name', str(f.incidentName)),
    labeled('2. To', who(f.to)),
    labeled('3. From', who(f.from)),
    labeled('4. Subject', str(f.subject)),
    labeled('5. Date', str(f.date)),
    labeled('6. Time', str(f.time)),
    labeled('7. Message', str(f.message)),
    labeled('8. Approved by', who(f.approvedBy)),
    labeled('9. Reply', str(f.reply)),
    labeled('10. Replied by', who(f.repliedBy)),
  )
}

const RENDERERS: Record<string, (f: Fields) => string> = {
  email,
  email_forward: email,
  reporter_email: email,
  tweet,
  text_message: textMessage,
  news_article: newsArticle,
  press_release: pressRelease,
  radio_call: radioCall,
  phone_call: phoneCall,
  cap_alert: capAlert,
  eas_broadcast: easBroadcast,
  notam,
  nws_weather_warning: nwsWarning,
  ics_213_general_message: ics213,
}

/** "Label: value" for every field the schema lists, in schema order; nested values flattened. */
export function genericText(fields: Fields, schema?: Fields): string {
  const props = obj(obj(schema).properties)
  const keys = [...Object.keys(props), ...Object.keys(fields).filter((k) => !(k in props))]
  const out: string[] = []
  for (const key of keys) {
    const value = flatten(fields[key])
    if (!value) continue
    const title = str(obj(props[key]).title) || humanize(key)
    out.push(value.includes('\n') ? `${title}:\n${value}` : `${title}: ${value}`)
  }
  return out.join('\n')
}

const humanize = (key: string): string =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

function flatten(v: unknown): string {
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join('\n')
  if (v && typeof v === 'object')
    return Object.entries(v as Fields)
      .map(([k, x]) => (flatten(x) ? `${humanize(k)}: ${flatten(x)}` : ''))
      .filter(Boolean)
      .join('\n')
  if (typeof v === 'boolean') return v ? 'yes' : ''
  return str(v)
}

/** The inject as plain text; `schema` (the template's schema.json) feeds the generic fallback. */
export function injectText(inject: RenditionSource, schema?: Fields): string {
  const render = RENDERERS[inject.type]
  const text = (render ? render(inject.fields) : genericText(inject.fields, schema)).trim()
  return text || inject.title || ''
}
