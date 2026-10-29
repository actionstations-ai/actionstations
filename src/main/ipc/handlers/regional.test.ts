// Integration (#440): a host and a participant on two project folders exchange a frame, a slice
// and a merged exercise through the IPC dispatcher. Plans, quotes and facility text stay home.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('../../secrets', () => ({
  getSecret: async (id: string) => store.get(id),
  setSecret: async (id: string, v: string | null) =>
    void (v === null ? store.delete(id) : store.set(id, v)),
}))
vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.5.1', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./regional')).default
const { createProject } = await import('../../project/store')
const { createScenario, saveScenario, getScenario, listInjects, saveInject } =
  await import('../../scenario/store')
const { resetSettingsCache } = await import('../../settings/store')
const { ScenarioBrief } = await import('@shared/schemas')

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
const call = async <T>(channel: string, req: Record<string, unknown> = {}): Promise<Result<T>> =>
  (await dispatch(handlers, channel as never, req)) as Result<T>
const ok = async <T>(channel: string, req: Record<string, unknown> = {}): Promise<T> => {
  const r = await call<T>(channel, req)
  if (!r.ok) throw new Error(`${channel}: ${r.error.code} ${r.error.message}`)
  return r.data
}

const SECRET_QUOTE = 'SECRET QUOTE from the airport security plan'
const row = (id: string, time: string, extra: Record<string, unknown> = {}) => ({
  id,
  phaseId: 'p1',
  time,
  from: 'SimCell',
  toRoleIds: [],
  event: `Event ${id}`,
  expectedAction: `Action ${id}`,
  purposeTag: 'DECISION_POINT',
  citations: [
    {
      documentId: 'local-doc-id',
      documentTitle: 'ASP',
      headingPath: 'ASP › 6.4',
      page: 9,
      quote: SECRET_QUOTE,
    },
  ],
  ...extra,
})

async function newScenario(name: string, msel: unknown[]) {
  const { path: root } = await createProject({
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-reg-')),
    name,
    orgType: 'airport',
  })
  const created = await createScenario(root, {
    title: `${name} scenario`,
    brief: ScenarioBrief.parse({ userPrompt: 'FACILITY FACTS: gate code 4471' }),
  })
  const phases = [
    { id: 'p1', index: 0, title: 'Onset', goal: 'g', startTime: '0:00', endTime: '2:00' },
  ]
  const saved = await saveScenario(
    root,
    { ...created, phases, msel: msel as never },
    { by: 'user', snapshot: false },
  )
  return { root, scenario: saved }
}

