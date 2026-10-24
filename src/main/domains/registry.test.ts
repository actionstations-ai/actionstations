// Pack domains end to end (ADR-0018, #263): the installer's setPackDomainProfiles fills the
// registry and tells the renderer; a project that picks a pack domain gets a snapshot through
// project:create / project:update, and lints and extracts facts with that profile before and
// after the pack is gone.
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { Scenario } from '@shared/schemas'
import { freightRailEntry } from '@shared/domains/pack-fixtures'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch, mergeHandlers } = await import('../ipc/registry')
const projectHandlers = (await import('../ipc/handlers/project')).default
const domainHandlers = (await import('../ipc/handlers/domains')).default
const { onEmit } = await import('../lib/events')
const { resetSettingsCache } = await import('../settings/store')
const { loadProject } = await import('../project/store')
const { setPackDomainProfiles } = await import('./registry')
const { categoriesForProject, domainContext } = await import('../generate/domain')
const { extractFacilityFacts, factIds, unknownFacilityIds } = await import('../generate/facility')
const { lintScenario } = await import('../generate/lint')

const handlers = mergeHandlers({ project: projectHandlers, domains: domainHandlers })

async function invoke<C extends Channel>(
  channel: C,
  ...req: ChannelRequest<C> extends void ? [] : [ChannelRequest<C>]
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req[0])
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

const DOCS = ['Rail Yards A1, B2 and C3 are staffed around the clock.']

const SCENARIO = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

/** Scenario 3 with no clue in phase 2 and no threat family of its own. */
function scenarioWithoutPhase2Clues(): Scenario {
  const s = structuredClone(SCENARIO)
  const phase2 = s.phases[1]!.id
  s.msel = s.msel.filter((r) => r.phaseId !== phase2 || r.purposeTag === 'TIME_JUMP')
  delete s.brief.threatFamily
  return s
}

describe('pack domain profiles', () => {
  let parent: string
  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'ttx-pd-'))
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-pd-ud-'))
    resetSettingsCache()
  })
  afterEach(() => setPackDomainProfiles([]))

  it('setPackDomainProfiles fills domains:list and emits domains:changed', async () => {
    const events: unknown[] = []
    const off = onEmit((name, payload) => {
      if (name === 'domains:changed') events.push(payload)
    })
    setPackDomainProfiles([freightRailEntry()])
    off()
    expect(events).toEqual([{ packProfiles: 1 }])
    const list = await invoke('domains:list')
    expect(list.filter((l) => l.source.kind === 'bundled')).toHaveLength(13)
    expect(list.at(-1)).toMatchObject({
      profile: { id: 'freight_rail' },
      source: { kind: 'pack', packId: 'org.example.freight-rail', packVersion: '1.0.0' },
    })
  })

  it('refuses a pack profile that shadows a built-in and keeps the previous set', () => {
    setPackDomainProfiles([freightRailEntry()])
    expect(() => setPackDomainProfiles([freightRailEntry('1.0.0', { id: 'airport' })])).toThrow(
      /built-in airport/,
    )
    expect(() => setPackDomainProfiles([freightRailEntry('1.0.0', { aliases: ['bus'] })])).toThrow(
      /built-in transit/,
    )
  })

  it('lints and extracts with the pack profile, and still does after the pack is gone', async () => {
    setPackDomainProfiles([freightRailEntry()])
    const { path, project } = await invoke('project:create', {
      parentDir: parent,
      name: 'Riverbend Rail',
      orgType: 'freight_rail',
    })
    expect(project.domainProfileSnapshot).toMatchObject({
      packId: 'org.example.freight-rail',
      version: '1.0.0',
      profile: { id: 'freight_rail' },
    })

    const check = async () => {
      const stored = await loadProject(path)
      const facts = extractFacilityFacts(DOCS, categoriesForProject(stored))
      expect(factIds(facts, 'yards')).toEqual(['A1', 'B2', 'C3'])
      expect(unknownFacilityIds('Crews hold at Yard D9', facts).map((u) => u.id)).toEqual(['D9'])
      const s = scenarioWithoutPhase2Clues()
      const domain = domainContext(stored, s)
      expect(domain.profile.id).toBe('freight_rail')
      expect(domain.threat.id).toBe('uas_drone')
      // A drone incident needs no technical clue each phase; the generic (cyber) default would.
      expect(lintScenario(s, domain).map((w) => w.code)).not.toContain('MIX_NO_IT_CLUE')
      expect(
        lintScenario(s, domainContext({ orgType: 'generic' }, s)).map((w) => w.code),
      ).toContain('MIX_NO_IT_CLUE')
    }
    await check()
    setPackDomainProfiles([]) // uninstalled or disabled
    await check()
    // Saving settings with the same orgType keeps the copy.
    await invoke('project:update', { path, patch: { orgType: 'freight_rail', name: 'Renamed' } })
    expect((await loadProject(path)).domainProfileSnapshot?.version).toBe('1.0.0')
  })

  it('updates the snapshot only on request, and drops it for a built-in domain', async () => {
    setPackDomainProfiles([freightRailEntry('1.0.0')])
    const { path } = await invoke('project:create', {
      parentDir: parent,
      name: 'Riverbend Rail',
      orgType: 'freight_rail',
    })
    setPackDomainProfiles([freightRailEntry('2.0.0', { outsideParties: ['FRA', 'STB'] })])
    await invoke('project:update', { path, patch: { orgType: 'freight_rail' } })
    expect((await loadProject(path)).domainProfileSnapshot?.version).toBe('1.0.0')

    const { project } = await invoke('project:update', {
      path,
      patch: { refreshDomainProfileSnapshot: true },
    })
    expect(project.domainProfileSnapshot?.version).toBe('2.0.0')
    expect(project.domainProfileSnapshot?.profile.outsideParties).toEqual(['FRA', 'STB'])

    setPackDomainProfiles([])
    await expect(
      invoke('project:update', { path, patch: { refreshDomainProfileSnapshot: true } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await loadProject(path)).domainProfileSnapshot?.version).toBe('2.0.0')

    await invoke('project:update', { path, patch: { orgType: 'transit' } })
    expect((await loadProject(path)).domainProfileSnapshot).toBeUndefined()
  })

  it('writes no snapshot for a built-in domain', async () => {
    setPackDomainProfiles([freightRailEntry()])
    const { project } = await invoke('project:create', {
      parentDir: parent,
      name: 'Riverbend Transit',
      orgType: 'transit',
    })
    expect(project.domainProfileSnapshot).toBeUndefined()
  })
})
