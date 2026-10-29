// Screen-reader friendly and translated player documents (spec 0435): document language,
// real text for every inject picture, heading order, large print, and Spanish chrome.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { buildDocumentHtml } = await import('./documents')
const { formatDocDate, tr, localizeRendition, exportStrings } = await import('./lang')
const { variantFileName, documentFileNames } = await import('./naming')
const { playerInjectsView } = await import('./views')

const headings = (html: string): number[] =>
  [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]))

/** One h1, and no heading more than one level below the one before it. */
function expectHeadingOrder(html: string, label: string): void {
  const levels = headings(html)
  expect(
    levels.filter((l) => l === 1),
    `${label}: h1 count`,
  ).toHaveLength(1)
  levels.forEach((level, i) => {
    if (i > 0)
      expect(level, `${label}: h${level} after h${levels[i - 1]}`).toBeLessThanOrEqual(
        levels[i - 1]! + 1,
      )
  })
}

describe('document language and titles (spec 0435 FR-14)', () => {
  it('English documents say lang="en" and carry a title', () => {
    const html = buildDocumentHtml(fixtureModel(), 'briefing', 'pdf')
    expect(html).toContain('<html lang="en">')
    expect(html).toMatch(/<title>Player Briefing Packet — /)
  })

  it('Spanish documents say lang="es", use Spanish chrome and the es-US date', () => {
    const base = fixtureModel()
    const model = { ...base, docs: { ...base.docs, briefing: '' }, lang: 'es' as const }
    const html = buildDocumentHtml(model, 'briefing', 'pdf')
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('Paquete informativo para participantes')
    expect(html).toContain('Asignación de equipos y órdenes permanentes')
    expect(html).toContain(formatDocDate(model.generatedAt, 'es'))
    expect(html).toContain('"Página "')
    expect(html).toContain('EJERCICIO — PARA USO EN ENTRENAMIENTO')
  })

  it('player documents have one h1 and no gaps in heading order', () => {
    const model = fixtureModel()
    for (const doc of ['briefing', 'player_injects'] as const)
      expectHeadingOrder(buildDocumentHtml(model, doc, 'pdf'), doc)
  })

  it('tables have column headers with scope', () => {
    const base = fixtureModel()
    const html = buildDocumentHtml(
      { ...base, docs: { ...base.docs, briefing: '' } },
      'briefing',
      'pdf',
    )
    expect(html).toMatch(/<th scope="col">Team<\/th>/)
  })
})

