// The facts editor's channels (#155) through the IPC dispatcher: read view, save (validation,
// format, revision check, history), reset, and scenarios:lint honouring the saved file.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import { projectChannels, type FacilityFactsFile } from '@shared/ipc/project'
import type { DocumentMeta, MselRow, Scenario } from '@shared/schemas'
import { resolveProfile } from '@shared/domains'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../ipc/registry')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: scenarioHandlers } = await import('../ipc/handlers/scenario')
const { resetSettingsCache } = await import('../settings/store')
const { saveMeta, writeText } = await import('../ingest/storage')
const { FACILITY_FILE, isUnedited } = await import('./facility-file')
const { cleanEntries, HISTORY_LIMIT, readHistory } = await import('./facility-edit')
const { splitSections } = await import('./facility-sources')
const { onEmit } = await import('../lib/events')

const handlers = { ...projectHandlers, ...scenarioHandlers }
const AEP = readFileSync(resolve('reference/ncia/airport-emergency-plan-AEP.md'), 'utf8')
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

async function projectWithAep(): Promise<string> {
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-facts-edit-'))
  const { path: root } = await invoke('project:create', {
    parentDir,
    name: 'NCIA',
    orgType: 'airport',
  })
  const meta: DocumentMeta = {
    id: '01HFACTSEDIT00000000000000',
    title: 'Airport Emergency Plan',
    filename: 'aep.md',
    mimeType: 'text/markdown',
    kind: 'plan',
    pages: 1,
    status: 'ok',
    tags: [],
    headingsPreview: [],
    chunkCount: 0,
  }
  await saveMeta(root, meta)
  await writeText(root, meta, AEP)
  return root
}

const row = (id: string, event: string): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:10',
  from: 'Ramp Supervisor',
  toRoleIds: ['ops'],
  event,
  expectedAction: '',
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  locked: false,
})

async function scenarioWithRows(path: string, rows: MselRow[]): Promise<string> {
  const empty = await invoke('scenarios:create-empty', { projectPath: path, title: 'Facts' })
  await invoke('scenarios:save', {
    projectPath: path,
    scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId, msel: rows },
  })
  return empty.id
}

const facilityWarnings = async (path: string, scenarioId: string) =>
  (await invoke('scenarios:lint', { projectPath: path, scenarioId })).filter(
    (w) => w.code === 'FACILITY_UNKNOWN_ID',
  )

/** The view's categories as the editor would send them back, with one category changed. */
function edited(view: FacilityFactsFile, id: string, change: (entries: string[]) => string[]) {
  return view.categories.map((c) => ({
    id: c.id,
    label: c.label,
    entries: c.id === id ? change(c.entries) : c.entries,
  }))
}

let path: string
beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  path = await projectWithAep()
})

