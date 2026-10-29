// Snapshots, the AAR/IP import, the schedule rule and the exports of the program (#424).
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import mammoth from 'mammoth'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))
vi.mock('../render/window', () => ({
  renderPdf: async () => Buffer.from('%PDF-1.4 test'),
}))

const store = await import('./store')
const actions = await import('./actions')
const links = await import('./links')
const snapshots = await import('./snapshot')
const importer = await import('./import-aar')
const schedule = await import('./schedule')
const exporter = await import('./export')
const { createProject } = await import('../project/store')
const { createScenario } = await import('../scenario/store')
const { resetSettingsCache } = await import('../settings/store')
const { Aar, ScenarioBrief, Schedule } = await import('@shared/schemas')

let parent: string
let programRoot: string
let projectRoot: string
let scenarioId: string

const NOW = '2026-04-01T10:00:00.000Z'

function aarWith(actionText: string) {
  return Aar.parse({
    createdAt: NOW,
    updatedAt: NOW,
    exerciseDate: '2026-03-12',
    capabilities: [
      {
        capability: 'public_information_and_warning',
        areasForImprovement: [
          {
            id: 'F1',
            title: 'PIO approval chain is unclear',
            analysisMd: 'Players did not know who approves a release.',
            evidence: ['note:general'],
            citations: [
              {
                documentId: 'eop',
                documentTitle: 'EOP',
                headingPath: 'EOP › 6.4 Public Information',
              },
            ],
            correctiveActions: [
              {
                id: 'A1',
                action: actionText,
                element: 'planning',
                ownerOrganization: 'Airport PIO',
                poc: 'J. Ruiz',
                dueDate: '2026-06-30',
              },
              {
                id: 'A2',
                action: 'Train backup PIOs. Run a drill.',
                element: 'training',
                status: 'done',
              },
            ],
          },
        ],
      },
    ],
  })
}

const writeAar = (aar: unknown) =>
  writeFileSync(
    join(projectRoot, 'scenarios', scenarioId, 'aar.json'),
    JSON.stringify(aar, null, 2),
  )