describe('inject pictures as real text (spec 0435 FR-15)', () => {
  it('the deck puts the inject words after the picture, in text a screen reader reads', () => {
    const html = buildDocumentHtml(fixtureModel(), 'deck', 'pdf')
    const figure = html.indexOf('class="inject-media"')
    expect(figure).toBeGreaterThan(0)
    expect(html.slice(figure)).toMatch(/<\/figure>\s*<div class="rendition sr-only">\s*<p>/)
  })

  it('keeps the alt text short: format, inject and title, not the whole message', () => {
    const html = buildDocumentHtml(fixtureModel(), 'deck', 'pdf')
    const alts = [...html.matchAll(/<img src="[^"]+" alt="([^"]*)"/g)].map((m) => m[1]!)
    expect(alts.length).toBeGreaterThan(0)
    for (const alt of alts) expect(alt.length).toBeLessThan(160)
  })

  it('player injects: only rows players receive, the words follow each picture', () => {
    const model = fixtureModel()
    const view = playerInjectsView(model, '', 'pdf')
    const rowIds = new Set(model.scenario.msel.map((r) => r.id))
    expect(view.cards.length).toBeGreaterThan(0)
    expect(view.cards.length).toBeLessThanOrEqual(rowIds.size)
    const html = buildDocumentHtml(model, 'player_injects', 'pdf')
    expect(html).toContain('class="doc doc--player-injects"')
    expect(html).not.toContain('Instructor note')
    expect(html).not.toContain('Expected action')
    for (const card of view.cards.filter((c) => c.image))
      expect(card.lines.length, card.title).toBeGreaterThan(0)
  })

  it('a controller-only row never reaches the player injects', () => {
    const model = fixtureModel()
    const row = model.scenario.msel.find((r) => model.injects.some((i) => i.mselRowId === r.id))!
    const before = playerInjectsView(model, '', 'pdf').cards.length
    row.toLabel = 'SimCell'
    row.toRoleIds = []
    expect(playerInjectsView(model, '', 'pdf').cards.length).toBe(before - 1)
  })

  it('rendition labels follow the document language', () => {
    expect(localizeRendition('From: Ana\nTo: Luis\nSubject: Agua\nhello', 'es')).toBe(
      'De: Ana\nPara: Luis\nAsunto: Agua\nhello',
    )
    expect(localizeRendition('Sent 10:42: ok', 'es')).toBe('Enviado 10:42: ok')
    expect(localizeRendition('From: Ana', 'en')).toBe('From: Ana')
  })
})

describe('large print (spec 0435 FR-17)', () => {
  const css = readFileSync(resolve('templates/export/print.css'), 'utf8')

  it('turns the layer on with a body class and drops the blank form', () => {
    const html = buildDocumentHtml({ ...fixtureModel(), largePrint: true }, 'briefing', 'pdf')
    expect(html).toContain('<body class="large-print">')
    expect(html).not.toContain('class="form-page"')
    expect(html).toContain('End of Briefing Packet.')
    expect(buildDocumentHtml(fixtureModel(), 'briefing', 'pdf')).toContain('<body class="">')
  })

  it('sets body text at 18 pt or more, headings at 24 pt or more, line height 1.5, left aligned', () => {
    const layer = css.slice(css.indexOf('/* ---- Large print'))
    expect(layer).toMatch(
      /\.large-print \{[^}]*font-size: 18pt;[^}]*line-height: 1\.5;[^}]*text-align: left;/,
    )
    for (const h of ['h1', 'h2'])
      expect(layer).toMatch(new RegExp(`\\.large-print ${h} \\{[^}]*font-size: (2[4-9]|3\\d)pt`))
    expect(layer).toContain('background-image: none')
  })

  it('shows the inject words as visible text', () => {
    const layer = css.slice(css.indexOf('/* ---- Large print'))
    expect(layer).toMatch(/\.large-print \.rendition\.sr-only \{[^}]*position: static;/)
  })

  it('enlarges the running header and footer', () => {
    const html = buildDocumentHtml({ ...fixtureModel(), largePrint: true }, 'briefing', 'pdf')
    expect(html).toContain('font-size: 11pt')
  })
})

describe('export strings and file names (spec 0435 FR-10, FR-13)', () => {
  it('falls back to the English text when there is no entry', () => {
    expect(tr('es', 'Location')).toBe('Ubicación')
    expect(tr('es', 'Something new')).toBe('Something new')
    expect(tr('en', 'Location')).toBe('Location')
    expect(tr(undefined, 'Location')).toBe('Location')
  })

  it('every string in es.json is a flat string', () => {
    for (const [k, v] of Object.entries(exportStrings('es'))) {
      expect(typeof k).toBe('string')
      expect(typeof v).toBe('string')
    }
  })

  it('formats dates in the document locale', () => {
    const iso = '2027-03-04T12:00:00Z'
    expect(formatDocDate(iso, 'en')).toBe('Mar 4, 2027')
    expect(formatDocDate(iso, 'es')).toBe(
      new Date(iso).toLocaleDateString('es-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    )
    expect(formatDocDate(iso, 'es')).not.toBe(formatDocDate(iso, 'en'))
  })

  it('names Spanish and large-print files in a fixed order', () => {
    const name = documentFileNames('Water Plan').briefing
    expect(variantFileName(name, {})).toBe('Water-Plan-Player-Briefing-Packet.pdf')
    expect(variantFileName(name, { lang: 'es' })).toBe('Water-Plan-Player-Briefing-Packet-es.pdf')
    expect(variantFileName(name, { largePrint: true })).toBe(
      'Water-Plan-Player-Briefing-Packet-large-print.pdf',
    )
    expect(variantFileName(name, { lang: 'es', largePrint: true })).toBe(
      'Water-Plan-Player-Briefing-Packet-es-large-print.pdf',
    )
  })
})
