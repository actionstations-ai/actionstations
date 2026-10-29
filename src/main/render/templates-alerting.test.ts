// Real-world alert formats (spec 0432): cap_alert, eas_broadcast, notam v2, nws_weather_warning v2
// and ics_213_general_message v2. Previews validate for every variant, critical text comes out
// exact, the exercise marking cannot be removed, and the SAME enum matches the code list.
import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { EAS_ORIGINATOR_CODES, SAME_EVENT_CODES } from '../../shared/alerting/same-events'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { composeDocument } = await import('./compose')
const { loadTemplate, previewFields, validateFields } = await import('./templates')

const TYPES = [
  'cap_alert',
  'eas_broadcast',
  'notam',
  'nws_weather_warning',
  'ics_213_general_message',
]

function render(type: string, variant: string, over: Record<string, unknown> = {}): string {
  const t = loadTemplate(type)
  const fields = { ...previewFields(t.preview, variant), ...over }
  return composeDocument({ type, fields, variant }, { previewAssets: true }).html
}

/** The document's visible text, tags removed and entities decoded. */
const visible = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x3D;/g, '=')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

describe.each(TYPES)('%s', (type) => {
  const t = loadTemplate(type)
  const variants = t.meta.variants.length ? t.meta.variants : ['default']

  it('previews validate against the schema, for every variant', () => {
    for (const v of variants) expect(validateFields(type, previewFields(t.preview, v))).toEqual([])
  })

  it('renders every variant', () => {
    for (const v of variants) expect(render(type, v)).toContain('inject-' + type)
  })
})

describe('schemas', () => {
  it('cap_alert accepts only Exercise or Test as status', () => {
    const base = loadTemplate('cap_alert').preview.fields
    expect(validateFields('cap_alert', { ...base, status: 'Actual' })).not.toEqual([])
    expect(validateFields('cap_alert', { ...base, status: 'Test' })).toEqual([])
  })

  it('cap_alert limits the WEA texts to 90 and 360 characters', () => {
    const base = loadTemplate('cap_alert').preview.fields
    expect(validateFields('cap_alert', { ...base, cmamText: 'x'.repeat(91) })).not.toEqual([])
    expect(validateFields('cap_alert', { ...base, cmamLongText: 'x'.repeat(361) })).not.toEqual([])
  })

  it('cap_alert refuses a time that ends in Z and a malformed SAME code', () => {
    const base = loadTemplate('cap_alert').preview.fields
    expect(validateFields('cap_alert', { ...base, sent: '2026-10-21T14:14:00Z' })).not.toEqual([])
    expect(validateFields('cap_alert', { ...base, sameCodes: ['39035'] })).not.toEqual([])
  })

  it('the SAME event and originator enums match the code lists', () => {
    for (const type of ['cap_alert', 'eas_broadcast']) {
      const props = loadTemplate(type).schema.properties as Record<string, { enum?: string[] }>
      expect(props[type === 'cap_alert' ? 'eventCode' : 'event']!.enum).toEqual(SAME_EVENT_CODES)
    }
    const eas = loadTemplate('eas_broadcast').schema.properties as Record<
      string,
      { enum?: string[] }
    >
    expect(eas.originator!.enum).toEqual(EAS_ORIGINATOR_CODES)
  })

  it('eas_broadcast allows at most 31 locations', () => {
    const base = loadTemplate('eas_broadcast').preview.fields
    const many = Array.from({ length: 32 }, (_, i) => String(39000 + i).padStart(6, '0'))
    expect(validateFields('eas_broadcast', { ...base, locations: many })).not.toEqual([])
  })

  it('nws_weather_warning still accepts the version 1 product names', () => {
    const base = loadTemplate('nws_weather_warning').preview.fields
    for (const product of ['Flash Flood Warning', 'Severe Thunderstorm Warning', 'Tornado Warning'])
      expect(validateFields('nws_weather_warning', { ...base, product })).toEqual([])
  })

  it('the new and changed templates are at the versions the spec names', () => {
    expect(loadTemplate('cap_alert').meta.version).toBe('1')
    expect(loadTemplate('eas_broadcast').meta.version).toBe('1')
    for (const type of ['notam', 'nws_weather_warning', 'ics_213_general_message'])
      expect(loadTemplate(type).meta.version).toBe('2')
  })
})

