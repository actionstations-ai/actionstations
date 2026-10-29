// CAP 1.2 (OASIS 2010) with the IPAWS profile, built from a cap_alert inject's fields.
// The document is always an exercise message: status is Exercise or Test (never Actual), the
// headline starts with EXERCISE and <note> says it is not a real alert (spec 0432 FR-12, FR-14).
// Values are escaped by a small writer: no DOCTYPE, no entities, no processing instructions
// beyond the XML declaration.
import { capTime } from './time'

export const CAP_NAMESPACE = 'urn:oasis:names:tc:emergency:cap:1.2'
export const EXERCISE_NOTE = 'EXERCISE - NOT A REAL ALERT. Do not send, relay or broadcast.'
export const MAX_WEA_SHORT = 90
export const MAX_WEA_LONG = 360

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/** Escape text for an XML element or attribute; control characters XML forbids are dropped. */
export function xmlEscape(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  )
}

/** Status is Exercise unless the inject says Test; "Actual" and anything else become Exercise. */
export function capStatus(value: unknown): 'Exercise' | 'Test' {
  return value === 'Test' ? 'Test' : 'Exercise'
}

/** The headline always starts with the exercise word of its language. */
export function exerciseHeadline(headline: string, language: 'en' | 'es' = 'en'): string {
  const word = language === 'es' ? 'EJERCICIO' : 'EXERCISE'
  if (headline.toUpperCase().startsWith(word)) return headline
  return headline ? `${word} - ${headline}` : word
}

const el = (name: string, value: string, indent: string, attrs = ''): string =>
  value === '' ? '' : `${indent}<${name}${attrs}>${xmlEscape(value)}</${name}>\n`

const param = (name: string, value: string, indent: string): string =>
  value === ''
    ? ''
    : `${indent}<parameter>\n${el('valueName', name, `${indent}  `)}${el('value', value, `${indent}  `)}${indent}</parameter>\n`

interface InfoText {
  language: string
  headline: string
  description: string
  instruction: string
  cmamText: string
  cmamLongText: string
}

function infoBlock(f: Record<string, unknown>, t: InfoText): string {
  const i = '    '
  const j = '      '
  const k = '        '
  const area = [
    el('areaDesc', text(f.areaDesc), k),
    ...list(f.sameCodes).map(
      (c) =>
        `${k}<geocode>\n${el('valueName', 'SAME', `${k}  `)}${el('value', c, `${k}  `)}${k}</geocode>\n`,
    ),
  ].join('')
  const eventCode = text(f.eventCode)
  return [
    `${i}<info>\n`,
    el('language', t.language, j),
    el('category', text(f.category), j),
    el('event', text(f.event), j),
    ...list(f.responseType).map((r) => el('responseType', r, j)),
    el('urgency', text(f.urgency), j),
    el('severity', text(f.severity), j),
    el('certainty', text(f.certainty), j),
    eventCode
      ? `${j}<eventCode>\n${el('valueName', 'SAME', `${j}  `)}${el('value', eventCode, `${j}  `)}${j}</eventCode>\n`
      : '',
    el('effective', capTime(text(f.effective)), j),
    el('expires', capTime(text(f.expires)), j),
    el('senderName', text(f.senderName), j),
    el('headline', t.headline, j),
    el('description', t.description, j),
    el('instruction', t.instruction, j),
    param('EAS-ORG', text(f.easOrg), j),
    param('CMAMtext', t.cmamText.slice(0, MAX_WEA_SHORT), j),
    param('CMAMlongtext', t.cmamLongText.slice(0, MAX_WEA_LONG), j),
    `${j}<area>\n${area}${j}</area>\n`,
    `${i}</info>\n`,
  ].join('')
}

const english = (f: Record<string, unknown>): InfoText => ({
  language: 'en-US',
  headline: exerciseHeadline(text(f.headline)),
  description: text(f.description),
  instruction: text(f.instruction),
  cmamText: text(f.cmamText),
  cmamLongText: text(f.cmamLongText),
})

function spanish(f: Record<string, unknown>): InfoText | undefined {
  const es = obj(f.infoEs)
  if (!text(es.headline)) return undefined
  return {
    language: 'es-US',
    headline: exerciseHeadline(text(es.headline), 'es'),
    description: text(es.description),
    instruction: text(es.instruction),
    cmamText: text(es.cmamText),
    cmamLongText: text(es.cmamLongText),
  }
}

/** The CAP 1.2 document for a cap_alert inject, marked as an exercise. */
export function buildCapXml(f: Record<string, unknown>): string {
  const i = '  '
  const es = spanish(f)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<!-- EXERCISE - NOT A REAL ALERT. Made by Action Stations for training. Load it only into a training or test environment. -->\n',
    `<alert xmlns="${CAP_NAMESPACE}">\n`,
    el('identifier', text(f.identifier), i),
    el('sender', text(f.sender), i),
    el('sent', capTime(text(f.sent)), i),
    el('status', capStatus(f.status), i),
    el('msgType', text(f.msgType) || 'Alert', i),
    el('scope', 'Public', i),
    el('note', EXERCISE_NOTE, i),
    el('references', text(f.references), i),
    infoBlock(f, english(f)),
    es ? infoBlock(f, es) : '',
    '</alert>\n',
  ].join('')
}

const count = (s: string): number => [...s].length

/** Derived values for a cap_alert inject (shown by the `review` and `xml` variants). */
export function deriveCap(f: Record<string, unknown>): Record<string, unknown> {
  const es = obj(f.infoEs)
  const short = text(f.cmamText)
  const long = text(f.cmamLongText)
  const status = capStatus(f.status)
  return {
    status,
    headline: exerciseHeadline(text(f.headline)),
    note: EXERCISE_NOTE,
    sent: capTime(text(f.sent)),
    effective: capTime(text(f.effective) || text(f.sent)),
    expires: capTime(text(f.expires)),
    shortCount: count(short),
    longCount: count(long),
    shortOver: count(short) > MAX_WEA_SHORT,
    longOver: count(long) > MAX_WEA_LONG,
    channels: list(f.channels).join(', '),
    hasEs: !!text(es.headline),
    esHeadline: text(es.headline) ? exerciseHeadline(text(es.headline), 'es') : '',
    xml: buildCapXml(f),
  }
}
