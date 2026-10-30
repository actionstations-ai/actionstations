import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureAar, fixtureModel } = await import('../../../tests/fixtures/export/model')
const { renderAarMarkdown } = await import('../aar/markdown')
const { buildDocumentHtml } = await import('./documents')
const { scopeCss, embedBlankForm } = await import('./forms')
const { planTargets } = await import('./run')

const count = (html: string, needle: string) => html.split(needle).length - 1

const plan = (id = 'plan1') => ({
  kind: 'site_plan' as const,
  id,
  title: 'Terminal',
  source: `maps/${id}/plan.png`,
  image: `maps/${id}/plan.png`,
  width: 800,
  height: 600,
})
const pin = (id: string, label: string, mapId = 'plan1') => ({
  id,
  label,
  kind: 'incident' as const,
  note: '',
  positions: [{ mapId, x: 10, y: 20 }],
})

describe('Locations pages (#500)', () => {
  it('adds a numbered marker page for each site plan the MSEL uses, in the MSEL and handbook', () => {
    const model = fixtureModel()
    model.scenario.msel[0] = { ...model.scenario.msel[0]!, placeIds: ['gate'] }
    model.scenario.msel[1] = { ...model.scenario.msel[1]!, placeIds: ['gate', 'bhs'] }
    model.maps = {
      formatVersion: 1,
      maps: [plan()],
      places: [pin('gate', 'Gate A1'), pin('bhs', 'BHS <room>'), pin('unused', 'Unused')],
    }
    for (const doc of ['msel', 'handbook'] as const) {
      const html = buildDocumentHtml(model, doc, 'pdf')
      expect(html, doc).toContain('Locations: Terminal')
      expect(count(html, 'class="locations__pin'), doc).toBe(2)
      expect(html, doc).toContain('Gate A1')
      expect(html, doc).toContain('BHS &lt;room&gt;')
      expect(html, doc).not.toContain('Unused')
      expect(html, doc).toContain('maps/plan1/plan.png')
    }
  })

  it('splits more than 12 places across pages', () => {
    const model = fixtureModel()
    const places = Array.from({ length: 14 }, (_, i) => pin(`p${i}`, `Place ${i}`))
    model.scenario.msel[0] = { ...model.scenario.msel[0]!, placeIds: places.map((p) => p.id) }
    model.maps = { formatVersion: 1, maps: [plan()], places }
    const html = buildDocumentHtml(model, 'msel', 'pdf')
    expect(count(html, 'class="locations"')).toBe(2)
    expect(html).toContain('Locations: Terminal (1 of 2)')
    expect(html).toContain('Locations: Terminal (2 of 2)')
  })

  it('plots a geographic map by latitude and longitude, with coordinates and no image', () => {
    const model = fixtureModel()
    model.scenario.msel[0] = { ...model.scenario.msel[0]!, placeIds: ['pier', 'lot'] }
    const at = (lat: number, lon: number) => [{ mapId: 'harbor', lat, lon }]
    model.maps = {
      formatVersion: 1,
      maps: [
        {
          kind: 'geo',
          id: 'harbor',
          title: 'Harbor',
          basemap: { kind: 'online', provider: 'openfreemap' },
          style: 'light',
        },
      ],
      places: [
        { id: 'pier', label: 'Pier 4', kind: 'incident', note: '', positions: at(47.6, -122.34) },
        {
          id: 'lot',
          label: 'Staging lot',
          kind: 'staging',
          note: '',
          positions: at(47.58, -122.3),
        },
        {
          id: 'far',
          label: 'Not in the MSEL',
          kind: 'other',
          note: '',
          positions: at(47.5, -122.2),
        },
      ],
    }
    for (const doc of ['msel', 'handbook'] as const) {
      const html = buildDocumentHtml(model, doc, 'pdf')
      expect(html, doc).toContain('Locations: Harbor')
      expect(count(html, 'class="locations__pin'), doc).toBe(2)
      expect(html, doc).toContain('locations__blank')
      expect(html, doc).toContain('47.6000° N, 122.3400° W')
      expect(html, doc).toContain('Positions only')
      expect(html, doc).not.toContain('Not in the MSEL')
      expect(html, doc).not.toContain('<img class="locations__base"')
    }
  })

  it('adds nothing when the MSEL names no place', () => {
    const model = fixtureModel()
    model.maps = { formatVersion: 1, maps: [plan()], places: [pin('gate', 'Gate A1')] }
    expect(buildDocumentHtml(model, 'msel', 'pdf')).not.toContain('class="locations"')
  })
})

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
    for (const doc of [
      'msel',
      'deck',
      'handbook',
      'briefing',
      'exercise_plan',
      'explan',
      'sitman',
      'handbook_hseep',
    ] as const) {
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

  it('handouts: the hand-written markdown under its own label, escaped (#224)', () => {
    const model = fixtureModel()
    model.docs.handouts =
      '# Action Menu Card\n\n| ID | Action |\n|---|---|\n| A-01 | Trace <b onclick=x>the</b> email |'
    model.docs.controller_handouts = '# Clue Cards Deck\n\nController note: keep this.'
    const players = buildDocumentHtml(model, 'handouts', 'pdf')
    expect(players).toContain('Player Handouts')
    expect(players).toContain('Action Menu Card')
    expect(players).toContain('A-01')
    expect(players).not.toMatch(/<b onclick/i)
    const controller = buildDocumentHtml(model, 'controller_handouts', 'pdf')
    expect(controller).toContain('Controller Materials')
    expect(controller).toContain('Controller note: keep this.')
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

  it('EEG packet: one landscape guide per capability with cited tasks, keys and rating boxes (#421)', () => {
    const model = fixtureModel()
    const html = buildDocumentHtml(model, 'eeg', 'pdf')
    expect(html).toContain('@page eeg { size: letter landscape;')
    expect(html).toContain('Exercise Evaluation Guides (EEG)')
    expect(count(html, 'class="eeg"')).toBe(model.scenario.evaluation.eegs.length)
    for (const name of [
      'Public Information and Warning',
      'Operational Coordination',
      'Infrastructure Systems',
      'Cybersecurity',
    ])
      expect(html).toContain(name)
    // Task text, its source section and its observation keys with the rows' times.
    expect(html).toContain('Notify the FBI Cyber Task Force and CISA')
    expect(html).toContain('TIRP 13.7 Checklist: Cybersecurity Incident')
    expect(html).toContain('ASP 6.4 Access Control System Failure (Cyber/Power)')
    expect(html).toContain('I-06 (1:15), I-09 (2:00)')
    expect(count(html, 'class="eeg__rating"')).toBe(15)
    // Objectives mapped to their capabilities; no observations, no player names.
    expect(html).toContain('Operational Coordination, Infrastructure Systems')
    expect(html).not.toMatch(/<script/i)
    // The MSEL and the deck reference the tasks per row.
    expect(buildDocumentHtml(model, 'msel', 'pdf')).toContain(
      'Evaluate: T-07 · Operational Coordination',
    )
    expect(buildDocumentHtml(model, 'deck', 'pdf')).toMatch(/Evaluate: T-02, [^<]*T-14 · /)
  })

  it('EEG packet: one blank copy per evaluator seat, each labelled and with unique ids (#421)', () => {
    const model = { ...fixtureModel(), evaluatorCopies: 3 }
    const html = buildDocumentHtml(model, 'eeg', 'pdf')
    expect(count(html, 'class="eeg"')).toBe(3 * model.scenario.evaluation.eegs.length)
    for (const n of [1, 2, 3]) expect(html).toContain(`Evaluator ${n}`)
    expect(html).not.toContain('Evaluator ____')
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('EEG packet: a single copy keeps the blank Evaluator line (#421)', () => {
    const html = buildDocumentHtml(fixtureModel(), 'eeg', 'pdf')
    expect(html).toContain('____________')
    expect(html).not.toContain('Evaluator 1')
  })

  it('EEG packet says so when the scenario has no guides yet', () => {
    const model = fixtureModel()
    model.scenario.evaluation = { objectiveCapabilities: [], eegs: [] }
    const html = buildDocumentHtml(model, 'eeg', 'pdf')
    expect(html).toContain('No evaluation guides have been generated')
    expect(count(html, 'class="eeg"')).toBe(0)
  })

  describe('hazard data sources (#439)', () => {
    const appendix =
      '## Hazard data sources\n\n- Credit: U.S. Geological Survey. Accessed 2026-10-29.'

    it('the handbook ends with the sources and their attribution', () => {
      const model = fixtureModel()
      model.hazardAppendix = appendix
      const html = buildDocumentHtml(model, 'handbook', 'pdf')
      expect(html).toContain('Hazard data sources')
      expect(html).toContain('Credit: U.S. Geological Survey')
    })

    it('a scenario without a snapshot has no such section, and player material never has it', () => {
      expect(buildDocumentHtml(fixtureModel(), 'handbook', 'pdf')).not.toContain(
        'Hazard data sources',
      )
      const model = fixtureModel()
      model.hazardAppendix = appendix
      for (const doc of ['briefing', 'handouts'] as const)
        expect(buildDocumentHtml(model, doc, 'pdf'), doc).not.toContain('Hazard data sources')
    })
  })

  describe('plan seams (#427)', () => {
    const SPAN = 'All public releases must be approved by the Public Information Officer.'
    function seamModel() {
      const model = fixtureModel()
      const row = model.scenario.msel.find((r) => r.purposeTag === 'CORE_NARRATIVE')!
      row.seamId = 'a1a1a1a1a1a1a1a1'
      model.scenario.seams = [
        {
          id: 'a1a1a1a1a1a1a1a1',
          slot: 'release_approver',
          slotLabel: 'Who approves public releases',
          kind: 'contradiction',
          confirmed: true,
          a: {
            documentId: 'erp',
            documentTitle: 'Emergency Response Plan',
            headingPath: 'ERP › 4.2 Releases',
            chunkId: 1,
            span: 'Releases are approved by the General Manager.',
          },
          b: {
            documentId: 'cca',
            documentTitle: 'Crisis Communications Annex',
            headingPath: 'CCA › C.1 Approval',
            chunkId: 2,
            span: SPAN,
          },
          phaseId: row.phaseId,
        },
      ]
      return { model, row }
    }

    it('the handbook (and its fallback) carries the seams section', () => {
      const { model, row } = seamModel()
      const html = buildDocumentHtml(model, 'handbook', 'pdf')
      expect(html).toContain('Plan seams this exercise tests')
      expect(html).toContain(SPAN)
      expect(html).toContain(row.id)
      model.docs.handbook = ''
      expect(buildDocumentHtml(model, 'handbook', 'pdf')).toContain(
        'Plan seams this exercise tests',
      )
    })

    it('player material never mentions a seam', () => {
      const { model } = seamModel()
      for (const doc of ['briefing', 'sitman_player', 'handouts'] as const) {
        const html = buildDocumentHtml(model, doc, 'pdf')
        expect(html, doc).not.toContain(SPAN)
        expect(html, doc).not.toMatch(/plan seam/i)
      }
    })

    it('the controller MSEL marks seam rows in the Source check column', () => {
      const { model, row } = seamModel()
      model.sourceCheck = Object.fromEntries(model.scenario.msel.map((r) => [r.id, 'Grounded']))
      const html = buildDocumentHtml(model, 'msel', 'pdf')
      expect(count(html, 'Grounded · Seam')).toBe(1)
      expect(html).toContain(row.id)
    })
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

  it('exercise plan: cover, ExPlan, SitMan, HSEEP handbook, MSEL, deck, briefing (#420)', () => {
    const html = buildDocumentHtml(fixtureModel(), 'exercise_plan', 'pdf')
    const order = [
      'class="doc doc--cover"',
      'class="doc doc--hseep doc--explan"',
      'class="doc doc--hseep doc--sitman"',
      'class="doc doc--hseep doc--handbook_hseep"',
      'class="doc doc--msel"',
      'class="doc doc--deck"',
      'class="doc doc--briefing"',
    ]
    for (const cls of order) expect(count(html, cls), cls).toBe(1)
    const at = order.map((cls) => html.indexOf(cls))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('HSEEP documents: named pages, the exercise marking and escaped model text (#420)', () => {
    const model = fixtureModel()
    model.conduct.marking = 'EXERCISE — UNCLASSIFIED'
    model.scenario.phases[0]!.title = '<script>alert(1)</script>'
    for (const doc of ['explan', 'sitman', 'sitman_player', 'handbook_hseep'] as const) {
      const html = buildDocumentHtml(model, doc, 'pdf')
      expect(html, doc).toContain(`@page ${doc} {`)
      expect(html, doc).toContain('EXERCISE — UNCLASSIFIED')
      expect(html, doc).not.toMatch(/<script/i)
      expect(html, doc).toContain('<th scope=')
    }
  })

  it('blank exercise details print fill-in lines, never invented values (#420)', () => {
    const html = buildDocumentHtml(fixtureModel(), 'explan', 'pdf')
    expect(html).toMatch(/<th scope="row">Sponsor<\/th>\s*<td>\s*<span class="fill-in">/)
    expect(html).toContain('To be completed')
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
  it('embeds the form body: the template root, with its language, is found', () => {
    const form = embedBlankForm('ics_201_prefill', 'ICS 201')
    expect(form.html).toContain('<main lang="en" class="inject-root inject-ics_201_prefill"')
    expect(form.html).toContain('INCIDENT BRIEFING')
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
      'msel_xlsx',
      'msel_pdf',
      'path_pdf',
      'deck_pdf',
      'handbook_pdf',
      'briefing_pdf',
      'player_injects_pdf',
      'exercise_plan_pdf',
      'surveys_pdf',
      'survey_results_pdf',
      'eeg_pdf',
      'explan_pdf',
      'sitman_pdf',
      'handbook_hseep_pdf',
      'aar_pdf',
      'json',
      'markdown',
      'zip',
    ])
  })
})

describe('AAR/IP document (#419)', () => {
  it('prints the HSEEP layout with only confirmed ratings and a landscape Improvement Plan', () => {
    const model = fixtureModel({ aar: fixtureAar() })
    const html = buildDocumentHtml(model, 'aar', 'pdf')
    expect(html).toContain('@page aar { size: letter;')
    expect(html).toContain('@page aar-ip { size: letter landscape;')
    expect(html).toContain('class="doc doc--aar"')
    for (const heading of [
      'Exercise Overview',
      'Executive Summary',
      'Analysis of Core Capabilities',
      'Appendix A: Improvement Plan',
      'Appendix B: Exercise Participants',
      'Appendix D: Acronyms',
    ])
      expect(html, heading).toContain(heading)
    // No participant feedback was recorded: no Appendix C.
    expect(html).not.toContain('Appendix C')
    // Status: a rating is still pending, and the document says so instead of printing it.
    expect(html).toContain('Draft (ratings pending)')
    expect(html).toContain('Rating pending')
    // The confirmed rating is marked once; the proposed M of Operational Coordination is not.
    const rows = html.split('<tr>').filter((r) => r.includes('aar-ratings__mark'))
    const marked = rows.filter((r) => r.includes('aar-ratings__mark">X<'))
    expect(marked).toHaveLength(1)
    expect(marked[0]).toContain('Public Information and Warning')
    expect(rows.find((r) => r.includes('Operational Coordination'))).toContain('Rating pending')
    expect(html).not.toContain('Performed with Major Challenges (M)</strong>')
    // Findings with reference and evidence lines, never raw refs.
    expect(html).toContain('Strength 1: Plain-language PA and social media messages')
    expect(html).toContain('TIRP 1.4.5')
    expect(html).toContain('Evidence: note on I-06; 1 observation; 1 hot wash item')
    expect(html).not.toContain('obs:O-I-04-T-01')
    // Appendix A: the eight columns, the typed organization and the proposed role in brackets.
    for (const col of [
      'Core Capability',
      'Issue/Area for Improvement',
      'Corrective Action',
      'Capability Element',
      'Primary Responsible Organization',
      'Organization POC',
      'Start Date',
      'Completion Date',
    ])
      expect(html).toContain(`<th scope="col">${col}</th>`)
    expect(html).toContain('NCIA Public Affairs')
    expect(html).toContain('[IC]')
    expect(count(html, '<td>Revise TIRP 13.6')).toBe(1)
    expect(html).toContain('Skyline Airways')
    expect(html).toContain('Airport Operational Database')
    expect(html).toContain('End of After-Action Report / Improvement Plan')
  })

  it('takes the edited prose from documents/aar.md and the tables from aar.json', () => {
    const aar = fixtureAar()
    const model = fixtureModel({ aar })
    model.docs.aar = renderAarMarkdown(aar, model.scenario, 'NCIA')
      .replace('The exercise tested the response', 'EDITED SUMMARY: the exercise tested')
      .replace('Plain-language PA and social media messages', 'EDITED FINDING TITLE')
    const html = buildDocumentHtml(model, 'aar', 'pdf')
    expect(html).toContain('EDITED SUMMARY')
    expect(html).toContain('EDITED FINDING TITLE')
    expect(count(html, 'class="section aar-capability"')).toBe(0)
    expect(count(html, 'Appendix A: Improvement Plan')).toBe(1)
  })

  it('escapes model text in findings and says when no draft exists', () => {
    const aar = fixtureAar()
    aar.capabilities[0]!.strengths[0]!.title = '<img src=x onerror=alert(1)>'
    aar.capabilities[0]!.strengths[0]!.analysisMd = '<script>steal()</script> fine'
    const html = buildDocumentHtml(fixtureModel({ aar }), 'aar', 'pdf')
    expect(html).not.toMatch(/<script|<img src=x/i)
    const none = buildDocumentHtml(fixtureModel(), 'aar', 'preview')
    expect(none).toContain('No After-Action Report yet')
    expect(none).not.toContain('Appendix A')
  })
})