describe('cap_alert', () => {
  it('review shows the exercise banner, the headline and the WEA counts', () => {
    const text = visible(render('cap_alert', 'review'))
    expect(text).toContain('EXERCISE · NOT A REAL ALERT · Exercise')
    expect(text).toContain('EXERCISE - Flash Flood Warning for Haldane and Marlow Counties')
    expect(text).toContain('/ 90 characters')
    expect(text).toContain('/ 360 characters')
  })

  it('xml shows the CAP document with the exercise note and no Z in any time', () => {
    const text = visible(render('cap_alert', 'xml'))
    expect(text).toContain('<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">')
    expect(text).toContain('<status>Exercise</status>')
    expect(text).toContain('EXERCISE - NOT A REAL ALERT')
    expect(text).not.toMatch(/T\d\d:\d\d:\d\dZ/)
  })

  it('escapes markup from a field', () => {
    const html = render('cap_alert', 'review', { description: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)')
  })
})

describe('eas_broadcast', () => {
  it('decoder log shows the exact SAME header built from the fields', () => {
    const text = visible(render('eas_broadcast', 'decoder_log'))
    expect(text).toContain('ZCZC-CIV-FFW-039035-039093+0100-2941820-EXERCISE-')
    expect(text).toContain('NNNN')
    expect(text).toContain('NOT A REAL ALERT')
  })

  it('tv crawl shows the crawl sentence and the exercise tag', () => {
    const text = visible(render('eas_broadcast', 'tv_crawl'))
    expect(text).toContain('EXERCISE · NOT A REAL ALERT')
    expect(text).toContain('A CIVIL AUTHORITY HAS ISSUED A FLASH FLOOD WARNING')
    expect(text).toContain('HALDANE COUNTY; MARLOW COUNTY')
  })

  it('crawl text is at least 28 px', () => {
    const css = loadTemplate('eas_broadcast').css
    const sizes = [...css.matchAll(/\.(?:crawl|more|head)\s*\{[^}]*font-size:\s*(\d+)px/g)]
    expect(sizes.length).toBe(3)
    for (const m of sizes) expect(Number(m[1])).toBeGreaterThanOrEqual(28)
  })
})

describe('notam v2', () => {
  it('icao variant shows the heading, Q line and items A) to G)', () => {
    const text = visible(render('notam', 'icao'))
    expect(text).toContain('A0412/26 NOTAMN')
    expect(text).toContain('Q) KZOB/QRTCA/IV/NBO/W/000/029/4128N08143W003')
    for (const item of ['A)', 'B)', 'C)', 'E)', 'F)', 'G)']) expect(text).toContain(item)
  })

  it('every variant keeps the exercise marking', () => {
    for (const v of ['text', 'tfr', 'icao'])
      expect(visible(render('notam', v))).toContain('EXERCISE')
  })
})

describe('nws_weather_warning v2', () => {
  it('builds the VTEC, UGC and issuance lines from the structured fields', () => {
    const text = visible(render('nws_weather_warning', 'default'))
    expect(text).toContain('OHC035-093-212115-')
    expect(text).toContain('/O.NEW.KILN.FF.W.0042.261021T1814Z-261021T2115Z/')
    expect(text).toContain('214 PM EDT Wed Oct 21 2026')
    expect(text).toContain('* Until 515 PM EDT.')
  })

  it('renders a cancellation statement without a Special Weather Statement VTEC', () => {
    const statement = visible(
      render('nws_weather_warning', 'default', {
        product: 'Flash Flood Statement',
        vtecInfo: { action: 'CAN', office: 'KILN', phenomenon: 'FF', eventNumber: 42 },
      }),
    )
    expect(statement).toContain('/O.CAN.KILN.FF.W.0042.000000T0000Z-000000T0000Z/')
    expect(statement).toContain('* Flash Flood Warning is cancelled for...')
    const sps = visible(
      render('nws_weather_warning', 'default', { product: 'Special Weather Statement' }),
    )
    expect(sps).not.toContain('/O.NEW')
  })

  it('renders a watch county notification with the watch number', () => {
    const watch = visible(
      render('nws_weather_warning', 'default', { product: 'Tornado Watch', watchNumber: '123' }),
    )
    expect(watch).toContain('* Tornado Watch 123 for the following areas...')
  })
})
