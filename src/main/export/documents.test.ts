import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { buildDocumentHtml } = await import('./documents')
const { scopeCss, embedBlankForm } = await import('./forms')
const { planTargets } = await import('./run')

const count = (html: string, needle: string) => html.split(needle).length - 1

describe('document HTML', () => {
  it('MSEL: landscape named page, phases with goal rows, running header', () => {
    const model = fixtureModel()
    const html = buildDocumentHtml(model, 'msel', 'pdf')
    expect(html).toContain('@page msel { size: letter landscape;')
    expect(html).toContain('EXERCISE — FOR TRAINING USE')
    expect(html).toContain('counter(pages)')
    expect(count(html, 'class="phase"')).toBe(model.scenario.phases.length)
    expect(count(html, 'class="goal-row"')).toBe(model.scenario.phases.length)
    expect(count(html, 'class="cell-id"')).toBe(model.scenario.msel.length)
    expect(html).not.toMatch(/<script/i)
  })

  it('escapes model text everywhere (body, attributes, running header)', () => {
    const model = fixtureModel()
    model.scenario.title = 'Evil "</style><script>alert(1)</script>'
    model.scenario.msel[0]!.event = '<img src=x onerror=alert(1)>'
    model.injects[0]!.instructorNote = '<script>steal()</script>'
    for (const doc of ['msel', 'deck', 'handbook', 'briefing', 'exercise_plan'] as const) {
      const html = buildDocumentHtml(model, doc, 'pdf')
      expect(html, doc).not.toMatch(/<script|<img src=x/i)
    }
  })

  it('deck: one page per MSEL row in the deck, text pages for rows without media', () => {
    const model = fixtureModel()
    const html = buildDocumentHtml(model, 'deck', 'pdf')
    const excluded = model.injects.filter((i) => !i.includeInDeck).length
    expect(count(html, 'class="inject-page"')).toBe(model.scenario.msel.length - excluded)
    // Rows without an inject still get a page with their event text.
    expect(html).toContain('[INJECT I-01]')
    expect(html).toContain('class="inject-text"')
    // Audio callout names the exported file; video shows its poster and file name.
    expect(html).toContain('S3-I05b-radio_call.wav')
    expect(html).toContain('S3-I05b-radio_call.mp3')
    expect(html).toContain('S3-I06-fids_board.mp4')
    expect(html).toMatch(/<img src="file:[^"]+poster\.png"/)
    // The composite (not the raw AI image) is the tweet page's picture.
    expect(html).toMatch(/<img src="file:[^"]+01M5GJ27PWYJ1CJB60T579J404\.png"/)
    expect(html).toContain('Not in deck (turned off)')
  })

  it('exercise plan cover shows the project logo only when it is set and on disk (#217)', () => {
    const model = fixtureModel()
    expect(buildDocumentHtml(model, 'exercise_plan', 'pdf')).not.toContain(
      '<img class="cover__logo"',
    )
    model.project.brand = { ...model.project.brand, logoPath: 'brand/logo-abc.png' }
    expect(buildDocumentHtml(model, 'exercise_plan', 'pdf')).not.toContain(
      '<img class="cover__logo"',
    )
    model.available.add('brand/logo-abc.png')
    expect(buildDocumentHtml(model, 'exercise_plan', 'pdf')).toMatch(
      /<img class="cover__logo" src="file:[^"]+brand\/logo-abc\.png"/,
    )
    expect(buildDocumentHtml(model, 'exercise_plan', 'preview')).toContain(
      'class="cover__logo" src="ttx-media://project/',
    )
  })

  it('preview mode loads media through ttx-media:// instead of file:', () => {
    const html = buildDocumentHtml(fixtureModel(), 'deck', 'preview')
    expect(html).toContain('src="ttx-media://project/')
    expect(html).not.toContain('src="file:')
  })

  it('handbook: markdown body plus SimCell scripts, no duplicate rubric', () => {
    const model = fixtureModel()
    const html = buildDocumentHtml(model, 'handbook', 'pdf')
    expect(html).toContain('Controller / Evaluator (C/E) Handbook')
    expect(count(html, 'Evaluation &amp; Grading Rubric')).toBe(1)
    if (model.scenario.simcellScripts.length) expect(html).toContain('SimCell Scripts')
    expect(count(html, 'End of Handbook')).toBe(1)
  })

  it('handbook falls back to structured data without handbook.md', () => {
    const model = fixtureModel()
    model.docs.handbook = ''
    const html = buildDocumentHtml(model, 'handbook', 'pdf')
    expect(html).toContain('Exercise Overview')
    expect(html).toContain('class="grid rubric"')
  })

  it('briefing: packet body and the blank ICS 201 embedded with scoped CSS', () => {
    const html = buildDocumentHtml(fixtureModel(), 'briefing', 'pdf')
    expect(html).toContain('Player Briefing Packet')
    expect(html).toContain('class="form-page"')
    expect(html).toContain('ttx-form-ics-201-prefill variant-blank')
    expect(html).toContain('.ttx-form-ics-201-prefill.variant-blank .v')
  })

  it('briefing and handbook print Location/Duration once, from the export header (#154)', () => {
    const model = fixtureModel()
    const sample = (n: string) =>
      readFileSync(resolve('tests/fixtures/generate/sample-run', n), 'utf8')
    model.docs.briefing = sample('briefing.md')
    model.docs.handbook = sample('handbook.md')
    model.scenario.brief.startWallClock = '09:00'
    const briefing = buildDocumentHtml(model, 'briefing', 'pdf')
    expect(count(briefing, 'Location:')).toBe(0)
    expect(count(briefing, '>Location<')).toBe(1)
    expect(briefing).not.toContain('Exercise Duration:')
    expect(briefing).not.toContain('Current Time:')
    expect(briefing).toContain('Weather: Clear skies')
    const handbook = buildDocumentHtml(model, 'handbook', 'pdf')
    expect(count(handbook, 'Location:')).toBe(0)
    expect(handbook).not.toContain('Exercise Date: [Date]')
  })

  it('exercise plan: cover, then every document once, with unique heading ids', () => {
    const html = buildDocumentHtml(fixtureModel(), 'exercise_plan', 'pdf')
    for (const cls of ['doc--cover', 'doc--handbook', 'doc--msel', 'doc--deck', 'doc--briefing'])
      expect(count(html, `class="doc ${cls}"`), cls).toBe(1)
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('scopeCss', () => {
  it('prefixes rules, maps html/body onto the scope, recurses into @media, drops @page', () => {
    const css = `/* c */ html,body{margin:0} body.variant-blank .v{display:none}
.page{height:1056px} @media print{.a,.b>c{x:y}} @page{size:letter} @font-face{font-family:X}`
    const out = scopeCss(css, '.s')
    expect(out).toContain('.s, .s {margin:0}')
    expect(out).toContain('.s.variant-blank .v {display:none}')
    expect(out).toContain('.s .page {height:1056px}')
    expect(out).toContain('@media print {\n.s .a, .s .b>c {x:y}')
    expect(out).not.toMatch(/@page|@font-face/)
  })
  it('scopes the shipped ICS 201 template without leaking a bare selector', () => {
    const form = embedBlankForm('ics_201_prefill', 'ICS 201')
    for (const rule of form.css.split('\n').filter((l) => l.includes('{') && !l.startsWith('@')))
      expect(rule.startsWith('.ttx-form-ics-201-prefill'), rule).toBe(true)
  })
})

describe('planTargets', () => {
  it('runs in a fixed order and pulls in what the ZIP needs', () => {
    expect(planTargets(['json'])).toEqual(['json'])
    expect(planTargets(['markdown', 'msel_pdf'])).toEqual(['media', 'msel_pdf', 'markdown'])
    expect(planTargets(['zip'])).toEqual([
      'media',
      'msel_pdf',
      'deck_pdf',
      'handbook_pdf',
      'briefing_pdf',
      'exercise_plan_pdf',
      'json',
      'markdown',
      'zip',
    ])
  })
})
