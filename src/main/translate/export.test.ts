// Spanish export against a real project folder, with the PDF printer and the picture
// renderer stubbed: the unreviewed-translation refusal and stamp, the player set in
// players/es/, large print, and the controller files that must never reach players/.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { Scenario, ScenarioBrief, type Inject } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))
const printed: { html: string; what: string }[] = []
vi.mock('../export/pdf', () => ({
  htmlToPdf: async (html: string, what: string) => {
    printed.push({ html, what })
    return Buffer.from('%PDF-stub')
  },
}))
const rendered: { lang: string | undefined; html: string }[] = []
vi.mock('../render/window', () => ({
  renderPng: async (doc: { html: string; meta: { width: number } }) => {
    rendered.push({ lang: /<html lang="([^"]+)"/.exec(doc.html)?.[1], html: doc.html })
    return {
      png: Buffer.from(`png#${rendered.length}`),
      width: doc.meta.width,
      height: 300,
      scale: 2,
    }
  },
  renderPdf: async () => Buffer.from('%PDF form'),
}))
process.env.TTX_RESOURCES = resolve('.')

const { createProject } = await import('../project/store')
const { resetSettingsCache } = await import('../settings/store')
const scenarios = await import('../scenario/store')
const { MockTextProvider } = await import('../providers/mock/adapter')
const { loadPrompt, renderPrompt } = await import('../prompts')
const { runTranslation } = await import('./job')
const store = await import('./store')
const { loadExportModel } = await import('../export/model')
const { runExport } = await import('../export/run')
const { assertSpanishReady } = await import('../export/variants')

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
)
const config = { id: 'mock', kind: 'mock' as const, label: 'Mock', options: {}, enabled: true }
const jobCtx = {
  jobId: 'job',
  signal: new AbortController().signal,
  progress: () => undefined,
  log: () => undefined,
  throwIfCancelled: () => undefined,
}

let root: string
let scenarioId: string

const translate = () =>
  runTranslation(
    jobCtx,
    { root, scenarioId, lang: 'es' },
    {
      resolveTextProvider: async () => ({
        provider: new MockTextProvider(config),
        model: 'mock-large',
        providerId: 'mock',
      }),
      loadPrompt,
      renderPrompt,
    },
  )

const exportRun = async (targets: Parameters<typeof runExport>[2], options = {}) =>
  runExport(
    await loadExportModel(root, scenarioId),
    mkdtempSync(join(tmpdir(), 'ttx-out-')),
    targets,
    jobCtx,
    options,
  )

const tweet = (id: string, rowId: string): Inject =>
  ({
    id,
    mselRowId: rowId,
    type: 'tweet',
    title: `Post ${id}`,
    deliveryMode: 'display_main_screen',
    fields: {
      displayName: 'Riverbend Water',
      handle: 'RiverbendWater',
      text: 'Boil water advisory.',
    },
    citations: [],
    assets: [],
    versions: [],
    includeInDeck: true,
    locked: false,
  }) as Inject

beforeEach(async () => {
  printed.length = 0
  rendered.length = 0
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  root = (
    await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-ex-')), name: 'Riverbend' })
  ).path
  const s = await scenarios.createScenario(root, {
    title: 'Water',
    brief: ScenarioBrief.parse({ userPrompt: 'x' }),
  })
  scenarioId = s.id
  const parsed = Scenario.parse({ ...FIXTURE, id: s.id, projectId: s.projectId })
  const msel = [
    ...parsed.msel,
    { ...parsed.msel[1]!, id: 'I-99', toLabel: 'SimCell', toRoleIds: [] },
  ]
  await scenarios.saveScenario(
    root,
    { ...parsed, msel, languages: { player: ['es'], controller: true } },
    { by: 'user' },
  )
  await scenarios.writeScenarioDoc(
    root,
    scenarioId,
    'briefing',
    '# Welcome\n\nThis is an EXERCISE.',
    { by: 'user' },
  )
  await scenarios.writeScenarioDoc(
    root,
    scenarioId,
    'handbook',
    '# Handbook\n\nControllers only.',
    { by: 'user' },
  )
  await scenarios.saveInject(root, scenarioId, tweet('inj-1', 'I-04'), { by: 'user' })
  await scenarios.saveInject(root, scenarioId, tweet('inj-sim', 'I-99'), { by: 'user' })
})

const es = { playerLanguages: ['en', 'es'] as ('en' | 'es')[] }