beforeEach(async () => {
  parent = mkdtempSync(join(tmpdir(), 'ttx-prog-'))
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  programRoot = await store.createProgram({ parentDir: parent, name: 'Program', startYear: 2026 })
  projectRoot = (await createProject({ parentDir: parent, name: 'Airport' })).path
  scenarioId = (
    await createScenario(projectRoot, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  ).id
  await links.linkProject(programRoot, projectRoot)
})

describe('project snapshots', () => {
  const scenarioDir = () => join(projectRoot, 'scenarios', scenarioId)

  it('takes exercisedAt from the latest ended live session before the delivered rows', async () => {
    writeFileSync(
      join(scenarioDir(), 'facilitator.json'),
      JSON.stringify({
        delivered: { 'I-01': { at: '2026-03-01T09:00:00.000Z', exerciseTime: '0:30' } },
      }),
    )
    let snap = await snapshots.snapshotProject(projectRoot)
    expect(snap.scenarios[0]!.exercisedAt).toBe('2026-03-01T09:00:00.000Z')

    mkdirSync(join(scenarioDir(), 'live', 'AAAAAAAAAAAAAAAAAAAAAA'), { recursive: true })
    writeFileSync(
      join(scenarioDir(), 'live', 'AAAAAAAAAAAAAAAAAAAAAA', 'session.json'),
      JSON.stringify({
        id: 'AAAAAAAAAAAAAAAAAAAAAA',
        scenarioId,
        name: 'Run',
        startedAt: '2026-03-12T09:00:00.000Z',
        endedAt: '2026-03-12T13:00:00.000Z',
        connection: { kind: 'lan' },
        joinUrlPublic: 'http://x',
        attribution: 'role',
        protocolVersion: 1,
      }),
    )
    snap = await snapshots.snapshotProject(projectRoot)
    expect(snap.scenarios[0]!.exercisedAt).toBe('2026-03-12T13:00:00.000Z')
  })

  it('leaves exercisedAt out for a scenario that was built but never run', async () => {
    const snap = await snapshots.snapshotProject(projectRoot)
    expect(snap.scenarios[0]).toMatchObject({ title: 'Flight', aarPresent: false })
    expect(snap.scenarios[0]!.exercisedAt).toBeUndefined()
  })

  it('counts the latest observation per criterion', () => {
    const o = (id: string, criterionId: string, at: string, rating: string) =>
      ({ id, criterionId, at, rating, note: '', source: 'facilitate' }) as never
    expect(
      snapshots.countRatings([
        o('1', 'c1', '2026-03-01T10:00:00.000Z', 'not_met'),
        o('2', 'c1', '2026-03-01T11:00:00.000Z', 'met'),
        o('3', 'c2', '2026-03-01T10:00:00.000Z', 'partial'),
      ]),
    ).toEqual({ met: 1, partial: 1, notMet: 0, notObserved: 0 })
  })

  it('keeps the old snapshot and marks it unreachable when the project folder is gone', async () => {
    await snapshots.refreshSnapshots(programRoot)
    expect((await snapshots.readSnapshots(programRoot))[0]!.reachable).toBe(true)
    const program = await store.loadProgram(programRoot)
    await store.updateProgram(programRoot, (p) => {
      p.projects = [{ ...program.projects[0]!, path: join(parent, 'gone.asproj') }]
    })
    // The registry also knows the real folder by id, so empty the recent list first.
    const { updateSettings } = await import('../settings/store')
    await updateSettings((s) => {
      s.recentProjects = []
    })
    await snapshots.refreshSnapshots(programRoot)
    const after = (await snapshots.readSnapshots(programRoot))[0]!
    expect(after).toMatchObject({ reachable: false, name: 'Airport' })
  })

  it('shows a planned exercise as completed once its scenario was run', async () => {
    const run = schedule.completedFromSnapshots(
      Schedule.parse({
        exercises: [
          {
            id: 'e1',
            title: 'Spring TTX',
            type: 'tabletop',
            when: { year: 2026, quarter: 1 },
            projectId: (await snapshots.snapshotProject(projectRoot)).projectId,
            scenarioId,
          },
        ],
      }),
      [
        {
          ...(await snapshots.snapshotProject(projectRoot)),
          scenarios: [
            {
              ...(await snapshots.snapshotProject(projectRoot)).scenarios[0]!,
              exercisedAt: '2026-03-12T13:00:00.000Z',
            },
          ],
        },
      ],
    )
    expect(run.exercises[0]).toMatchObject({ status: 'completed', completedAt: '2026-03-12' })
  })
})

describe('AAR/IP import', () => {
  it('previews every corrective action with its capability, citations and mapped fields', async () => {
    writeAar(aarWith('Add a PIO approval chain to EOP 6.4. Brief all PIOs.'))
    const preview = await importer.previewAarImport(programRoot, projectRoot, scenarioId)
    expect(preview.map((p) => [p.aarItemId, p.state])).toEqual([
      ['F1/A1', 'new'],
      ['F1/A2', 'new'],
    ])
    expect(preview[0]!.proposed).toMatchObject({
      title: 'Add a PIO approval chain to EOP 6.4.',
      coreCapabilities: ['public_information_and_warning'],
      element: 'planning',
      owner: { name: 'J. Ruiz', organization: 'Airport PIO' },
      dueDate: '2026-06-30',
      source: { kind: 'aar_ip', aarItemId: 'F1/A1', exerciseDate: '2026-03-12' },
    })
    expect(preview[0]!.proposed.planSections?.[0]?.headingPath).toContain('6.4')
    expect(preview[1]!.proposed.status).toBe('completed')
  })

  it('imports the ticked items and links them back from the AAR', async () => {
    writeAar(aarWith('Add a PIO approval chain.'))
    const record = await importer.applyAarImport(programRoot, projectRoot, scenarioId, [
      {
        aarItemId: 'F1/A1',
        include: true,
        overrides: { owner: { name: 'M. Chen', organization: 'PIO', email: '' } },
      },
      { aarItemId: 'F1/A2', include: false, overrides: {} },
    ])
    expect(record.items.map((i) => i.action)).toEqual(['created'])
    const { actions: list } = await actions.listActions(programRoot)
    expect(list).toHaveLength(1)
    expect(list[0]!.action.owner.name).toBe('M. Chen')
    expect(list[0]!.action.source.importId).toBe(record.id)
    const aar = JSON.parse(
      readFileSync(join(projectRoot, 'scenarios', scenarioId, 'aar.json'), 'utf8'),
    )
    expect(aar.capabilities[0].areasForImprovement[0].correctiveActions[0].programActionId).toBe(
      list[0]!.action.id,
    )
  })

  it('never imports the same item twice, and offers a changed item as an update', async () => {
    writeAar(aarWith('Add a PIO approval chain.'))
    const all = [
      { aarItemId: 'F1/A1', include: true, overrides: {} },
      { aarItemId: 'F1/A2', include: true, overrides: {} },
    ]
    await importer.applyAarImport(programRoot, projectRoot, scenarioId, all)
    const again = await importer.previewAarImport(programRoot, projectRoot, scenarioId)
    expect(again.map((p) => p.state)).toEqual(['imported', 'imported'])
    const second = await importer.applyAarImport(programRoot, projectRoot, scenarioId, all)
    expect(second.items.map((i) => i.action)).toEqual(['skipped', 'skipped'])
    expect((await actions.listActions(programRoot)).actions).toHaveLength(2)

    const stored = JSON.parse(
      readFileSync(join(projectRoot, 'scenarios', scenarioId, 'aar.json'), 'utf8'),
    )
    stored.capabilities[0].areasForImprovement[0].correctiveActions[0].action =
      'Add a two-step approval chain.'
    writeAar(stored)
    expect(
      (await importer.previewAarImport(programRoot, projectRoot, scenarioId))[0],
    ).toMatchObject({
      state: 'changed',
    })
    const third = await importer.applyAarImport(programRoot, projectRoot, scenarioId, all)
    expect(third.items[0]!.action).toBe('updated')
    const titles = (await actions.listActions(programRoot)).actions.map((v) => v.action.title)
    expect(titles).toContain('Add a two-step approval chain.')
    expect(titles).toHaveLength(2)
  })

  it('refuses a scenario without a report', async () => {
    await expect(
      importer.previewAarImport(programRoot, projectRoot, scenarioId),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('exports', () => {
  it('quotes CSV cells and neutralizes spreadsheet formulas', () => {
    expect(exporter.csvCell('plain')).toBe('plain')
    expect(exporter.csvCell('a, "b"')).toBe('"a, ""b"""')
    expect(exporter.csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(exporter.csvCell('-5 degrees')).toBe("'-5 degrees")
  })

  it('writes the HSEEP improvement plan columns to DOCX, CSV, PDF and a hand-off ZIP', async () => {
    writeAar(aarWith('Add a PIO approval chain.'))
    await importer.applyAarImport(programRoot, projectRoot, scenarioId, [
      { aarItemId: 'F1/A1', include: true, overrides: {} },
    ])
    const out = join(parent, 'out')
    const files = await exporter.exportProgram(programRoot, out, [
      'ip_docx',
      'ip_csv',
      'ip_pdf',
      'ipp_csv',
      'zip',
    ])
    expect(readdirSync(out).sort()).toEqual(files.map((f) => f.split('/').pop()!).sort())

    const csv = readFileSync(
      files.find((f) => f.endsWith('improvement-plan.csv'))!,
      'utf8',
    )
    expect(csv.split('\r\n')[0]).toBe(exporter.IP_COLUMNS.join(','))
    expect(csv).toContain('Public Information and Warning')
    expect(csv).toContain('Airport PIO')

    const docx = files.find((f) => f.endsWith('improvement-plan.docx'))!
    const { value } = await mammoth.extractRawText({ path: docx })
    for (const col of [
      'Core Capability',
      'Corrective Action',
      'Primary Responsible Organization',
      'Completion Date',
    ])
      expect(value).toContain(col)
    expect(value).toContain('Add a PIO approval chain.')

    const zip = await JSZip.loadAsync(readFileSync(files.find((f) => f.endsWith('.zip'))!))
    expect(
      Object.keys(zip.files).filter(
        (n) => n.startsWith('corrective-actions/') && n.endsWith('.json'),
      ),
    ).toHaveLength(1)
    expect(zip.file('program.json')).not.toBeNull()
  })

  it('escapes HTML in the PDF source', () => {
    const html = exporter.tableHtml('IP', 'x', ['A'], [['<script>alert(1)</script>']])
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
