// Technical-evidence, operational-display and voice-transcript templates (#31 part B):
// schema quality, escaping of untrusted fields, brand fallbacks, image slots and variants.
import { describe, expect, it, vi } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { composeDocument } = await import('./compose')
const { loadTemplate, validateFields } = await import('./templates')

const TECH_TYPES = [
  'system_log',
  'siem_alert',
  'console_dump',
  'error_dialog',
  'network_diagram',
  'email_header_analysis',
  'ransom_note',
  'screenshot_generic',
  'fids_board',
  'bhs_scada_screen',
  'pacs_alarm_panel',
  'cctv_still',
  'map_annotation',
  'signage_photo',
  'radio_call',
  'phone_call',
  'voicemail',
  'pa_announcement',
  '911_cad_entry',
]

type JsonSchema = {
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  additionalProperties?: boolean | JsonSchema
  description?: string
  examples?: unknown[]
}

/** Top-level properties of a template schema that lack a description or examples. */
function undocumentedFields(schema: JsonSchema): string[] {
  return Object.entries(schema.properties ?? {})
    .filter(([, p]) => !p.description && !p.examples)
    .map(([k]) => k)
}

const XSS = '<img src=x onerror=alert(1)><script>alert(2)</script>'

/** Replace every string in the preview with an injection payload (keys and shape kept). */
function poisonStrings(value: unknown): unknown {
  if (typeof value === 'string') return XSS
  if (Array.isArray(value)) return value.map(poisonStrings)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poisonStrings(v)]))
  return value
}

describe.each(TECH_TYPES)('template %s', (type) => {
  const t = loadTemplate(type)

  it('ships a closed, documented schema and a preview that validates', () => {
    expect(t.schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(t.schema.additionalProperties).toBe(false)
    expect(undocumentedFields(t.schema as JsonSchema)).toEqual([])
    expect(validateFields(type, t.preview.fields)).toEqual([])
  })

  it('renders every variant with the variant body class', () => {
    for (const variant of t.meta.variants) {
      const doc = composeDocument({ type, fields: t.preview.fields, variant })
      expect(doc.html).toContain(`class="variant-${variant}"`)
      expect(doc.html).toContain(`inject-${type}`)
    }
  })

  it('escapes untrusted text in every field', () => {
    const fields = poisonStrings(t.preview.fields) as Record<string, unknown>
    for (const variant of t.meta.variants) {
      const html = composeDocument({ type, fields, variant }).html
      expect(html).not.toContain('<img src=x')
      expect(html).not.toContain('<script>alert')
    }
  })

  it('has a sample image under 200 KB for each image slot, and renders with the slot empty', () => {
    for (const slot of t.meta.imageSlots) {
      const rel = t.preview.assets[slot]
      expect(rel, `${type} preview asset for ${slot}`).toBeTruthy()
      const file = join(t.dir, rel!)
      expect(existsSync(file)).toBe(true)
      expect(statSync(file).size).toBeLessThanOrEqual(200_000)
      const empty = composeDocument({ type, fields: t.preview.fields })
      expect(empty.html).not.toMatch(/<img[^>]+src=""/)
    }
  })
})

describe('template specifics', () => {
  it('fids_board renders anomaly rows like normal rows outside the glitch variant', () => {
    const { fields } = loadTemplate('fids_board').preview
    const html = composeDocument({ type: 'fids_board', fields, variant: 'default' }).html
    expect(html).toContain('PURGATORY')
    expect(html).toContain('data-status="BOARDING"')
    expect(html).not.toContain('class="scan"')
    const glitch = composeDocument({ type: 'fids_board', fields, variant: 'glitch' }).html
    expect(glitch).toContain('class="scan"')
  })

  it('system_log keeps the Scenario 3 I-09 header and colors lines by level', () => {
    const { fields } = loadTemplate('system_log').preview
    const html = composeDocument({ type: 'system_log', fields, variant: 'printout' }).html
    expect(html).toContain('SYSTEM LOG: AODB_SQL_MASTER')
    expect(html).toContain('IP: 10.66.0.10')
    expect(html).toContain('OS: Windows Server 2019')
    expect(html).toContain('lvl-crit')
    expect(html).toContain('lvl-warn')
  })

  it('cctv_still burns camera id and timestamp from fields, with or without an image', () => {
    const { fields } = loadTemplate('cctv_still').preview
    const html = composeDocument({ type: 'cctv_still', fields }).html
    expect(html).toContain('CAM 07')
    expect(html).toContain('2026-10-21 11:23:07')
    expect(html).toContain('NO VIDEO')
    const withImage = composeDocument({ type: 'cctv_still', fields }, { previewAssets: true }).html
    expect(withImage).toMatch(/<img class="frame" src="file:\/\/.*sample-frame\.jpg"/)
  })

  it('network_diagram draws one line per edge between node coordinates', () => {
    const { fields } = loadTemplate('network_diagram').preview
    const html = composeDocument({ type: 'network_diagram', fields }).html
    const edges = (fields.edges as unknown[]).length
    expect(html.match(/<line\s/g)?.length).toBe(edges)
    expect(html).toMatch(/x1="27%"\s+y1="62%"\s+x2="71%"\s+y2="62%"/)
  })

  it('falls back to brand aliases for the organization name', () => {
    const { fields } = loadTemplate('radio_call').preview
    const { orgName: _drop, ...rest } = fields
    const html = composeDocument({
      type: 'radio_call',
      fields: rest,
      brand: { aliases: { airport: 'Lakeview Regional Airport' } },
    }).html
    expect(html).toContain('Lakeview Regional Airport')
  })

  it('phone_call prints prompt turns as blank player responses', () => {
    const { fields } = loadTemplate('phone_call').preview
    const html = composeDocument({ type: 'phone_call', fields }).html
    expect(html).toContain('[Player response]')
  })
})