describe('Spanish export: unreviewed translations (spec 0435 FR-11)', () => {
  it('refuses when nothing is translated yet, naming the items', async () => {
    await expect(exportRun(['briefing_pdf'], es)).rejects.toThrow(
      /Player Briefing Packet \(not translated\)/,
    )
    expect(printed).toHaveLength(0)
  })

  it('refuses machine translations and lists every unreviewed item', async () => {
    await translate()
    const error = await exportRun(['briefing_pdf'], es).catch((e: Error) => e)
    expect(String(error)).toMatch(/Player Briefing Packet \(machine translation, not reviewed\)/)
    expect(String(error)).toMatch(/I-04: Post inj-1/)
    expect(printed).toHaveLength(0)
  })

  it('refuses a translation made stale by an English edit', async () => {
    await translate()
    await store.acceptItems(root, scenarioId, 'es')
    await scenarios.writeScenarioDoc(root, scenarioId, 'briefing', '# Welcome\n\nNew text.', {
      by: 'user',
    })
    await expect(exportRun(['briefing_pdf'], es)).rejects.toThrow(
      /English changed since it was translated/,
    )
  })

  it('the handler check refuses before any job starts', async () => {
    await translate()
    await expect(
      assertSpanishReady(await loadExportModel(root, scenarioId), es),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('with the override, writes the files and stamps every page', async () => {
    await translate()
    const r = await exportRun(['briefing_pdf'], { ...es, allowUnreviewed: true })
    const spanish = printed.filter((p) => p.html.includes('<html lang="es">'))
    expect(spanish.length).toBeGreaterThan(0)
    for (const p of spanish)
      expect(p.html).toContain('Traducción automática sin revisar / Unreviewed machine translation')
    const english = printed.filter((p) => p.html.includes('<html lang="en">'))
    for (const p of english) expect(p.html).not.toContain('Traducción automática')
    expect(r.files.map((f) => basename(f))).toContain(
      'Flight-to-Nowhere-Player-Briefing-Packet-es.pdf',
    )
  })

  it('does not ask about Spanish when the export is English only', async () => {
    const r = await exportRun(['briefing_pdf'])
    expect(r.files.map((f) => basename(f))).not.toContain(
      'Flight-to-Nowhere-Player-Briefing-Packet-es.pdf',
    )
  })
})

describe('Spanish export of reviewed material', () => {
  beforeEach(async () => {
    await translate()
    await store.acceptItems(root, scenarioId, 'es')
  })

  it('prints the Spanish packet in es-US, unstamped, with the translated text', async () => {
    await exportRun(['briefing_pdf'], es)
    const packet = printed.find(
      (p) => p.html.includes('<html lang="es">') && p.html.includes('EJERCICIO'),
    )!
    expect(packet.html).not.toContain('Traducción automática')
    expect(packet.html).toContain('[es] This is an EJERCICIO')
    expect(packet.html).toContain('Paquete informativo para participantes')
    expect(packet.html).toContain('"Página "')
  })

  it('renders the translated pictures from the template with lang="es" and keeps them', async () => {
    await exportRun(['player_injects_pdf'], es)
    expect(rendered.map((r) => r.lang)).toEqual(['es'])
    const [inject] = (await scenarios.listInjects(root, scenarioId)).filter((i) => i.id === 'inj-1')
    expect(inject!.translations!.es!.assets.map((a) => a.kind)).toEqual(['image'])
    expect(inject!.translations!.es!.assets[0]!.provenance.lang).toBe('es')
    const cards = printed.filter((p) => p.html.includes('player-card'))
    const spanish = cards.find((p) => p.html.includes('<html lang="es">'))!
    expect(spanish.html).toContain('[es] Post inj-1')
    expect(spanish.html).toContain('[es] Boil water advisory.')
    expect(spanish.html).not.toContain('Post inj-sim')
  })

  it('ZIP: the Spanish set goes to players/es/, nothing from the controllers', async () => {
    const r = await exportRun(['zip'], { ...es, controllerLanguages: ['es'] })
    const zip = await JSZip.loadAsync(readFileSync(r.zipPath!))
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir)
    expect(names.filter((n) => n.startsWith('players/es/')).sort()).toEqual([
      'players/es/Flight-to-Nowhere-Player-Briefing-Packet-es.pdf',
      'players/es/Flight-to-Nowhere-Player-Injects-es.pdf',
    ])
    expect(names).toContain('players/Flight-to-Nowhere-Player-Briefing-Packet.pdf')
    expect(names).toContain('players/Flight-to-Nowhere-Player-Injects.pdf')
    expect(names).toContain('facilitator/es/Flight-to-Nowhere-Controller-Evaluator-Handbook-es.pdf')
    expect(names.filter((n) => n.startsWith('players/')).join()).not.toMatch(/Handbook|MSEL|Deck/)
  })

  it('Spanish only: the English briefing is not in players/', async () => {
    const r = await exportRun(['zip'], { playerLanguages: ['es'] })
    const zip = await JSZip.loadAsync(readFileSync(r.zipPath!))
    const players = Object.keys(zip.files).filter(
      (n) => n.startsWith('players/') && !zip.files[n]!.dir,
    )
    expect(players).toContain('players/es/Flight-to-Nowhere-Player-Briefing-Packet-es.pdf')
    expect(players).not.toContain('players/Flight-to-Nowhere-Player-Briefing-Packet.pdf')
    expect(players).not.toContain('players/Flight-to-Nowhere-Player-Injects.pdf')
  })

  it('large print: -large-print files in both languages, with the large-print layer on', async () => {
    const r = await exportRun(['briefing_pdf', 'player_injects_pdf'], { ...es, largePrint: true })
    const names = r.files.map((f) => basename(f))
    for (const n of [
      'Flight-to-Nowhere-Player-Briefing-Packet-large-print.pdf',
      'Flight-to-Nowhere-Player-Briefing-Packet-es-large-print.pdf',
      'Flight-to-Nowhere-Player-Injects-large-print.pdf',
      'Flight-to-Nowhere-Player-Injects-es-large-print.pdf',
    ])
      expect(names).toContain(n)
    const large = printed.filter((p) => p.html.includes('<body class="large-print">'))
    expect(large.length).toBe(4)
    expect(printed.filter((p) => !p.html.includes('large-print">')).length).toBeGreaterThan(0)
    expect(existsSync(r.files.find((f) => f.endsWith('es-large-print.pdf'))!)).toBe(true)
  })
})