describe('regional exercise round trip', () => {
  it('shares a frame, takes a slice from a partner, merges and sends the merged exercise back', async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    store.clear()
    const city = await ok<{ orgId: string; fingerprint: string }>('regional:identity-create', {
      name: 'Cleveland Office of Emergency Management',
      prefix: 'CITY',
    })
    const air = await ok<{ orgId: string; fingerprint: string }>('regional:identity-create', {
      name: 'Harborview Airport Authority',
      prefix: 'AIR',
    })
    expect(store.size).toBe(2)

    const host = await newScenario('Host', [row('START', '0:00'), row('I-01', '0:10')])
    await ok('regional:create', {
      projectPath: host.root,
      scenarioId: host.scenario.id,
      hostOrg: 'city',
      orgs: [{ name: 'Harborview Airport Authority', prefix: 'AIR' }],
    })
    const out = mkdtempSync(join(tmpdir(), 'ttx-bundles-'))
    const framePath = join(out, 'frame.asexercise')
    await ok('regional:export', {
      projectPath: host.root,
      scenarioId: host.scenario.id,
      kind: 'frame',
      path: framePath,
    })

    // The frame never carries the host's plan quote, facility text or local document id.
    const frameZip = await JSZip.loadAsync(readFileSync(framePath))
    const frameText = await frameZip.file('frame.json')!.async('string')
    expect(frameText).not.toContain(SECRET_QUOTE)
    expect(frameText).not.toContain('4471')

    // Join: wrong fingerprint is refused, the right one works.
    const guest = await newScenario('Guest', [])
    const bad = await call('regional:join', {
      path: framePath,
      projectPath: guest.root,
      orgId: 'air',
      confirmFingerprint: air.fingerprint,
    })
    expect(bad.ok).toBe(false)
    const joined = await ok<{ scenarioId: string }>('regional:join', {
      path: framePath,
      projectPath: guest.root,
      orgId: 'air',
      confirmFingerprint: city.fingerprint,
    })

    // The participant writes two rows (one private) and exports its slice.
    const mine = await getScenario(guest.root, joined.scenarioId)
    await saveScenario(
      guest.root,
      {
        ...mine,
        msel: [
          ...mine.msel,
          row('I-05', '0:30', { toRoleIds: ['city-ops'] }),
          row('I-06', '0:40', {
            visibility: 'owner_controllers',
            publicSummary: 'AIR internal escalation inject',
          }),
        ] as never,
      },
      { by: 'user', snapshot: false },
    )
    await saveInject(
      guest.root,
      joined.scenarioId,
      {
        id: 'inj-a',
        mselRowId: 'I-05',
        type: 'email',
        title: 'Notice',
        deliveryMode: 'hand_to_role',
        fields: { body: 'Hello' },
        citations: [],
        assets: [],
        versions: [],
        includeInDeck: true,
        locked: false,
      } as never,
      { by: 'user', snapshot: false },
    )
    const review = await ok<{ privateRows: { id: string }[]; citingItems: unknown[] }>(
      'regional:export-review',
      { projectPath: guest.root, scenarioId: joined.scenarioId, kind: 'slice' },
    )
    expect(review.privateRows.map((p) => p.id)).toEqual(['AIR-I-06'])
    expect(review.citingItems.length).toBeGreaterThan(0)
    const slicePath = join(out, 'air.asexercise')
    await ok('regional:export', {
      projectPath: guest.root,
      scenarioId: joined.scenarioId,
      kind: 'slice',
      path: slicePath,
    })
    const sliceText = await (
      await JSZip.loadAsync(readFileSync(slicePath))
    )
      .file('slices/AIR.json')!
      .async('string')
    expect(sliceText).not.toContain(SECRET_QUOTE)
    expect(sliceText).not.toContain('4471')
    expect(sliceText).not.toContain('Event AIR-I-06')

    // Host: unpinned signer is not merged; pin with the right fingerprint; then merge.
    const first = await ok<{ bundles: { pin: string }[]; orgs: unknown[] }>(
      'regional:merge-preview',
      { projectPath: host.root, scenarioId: host.scenario.id, paths: [slicePath] },
    )
    expect(first.bundles[0]?.pin).toBe('new')
    expect(first.orgs).toEqual([])
    const wrong = await call('regional:pin', {
      projectPath: host.root,
      scenarioId: host.scenario.id,
      path: slicePath,
      confirmFingerprint: city.fingerprint,
    })
    expect(wrong.ok).toBe(false)
    await ok('regional:pin', {
      projectPath: host.root,
      scenarioId: host.scenario.id,
      path: slicePath,
      confirmFingerprint: air.fingerprint,
    })
    const preview = await ok<{
      orgs: { added: string[]; placeholders: string[]; revision: number }[]
    }>('regional:merge-preview', {
      projectPath: host.root,
      scenarioId: host.scenario.id,
      paths: [slicePath],
    })
    expect(preview.orgs[0]?.added).toEqual(['AIR-I-05', 'AIR-I-06'])
    expect(preview.orgs[0]?.placeholders).toEqual(['AIR-I-06'])
    await ok('regional:merge-apply', {
      projectPath: host.root,
      scenarioId: host.scenario.id,
      paths: [slicePath],
      accept: [{ orgId: 'air', revision: preview.orgs[0]!.revision }],
    })
    const merged = await getScenario(host.root, host.scenario.id)
    expect(merged.msel.find((r) => r.id === 'AIR-I-05')?.owner).toBe('air')
    const placeholder = merged.msel.find((r) => r.id === 'AIR-I-06')!
    expect(placeholder.event).toBe('AIR internal escalation inject')
    expect(placeholder.expectedAction).toBe('')
    expect(await listInjects(host.root, host.scenario.id)).toHaveLength(1)

    // The host cannot edit the partner's row through a plain save, only propose.
    const { assertOwnRowsOnly } = await import('../../regional/guard')
    const edited = merged.msel.map((r) => (r.id === 'AIR-I-05' ? { ...r, event: 'changed' } : r))
    await expect(
      assertOwnRowsOnly(host.root, { id: host.scenario.id, msel: edited }, merged),
    ).rejects.toThrow(/belongs to AIR/)

    // Merged exercise goes back and the participant sees the host's rows, read-only.
    const mergedPath = join(out, 'merged.asexercise')
    await ok('regional:export', {
      projectPath: host.root,
      scenarioId: host.scenario.id,
      kind: 'merged',
      path: mergedPath,
    })
    await ok('regional:pin', {
      projectPath: guest.root,
      scenarioId: joined.scenarioId,
      path: mergedPath,
      confirmFingerprint: city.fingerprint,
    })
    const imported = await ok<{ changes: string[] }>('regional:import-merged', {
      projectPath: guest.root,
      scenarioId: joined.scenarioId,
      path: mergedPath,
    })
    expect(imported.changes).toEqual(['city: 1 rows before, 1 now (revision 1)'])
    const afterJoin = await getScenario(guest.root, joined.scenarioId)
    expect(afterJoin.msel.filter((r) => r.owner === 'air').map((r) => r.id)).toEqual([
      'AIR-I-05',
      'AIR-I-06',
    ])
    expect(afterJoin.msel.find((r) => r.id === 'CITY-I-01')?.owner).toBe('city')
  })

  it('refuses a tampered slice, an unsigned bundle and a bundle from another exercise', async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    store.clear()
    await ok('regional:identity-create', { name: 'Host Org', prefix: 'HOST' })
    await ok('regional:identity-create', { name: 'Guest Org', prefix: 'GST' })
    const host = await newScenario('Host2', [row('I-01', '0:10')])
    await ok('regional:create', {
      projectPath: host.root,
      scenarioId: host.scenario.id,
      hostOrg: 'host',
      orgs: [{ name: 'Guest Org', prefix: 'GST' }],
    })
    const dir = mkdtempSync(join(tmpdir(), 'ttx-bundles-'))
    const framePath = join(dir, 'f.asexercise')
    await ok('regional:export', {
      projectPath: host.root,
      scenarioId: host.scenario.id,
      kind: 'frame',
      path: framePath,
    })
    const zip = await JSZip.loadAsync(readFileSync(framePath))
    const text = await zip.file('frame.json')!.async('string')
    zip.file('frame.json', text.replace('Host2 scenario', 'Evil scenario'))
    const tampered = join(dir, 't.asexercise')
    writeFileSync(tampered, await zip.generateAsync({ type: 'nodebuffer' }))
    const r = await call('regional:inspect', { path: tampered })
    expect(r.ok).toBe(false)
    zip.remove('signature.json')
    const unsigned = join(dir, 'u.asexercise')
    writeFileSync(unsigned, await zip.generateAsync({ type: 'nodebuffer' }))
    expect((await call('regional:inspect', { path: unsigned })).ok).toBe(false)
    const other = await newScenario('Other', [])
    await ok('regional:create', {
      projectPath: other.root,
      scenarioId: other.scenario.id,
      hostOrg: 'host',
      orgs: [{ name: 'Guest Org', prefix: 'GST' }],
    })
    const mismatch = await call('regional:inspect', {
      path: framePath,
      projectPath: other.root,
      scenarioId: other.scenario.id,
    })
    expect(mismatch.ok).toBe(false)
  })
})
