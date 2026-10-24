import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { composeDocument, initials } = await import('./compose')
const { listTemplateTypes, loadTemplate, validateFields } = await import('./templates')

describe('template composition', () => {
  it('lists shipped templates and skips _shared', () => {
    expect(listTemplateTypes()).toContain('time_jump_card')
    expect(listTemplateTypes().some((t) => t.startsWith('_'))).toBe(false)
  })

  it('every template preview validates against its own schema', () => {
    for (const type of listTemplateTypes()) {
      expect(validateFields(type, loadTemplate(type).preview.fields), type).toEqual([])
    }
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
