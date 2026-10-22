import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentMeta, MselRow } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject, loadProject } = await import('../project/store')
const { resetSettingsCache } = await import('../settings/store')
const { saveMeta, writeText } = await import('../ingest/storage')
const {
  FACILITY_FILE,
  FACILITY_GENERATED_FILE,
  isUnedited,
  loadFacilityFacts,
  parseFacilityFile,
  readFacilityFile,
  refreshFacilityFile,
  renderFacilityFile,
  resetFacilityFile,
} = await import('./facility-file')
const { extractFacilityFacts, facilitySheet, factEntries, lintRowFacility } =
  await import('./facility')
const { AIRPORT_CATEGORIES, LOCATIONS } = await import('./facility-categories')

const AEP = readFileSync(resolve('reference/ncia/airport-emergency-plan-AEP.md'), 'utf8')

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

async function projectWithDocument(text: string): Promise<string> {
  const { path: root } = await createProject({
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-facts-')),
    name: 'NCIA',
    orgType: 'airport',
  })
  const meta: DocumentMeta = {
    id: '01HFACTS0000000000000000AA',
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
  await writeText(root, meta, text)
  return root
}

const file = (root: string, name = FACILITY_FILE) => join(root, name)
const read = (root: string, name = FACILITY_FILE) => readFileSync(file(root, name), 'utf8')

async function lintWith(root: string, event: string) {
  const facts = await loadFacilityFacts(root, await loadProject(root))
  return lintRowFacility(row('I-01', event), facts)
}

describe('facility-facts.md format (#143)', () => {
  it('round-trips the extracted facts, one section per category, and starts unedited', () => {
    const facts = extractFacilityFacts([AEP])
    const md = renderFacilityFile(facts)
    expect(md).toMatch(/^# Facility facts/)
    expect(md).toContain('Your edits win')
    for (const c of facts.categories)
      expect(md).toContain(`## ${c.label}\n<!-- category: ${c.id} -->`)
    expect(isUnedited(md)).toBe(true)
    expect(parseFacilityFile(md, 1)).toEqual({ ...facts, documentCount: 1 })
  })

  it('counts any change to the sections as an edit, and reads headings without an id comment', () => {
    const md = renderFacilityFile(extractFacilityFacts([AEP]))
    expect(isUnedited(md.replace('- 5/23', '- 5/23\n- 9/27'))).toBe(false)
    expect(isUnedited(`${md}\n## Pump stations\n- PS-4\n`)).toBe(false)
    const parsed = parseFacilityFile(`${md}\n## Pump stations\n\n- \`PS-4\`\n* PS-7\n`)
    expect(factEntries(parsed, 'pump-stations')).toEqual(['PS-4', 'PS-7'])
    expect(facilitySheet(parsed)).toContain('Pump stations: PS-4, PS-7')
  })

  it('takes the category list from the caller (domain profiles)', () => {
    const facts = extractFacilityFacts(
      ['Gates A1–A3. Room 104.'],
      [...AIRPORT_CATEGORIES, LOCATIONS],
    )
    expect(facts.categories.map((c) => c.id)).toEqual([
      'runways',
      'taxiways',
      'gates',
      'concourses',
      'locations',
    ])
    expect(renderFacilityFile(facts)).not.toContain('## Phone numbers')
  })
})

describe('facility-facts.md in a project (#143)', () => {
  beforeEach(() => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
  })

  it('is written after ingest and rewritten while unedited', async () => {
    const root = await projectWithDocument(AEP)
    expect(await refreshFacilityFile(root)).toBe('written')
    expect(await refreshFacilityFile(root)).toBe('unchanged')
    expect(read(root)).toContain('- 5/23')
    expect(existsSync(file(root, FACILITY_GENERATED_FILE))).toBe(false)
  })

  it('generation honours an added runway: the lint stops flagging it', async () => {
    const root = await projectWithDocument(AEP)
    await refreshFacilityFile(root)
    expect(await lintWith(root, 'Lights on Runway 9 are cycling.')).toHaveLength(1)
    writeFileSync(file(root), read(root).replace('- 5/23', '- 5/23\n- 9/27'))
    expect(await lintWith(root, 'Lights on Runway 9 are cycling.')).toEqual([])
    expect(await lintWith(root, 'Lights on Runway 27 are cycling.')).toEqual([])
  })

  it('generation honours a removed gate: the lint flags it', async () => {
    const root = await projectWithDocument(AEP)
    await refreshFacilityFile(root)
    expect(await lintWith(root, 'Crowd at Gate A8.')).toEqual([])
    writeFileSync(file(root), read(root).replace('- A1–A8', '- A1–A7'))
    const [warning] = await lintWith(root, 'Crowd at Gate A8.')
    expect(warning?.message).toContain('Gate A8')
  })

  it('keeps an edited file on re-ingest and writes the extraction next to it', async () => {
    const root = await projectWithDocument(AEP)
    await refreshFacilityFile(root)
    const edited = read(root).replace('- 5/23', '- 5/23\n- 9/27')
    writeFileSync(file(root), edited)
    expect(await refreshFacilityFile(root)).toBe('kept-edited')
    expect(read(root)).toBe(edited)
    expect(isUnedited(read(root, FACILITY_GENERATED_FILE))).toBe(true)
    const state = await readFacilityFile(root)
    expect(state).toMatchObject({ path: FACILITY_FILE, edited: true })
    expect(state.generatedMarkdown).toContain('- 5/23')
  })

  it('reset goes back to the extracted version and drops the generated copy', async () => {
    const root = await projectWithDocument(AEP)
    await refreshFacilityFile(root)
    writeFileSync(file(root), read(root).replace('- A1–A8', '- A1–A7'))
    await refreshFacilityFile(root)
    const reset = await resetFacilityFile(root)
    expect(read(root)).toBe(reset)
    expect(reset).toContain('- A1–A8')
    expect(existsSync(file(root, FACILITY_GENERATED_FILE))).toBe(false)
    expect((await readFacilityFile(root)).edited).toBe(false)
  })

  it('is created on first use when a project predates it', async () => {
    const root = await projectWithDocument(AEP)
    expect(existsSync(file(root))).toBe(false)
    const facts = await loadFacilityFacts(root, await loadProject(root))
    expect(factEntries(facts, 'runways')).toEqual(['5/23', '1/19'])
    expect(existsSync(file(root))).toBe(true)
    expect((await readFacilityFile(root)).edited).toBe(false)
  })
})