describe('project:facility-facts (read view)', () => {
  it('lists every category with the extraction, sources and lint flag beside the file', async () => {
    const view = await invoke('project:facility-facts', { path })
    const runways = view.categories.find((c) => c.id === 'runways')!
    expect(runways).toMatchObject({ entries: ['5/23', '1/19'], extracted: ['5/23', '1/19'] })
    expect(runways.linted).toBe(true)
    expect(runways.sources['5/23']).toEqual({
      documentId: '01HFACTSEDIT00000000000000',
      documentTitle: 'Airport Emergency Plan',
      section: '2.2 Scope',
    })
    expect(view.categories.find((c) => c.id === 'hosts')?.linted).toBe(false)
    expect(view).toMatchObject({ edited: false, historyCount: 0, path: FACILITY_FILE })
    expect(view.revision).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('project:facility-facts-save', () => {
  it('writes the file in its format, marks it edited, keeps history and notifies', async () => {
    const view = await invoke('project:facility-facts', { path })
    const events: unknown[] = []
    const off = onEmit((name, payload) => name === 'project:changed' && events.push(payload))
    const saved = await invoke('project:facility-facts-save', {
      path,
      revision: view.revision,
      categories: edited(view, 'runways', (e) => [...e, '9/27']),
    })
    off()
    const md = readFileSync(join(path, FACILITY_FILE), 'utf8')
    expect(md).toMatch(/^# Facility facts\n\n<!-- ttx:facility-facts v1 auto-hash=/)
    expect(md).toContain('## Runways\n<!-- category: runways -->\n\n- 5/23\n- 1/19\n- 9/27\n')
    expect(isUnedited(md)).toBe(false)
    expect(saved).toMatchObject({ edited: true, historyCount: 1 })
    expect(saved.categories.find((c) => c.id === 'runways')?.entries).toContain('9/27')
    expect(events).toContainEqual({ path, what: 'project' })
  })

  it('reads as unedited again when the saved facts equal the extraction', async () => {
    const view = await invoke('project:facility-facts', { path })
    const added = await invoke('project:facility-facts-save', {
      path,
      categories: edited(view, 'gates', (e) => [...e, 'Z1']),
    })
    const back = await invoke('project:facility-facts-save', {
      path,
      categories: edited(added, 'gates', (e) => e.filter((x) => x !== 'Z1')),
    })
    expect(back.edited).toBe(false)
  })

  it('trims, drops blanks, de-duplicates and strips Markdown from entries and labels', async () => {
    expect(cleanEntries(['  A1 ', '', 'a1', '- `B2`', 'C\n3', '   '])).toEqual(['A1', 'B2', 'C 3'])
    const saved = await invoke('project:facility-facts-save', {
      path,
      categories: [
        { id: 'pumps', label: '## Pump stations ', entries: ['PS-4', ' PS-4', ''] },
        { id: 'pumps', label: 'Pump stations', entries: ['PS-7'] },
      ],
    })
    expect(saved.categories[0]).toMatchObject({
      id: 'pumps',
      label: 'Pump stations',
      entries: ['PS-4', 'PS-7'],
    })
    expect(readFileSync(join(path, FACILITY_FILE), 'utf8')).toContain('## Pump stations\n')
  })

  it('refuses bad ids, empty names, over-long entries and too many entries', async () => {
    const bad = [
      [{ id: '../x', label: 'X', entries: [] }],
      [{ id: 'x', label: '   ', entries: [] }],
      [{ id: 'x', label: '##', entries: [] }],
      [{ id: 'x', label: 'X', entries: ['y'.repeat(201)] }],
      [{ id: 'x', label: 'X', entries: Array.from({ length: 2001 }, (_, i) => `E${i}`) }],
    ]
    for (const categories of bad) {
      const r = await dispatch(handlers, 'project:facility-facts-save', { path, categories })
      expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    }
    expect(
      projectChannels['project:facility-facts-save'].req.safeParse({
        path,
        categories: Array.from({ length: 101 }, (_, i) => ({
          id: `c${i}`,
          label: 'C',
          entries: [],
        })),
      }).success,
    ).toBe(false)
  })

  it('refuses to overwrite a file changed on disk since it was read (CONFLICT)', async () => {
    const view = await invoke('project:facility-facts', { path })
    writeFileSync(join(path, FACILITY_FILE), `${view.markdown}\n## Extra\n- E1\n`)
    const r = await dispatch(handlers, 'project:facility-facts-save', {
      path,
      revision: view.revision,
      categories: edited(view, 'runways', (e) => e),
    })
    expect(r).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(readFileSync(join(path, FACILITY_FILE), 'utf8')).toContain('## Extra')
  })

  it(`keeps the last ${HISTORY_LIMIT} versions under .cache/`, async () => {
    let view = await invoke('project:facility-facts', { path })
    for (let i = 0; i < HISTORY_LIMIT + 3; i++)
      view = await invoke('project:facility-facts-save', {
        path,
        categories: edited(view, 'gates', (e) => [...e, `Z${i}`]),
      })
    const dir = join(path, '.cache', 'facility-facts-history')
    expect(readdirSync(dir)).toHaveLength(HISTORY_LIMIT)
    expect(view.historyCount).toBe(HISTORY_LIMIT)
    const [newest] = await readHistory(path)
    expect(newest).toContain(`- Z${HISTORY_LIMIT + 1}`)
    expect(newest).not.toContain(`- Z${HISTORY_LIMIT + 2}`)
  })
})

describe('project:facility-facts-reset', () => {
  it('goes back to the extraction and keeps the edited version in the history', async () => {
    const view = await invoke('project:facility-facts', { path })
    await invoke('project:facility-facts-save', {
      path,
      categories: edited(view, 'runways', () => ['9/27']),
    })
    const reset = await invoke('project:facility-facts-reset', { path })
    expect(reset.edited).toBe(false)
    expect(reset.categories.find((c) => c.id === 'runways')?.entries).toEqual(['5/23', '1/19'])
    const [newest] = await readHistory(path)
    expect(newest).toContain('- 9/27')
    expect(existsSync(join(path, FACILITY_FILE))).toBe(true)
  })
})

describe('scenarios:lint honours facility-facts.md', () => {
  it('stops flagging an added runway and flags a gate taken out of a range', async () => {
    const scenarioId = await scenarioWithRows(path, [
      row('I-01', 'Lights on Runway 9 are cycling.'),
      row('I-02', 'A jet bridge fault at Gate 7 strands passengers.'),
    ])
    expect((await facilityWarnings(path, scenarioId)).map((w) => w.rowId)).toEqual(['I-01'])

    const view = await invoke('project:facility-facts', { path })
    const withRunway = await invoke('project:facility-facts-save', {
      path,
      revision: view.revision,
      categories: edited(view, 'runways', (e) => [...e, '9/27']),
    })
    expect(await facilityWarnings(path, scenarioId)).toEqual([])

    await invoke('project:facility-facts-save', {
      path,
      revision: withRunway.revision,
      categories: edited(withRunway, 'gates', () => ['1–6', '8–20']),
    })
    expect((await facilityWarnings(path, scenarioId)).map((w) => w.rowId)).toEqual(['I-02'])

    await invoke('project:facility-facts-reset', { path })
    expect((await facilityWarnings(path, scenarioId)).map((w) => w.rowId)).toEqual(['I-01'])
  })
})

describe('project:update with fact category overrides (#180)', () => {
  const withGateNoun = (noun: string) =>
    resolveProfile('airport').factCategories.map((c) => (c.id === 'gates' ? { ...c, noun } : c))

  it('re-extracts an unedited file and re-lints with the tightened noun', async () => {
    const scenarioId = await scenarioWithRows(path, [
      row('I-01', 'A jet bridge fault at Gate 99 strands passengers.'),
    ])
    expect(await facilityWarnings(path, scenarioId)).toHaveLength(1)
    const before = await invoke('project:facility-facts', { path })
    expect(before.categories.find((c) => c.id === 'gates')?.entries.length).toBeGreaterThan(0)

    await invoke('project:update', {
      path,
      patch: { domainProfileOverrides: { factCategories: withGateNoun('Jet Gates?') } },
    })
    const after = await invoke('project:facility-facts', { path })
    expect(after.edited).toBe(false)
    expect(after.revision).not.toBe(before.revision)
    expect(after.categories.find((c) => c.id === 'gates')?.entries).toEqual([])
    expect(await facilityWarnings(path, scenarioId)).toEqual([])
  })

  it('keeps an edited file and writes the new extraction beside it', async () => {
    const view = await invoke('project:facility-facts', { path })
    await invoke('project:facility-facts-save', {
      path,
      categories: edited(view, 'runways', (e) => [...e, '9/27']),
    })
    const kept = readFileSync(join(path, FACILITY_FILE), 'utf8')
    await invoke('project:update', {
      path,
      patch: { domainProfileOverrides: { factCategories: withGateNoun('Jet Gates?') } },
    })
    expect(readFileSync(join(path, FACILITY_FILE), 'utf8')).toBe(kept)
    const after = await invoke('project:facility-facts', { path })
    expect(after.generatedMarkdown).toBeDefined()
    expect(after.categories.find((c) => c.id === 'gates')?.extracted).toEqual([])
  })

  it('refuses a noun that is not a safe pattern and leaves project.json alone', async () => {
    for (const noun of ['Gates(', '(?:G+)+', 'Gate(s)?'])
      await expect(
        invoke('project:update', {
          path,
          patch: { domainProfileOverrides: { factCategories: withGateNoun(noun) } },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(/^Gates: /) })
    const { project } = await invoke('project:get', { path })
    expect(project.domainProfileOverrides).toBeUndefined()
  })
})

describe('a lint definition for a category the user added (#350)', () => {
  const PUMPS = { id: 'pump-stations', label: 'Pump stations' }
  const definition = { ...PUMPS, noun: 'Pump Stations?', idShape: 'number' as const }
  const withPumps = async () => {
    const view = await invoke('project:facility-facts', { path })
    await invoke('project:facility-facts-save', {
      path,
      categories: [...edited(view, 'gates', (e) => e), { ...PUMPS, entries: ['1', '2'] }],
    })
  }

  it('offers a definition only where neither the domain nor the built-ins define one', async () => {
    await withPumps()
    const view = await invoke('project:facility-facts', { path })
    const byId = (id: string) => view.categories.find((c) => c.id === id)
    expect(byId('pump-stations')).toMatchObject({ linted: false, definable: true })
    expect(byId('gates')).toMatchObject({ linted: true, definable: false })
    expect(byId('hosts')?.definable).toBe(false)
  })

  it('keeps the file and its hyphenated id, and lints the category once it is defined', async () => {
    await withPumps()
    const scenarioId = await scenarioWithRows(path, [
      row('I-01', 'Pump Station 7 trips offline during the storm.'),
      row('I-02', 'Crews reset Pump Station 2 by hand.'),
    ])
    expect(await facilityWarnings(path, scenarioId)).toEqual([])
    const file = readFileSync(join(path, FACILITY_FILE), 'utf8')
    expect(file).toContain('## Pump stations\n<!-- category: pump-stations -->')

    const airport = resolveProfile('airport').factCategories
    await invoke('project:update', {
      path,
      patch: { domainProfileOverrides: { factCategories: [...airport, definition] } },
    })
    expect(readFileSync(join(path, FACILITY_FILE), 'utf8')).toBe(file)
    const stored = JSON.parse(readFileSync(join(path, 'project.json'), 'utf8')) as {
      domainProfileOverrides: { factCategories: { id: string }[] }
    }
    expect(stored.domainProfileOverrides.factCategories.at(-1)?.id).toBe('pump-stations')
    const view = await invoke('project:facility-facts', { path })
    expect(view.categories.find((c) => c.id === 'pump-stations')).toMatchObject({
      entries: ['1', '2'],
      linted: true,
      definable: false,
    })
    const warnings = await facilityWarnings(path, scenarioId)
    expect(warnings.map((w) => w.rowId)).toEqual(['I-01'])

    await invoke('project:update', { path, patch: { domainProfileOverrides: null } })
    expect(await facilityWarnings(path, scenarioId)).toEqual([])
  })
})

describe('splitSections', () => {
  it('splits Markdown at headings and keeps text before the first one', () => {
    expect(splitSections('intro\n# **A**\none\n## B ##\ntwo\n### C\n')).toEqual([
      { heading: '', text: 'intro\n' },
      { heading: 'A', text: 'one\n' },
      { heading: 'B', text: 'two\n' },
    ])
  })
})
