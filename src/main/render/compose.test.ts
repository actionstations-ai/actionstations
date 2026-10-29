import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { composeDocument, initials } = await import('./compose')
const { listTemplateTypes, loadTemplate, previewFields, templateInfo, validateFields } =
  await import('./templates')

describe('template composition', () => {
  it('lists shipped templates and skips _shared', () => {
    expect(listTemplateTypes()).toContain('time_jump_card')
    expect(listTemplateTypes().some((t) => t.startsWith('_'))).toBe(false)
  })

  it('every template preview validates against its own schema, per variant too', () => {
    for (const type of listTemplateTypes()) {
      const t = loadTemplate(type)
      expect(validateFields(type, t.preview.fields), type).toEqual([])
      for (const v of Object.keys(t.preview.variants)) {
        expect(t.meta.variants, `${type}: preview variant ${v} is not in meta.json`).toContain(v)
        expect(validateFields(type, previewFields(t.preview, v)), `${type}--${v}`).toEqual([])
      }
    }
  })

  it('per-variant preview data replaces top-level fields for that variant only (#331)', () => {
    const t = loadTemplate('security_advisory')
    expect(previewFields(t.preview, 'agency')).toBe(t.preview.fields)
    const vendor = previewFields(t.preview, 'vendor')
    expect(vendor.publisher).toMatch(/PSIRT/)
    expect(vendor.summary).not.toBe(t.preview.fields.summary)
    const info = templateInfo(t)
    expect(info.preview).toBe(t.preview.fields)
    expect(info.previewVariants?.vendor).toEqual(vendor)
    expect(info.previewVariants?.agency).toBeUndefined()
  })

  it('splits long paper forms into Letter pages with continuation headers (#331)', () => {
    const base = loadTemplate('chain_of_custody_form').preview.fields as {
      transfers: Record<string, string>[]
    }
    const html = (type: string, fields: Record<string, unknown>) =>
      composeDocument({ type, fields }).html
    const pageCount = (h: string) => h.match(/<section class="page/g)?.length
    expect(pageCount(html('chain_of_custody_form', base))).toBe(1)
    const transfers = Array.from(
      { length: 40 },
      (_, i) => base.transfers[i % base.transfers.length],
    )
    const long = html('chain_of_custody_form', { ...base, transfers })
    expect(pageCount(long)).toBe(3)
    expect(long).toContain('Page 3 of 3')
    expect(long).toContain('Chain of custody (continued)')
    // Every transfer is printed exactly once, numbered 1 to 40.
    const numbers = [...long.matchAll(/<td class="n">(\d+)<\/td>/g)].map((m) => Number(m[1]))
    expect(numbers).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
    const reg = html(
      'regulatory_report_form',
      loadTemplate('regulatory_report_form').preview.fields,
    )
    expect(pageCount(reg)).toBe(2)
    expect(reg).toContain('Page 2 of 2')
    expect(reg).toContain('(continued)')
  })

  it('reports schema violations with paths', () => {
    const issues = validateFields('time_jump_card', { narration: 1, bogus: true })
    expect(issues.map((i) => i.message).join(' ')).toMatch(/newTime|string|additional/)
  })

  it('escapes untrusted field text, including in nl2br', () => {
    const doc = composeDocument({
      type: 'time_jump_card',
      fields: { newTime: '<img src=x onerror=alert(1)>', narration: 'line 1\n<script>x</script>' },
    })
    expect(doc.html).not.toContain('<img src=x')
    expect(doc.html).not.toContain('<script>x')
    expect(doc.html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(doc.html).toContain('line 1<br>')
  })

  it('locks the document down with a CSP and bundled fonts only', () => {
    const doc = composeDocument({
      type: 'time_jump_card',
      fields: { newTime: '10:00', narration: 'x' },
    })
    expect(doc.html).toContain("default-src 'none'")
    expect(doc.html).toMatch(
      /url\('file:\/\/.*templates\/_shared\/fonts\/inter-latin-400-normal\.woff2'\)/,
    )
    expect(doc.html).not.toMatch(/https?:\/\//)
    for (const directive of ["frame-src 'none'", "form-action 'none'", "base-uri 'none'"])
      expect(doc.html).toContain(directive)
  })

  it('lists what the render window may read: template, _shared and bound media (#301)', () => {
    const logo = resolve('templates/injects/tweet/sample-avatar.jpg')
    const poster = resolve('templates/injects/tiktok_video_card/sample-poster.jpg')
    const doc = composeDocument({
      type: 'tiktok_video_card',
      fields: { handle: 'a.b', caption: 'x' },
      assets: { poster, other: 'data:image/png;base64,AAAA' },
      logo,
    })
    expect(doc.readRoots).toEqual([
      resolve('templates/injects/tiktok_video_card'),
      resolve('templates/_shared'),
      poster,
      logo,
    ])
  })

  it('initials skip punctuation-led words', () => {
    expect(initials('Kyle (Summer Intern – Ops)')).toBe('KS')
    expect(initials('Karen S.')).toBe('KS')
    expect(initials('@TravelGuy99')).toBe('T')
    expect(initials('')).toBe('')
  })

  it('clock formats seconds as m:ss', () => {
    const doc = composeDocument({
      type: 'tiktok_video_card',
      fields: { handle: 'a.b', caption: 'x', durationSec: 83 },
    })
    expect(doc.html).toContain('<span class="time">1:23</span>')
  })

  it('tiktok_video_card draws every word as HTML over the poster slot', () => {
    const doc = composeDocument({
      type: 'tiktok_video_card',
      fields: { handle: 'gate.b4', caption: 'Screens dark #NCIA', overlayText: 'POV: <b>' },
      assets: { poster: 'data:image/png;base64,AAAA' },
    })
    expect(doc.meta.imageSlots).toEqual(['poster'])
    expect(doc.html).toContain('src="data:image/png;base64,AAAA"')
    expect(doc.html).toContain('POV: &lt;b&gt;')
    expect(doc.html).toContain('original sound -')
    expect(doc.html).toContain('<span class="link">#NCIA</span>')
  })

  it('brand.logo fills the logo slot of memo, press release, SITREP and own letters (#217)', () => {
    const logo = 'data:image/png;base64,TE9HTwAB'
    const render = (type: string, withLogo: boolean) =>
      composeDocument(
        { type, fields: loadTemplate(type).preview.fields, ...(withLogo ? { logo } : {}) },
        { previewAssets: true },
      ).html
    for (const type of ['memo', 'press_release', 'sitrep']) {
      expect(render(type, true), type).toContain(`class="logo" src="${logo}"`)
      expect(render(type, false), type).not.toContain('class="logo"')
    }
    expect(render('memo', true)).not.toContain('class="emblem"')
    // A letter from another organization keeps its own letterhead.
    const letter = loadTemplate('official_letter').preview.fields as {
      letterhead: Record<string, unknown>
    }
    const compose = (fromProject: boolean) =>
      composeDocument({
        type: 'official_letter',
        fields: { ...letter, letterhead: { ...letter.letterhead, fromProject } },
        logo,
      }).html
    expect(compose(false)).not.toContain(logo)
    expect(compose(true)).toContain(logo)
  })

  it('a logo given as a file path becomes a file: URL', () => {
    const html = composeDocument({
      type: 'memo',
      fields: loadTemplate('memo').preview.fields,
      logo: resolve('templates/injects/tweet/sample-avatar.jpg'),
    }).html
    expect(html).toMatch(/class="logo" src="file:\/\/[^"]+sample-avatar\.jpg"/)
  })

  it('rejects path-like template types', () => {
    expect(() => loadTemplate('../etc')).toThrow(/Invalid template type/)
    expect(() => loadTemplate('nope_nope')).toThrow(/No template/)
  })
})

describe('translated template chrome (spec 0435 FR-4, FR-9)', () => {
  const memo = () => loadTemplate('memo').preview.fields

  it('an English render keeps the text written in the template and lang="en"', () => {
    const doc = composeDocument({ type: 'memo', fields: memo() })
    expect(doc.html).toContain('<html lang="en">')
    expect(doc.html).toContain('Memorandum')
    expect(doc.html).toMatch(/<main lang="en"/)
  })

  it('a Spanish render sets lang="es" and takes the labels from labels/es.json', () => {
    const doc = composeDocument({ type: 'memo', fields: memo(), lang: 'es' })
    expect(doc.html).toContain('<html lang="es">')
    expect(doc.html).toContain('Memorando')
    expect(doc.html).toContain('ASUNTO:')
    expect(doc.html).not.toContain('Memorandum')
  })

  it('a template without labels for the language renders its English chrome', () => {
    const fields = loadTemplate('time_jump_card').preview.fields
    const doc = composeDocument({ type: 'time_jump_card', fields, lang: 'es' })
    expect(doc.html).toContain('<html lang="es">')
  })

  it('puts the inject title in the document title, escaped', () => {
    const doc = composeDocument({ type: 'memo', fields: memo(), title: 'A <b>"memo"</b>' })
    expect(doc.html).toContain('<title>A &lt;b&gt;&quot;memo&quot;&lt;/b&gt;</title>')
  })

  it('refuses a language code that could break out of the attribute', () => {
    const doc = composeDocument({ type: 'memo', fields: memo(), lang: 'es"><i>' })
    expect(doc.html).toContain('<html lang="en">')
    expect(doc.html).not.toContain('lang="es"><i>')
  })

  it('loadLabels ignores files that are too large, malformed or not flat', async () => {
    const { loadLabels } = await import('./compose')
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'ttx-labels-'))
    mkdirSync(join(dir, 'labels'))
    const put = (lang: string, text: string) =>
      writeFileSync(join(dir, 'labels', `${lang}.json`), text)
    put('es', '{"a":"b","n":1}')
    put('fr', '[1,2]')
    put('de', 'nope')
    put('it', JSON.stringify({ big: 'x'.repeat(70_000) }))
    expect(loadLabels(dir, 'es')).toEqual({ a: 'b' })
    for (const lang of ['fr', 'de', 'it', 'pt']) expect(loadLabels(dir, lang)).toEqual({})
    expect(loadLabels(dir, 'es/x')).toEqual({})
    expect(loadLabels(dir, undefined)).toEqual({})
  })
})
