// Pack domain profiles in the registry and per-project snapshots (ADR-0018, #263).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { freightRailEntry, freightRailProfile } from './pack-fixtures'
import {
  baseProfile,
  builtinProfile,
  bundledDomainIds,
  isDomainId,
  listProfiles,
  nextDomainSnapshot,
  packSnapshotFor,
  profileFieldDiff,
  profilesRevision,
  registerPackProfiles,
  resolveProfile,
  snapshotStatus,
  subscribeProfiles,
  type DomainProfileSnapshot,
} from './index'
import { ExampleManifest } from '../ipc/examples'

afterEach(() => registerPackProfiles([]))

const snapshotOf = (version = '1.0.0'): DomainProfileSnapshot => ({
  profile: freightRailProfile(),
  packId: 'org.example.freight-rail',
  version,
  packName: 'Freight Rail',
})

describe('registerPackProfiles', () => {
  it('registers pack profiles beside the built-ins, by id and alias', () => {
    expect(isDomainId('heritage_rail')).toBe(false)
    expect(builtinProfile('heritage_rail').id).toBe('generic')
    registerPackProfiles([freightRailEntry()])
    expect(isDomainId('heritage_rail')).toBe(true)
    expect(isDomainId('Freight Rail')).toBe(true)
    expect(builtinProfile('heritage railroad').id).toBe('heritage_rail')
    const DOMAIN_IDS = bundledDomainIds()
    expect(DOMAIN_IDS).not.toContain('heritage_rail')
    const listed = listProfiles()
    expect(listed.slice(0, DOMAIN_IDS.length).map((l) => l.source.kind)).toEqual(
      DOMAIN_IDS.map(() => 'bundled'),
    )
    expect(listed.at(-1)).toMatchObject({
      profile: { id: 'heritage_rail' },
      source: {
        kind: 'pack',
        packId: 'org.example.freight-rail',
        packVersion: '1.0.0',
        packName: 'Freight Rail',
      },
    })
  })

  it('replaces the whole pack set on every call and notifies subscribers', () => {
    const listener = vi.fn()
    const off = subscribeProfiles(listener)
    const before = profilesRevision()
    registerPackProfiles([freightRailEntry()])
    registerPackProfiles([])
    expect(isDomainId('heritage_rail')).toBe(false)
    expect(listProfiles().every((l) => l.source.kind === 'bundled')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(profilesRevision()).toBe(before + 2)
    off()
  })

  it('refuses a pack profile that shadows a built-in id or alias, keeping the previous set', () => {
    registerPackProfiles([freightRailEntry()])
    expect(() => registerPackProfiles([freightRailEntry('1.0.0', { id: 'transit' })])).toThrow(
      /built-in transit/,
    )
    expect(() =>
      registerPackProfiles([freightRailEntry('1.0.0', { aliases: ['Hospital'] })]),
    ).toThrow(/"hospital" of the built-in healthcare/)
    expect(builtinProfile('transit').label).not.toBe('Freight railroad')
    expect(builtinProfile('heritage_rail').id).toBe('heritage_rail')
  })

  it('refuses two packs providing the same id or alias', () => {
    const other = { ...freightRailEntry(), packId: 'org.other.rail', packName: 'Other Rail' }
    expect(() => registerPackProfiles([freightRailEntry(), other])).toThrow(/provided by both/)
    const aliasClash = {
      ...other,
      profile: freightRailProfile({ id: 'narrow_gauge', aliases: ['heritage railroad'] }),
    }
    expect(() => registerPackProfiles([freightRailEntry(), aliasClash])).toThrow(
      /reuses "heritage_railroad"/,
    )
  })

  it('lets ExampleManifest name a registered pack domain', () => {
    const manifest = {
      id: 'rail',
      title: 'Rail',
      domainProfile: 'heritage_rail',
      summary: 'A rail example.',
      fictional: true,
      notice: 'Fictional.',
    }
    expect(ExampleManifest.safeParse(manifest).success).toBe(false)
    registerPackProfiles([freightRailEntry()])
    expect(ExampleManifest.safeParse(manifest).success).toBe(true)
  })
})

describe('resolveProfile with a snapshot', () => {
  it('uses the snapshot first, even when the registry has another version', () => {
    registerPackProfiles([freightRailEntry('2.0.0', { outsideParties: ['FRA', 'STB'] })])
    const snap = snapshotOf('1.0.0')
    expect(resolveProfile('heritage_rail', undefined, snap).outsideParties).toEqual([
      'FRA',
      'Shippers',
    ])
    expect(resolveProfile('heritage_rail').outsideParties).toEqual(['FRA', 'STB'])
  })

  it('keeps working from the snapshot when the pack is gone', () => {
    const p = resolveProfile('heritage_rail', undefined, snapshotOf())
    expect(p.id).toBe('heritage_rail')
    expect(p.factCategories.map((c) => c.id)).toEqual(['yards'])
    expect(resolveProfile('heritage railroad', undefined, snapshotOf()).id).toBe('heritage_rail')
    expect(resolveProfile('heritage_rail').id).toBe('generic')
  })

  it('applies overrides on top of the snapshot and keeps its id', () => {
    const p = resolveProfile(
      'heritage_rail',
      { outsideParties: ['County OEM'], label: 'Riverbend Rail' },
      snapshotOf(),
    )
    expect(p.id).toBe('heritage_rail')
    expect(p.aliases).toEqual(['heritage rail', 'heritage railroad'])
    expect(p.label).toBe('Riverbend Rail')
    expect(p.outsideParties).toEqual(['County OEM'])
    expect(p.factCategories.map((c) => c.id)).toEqual(['yards'])
  })

  it('ignores a snapshot that is not the profile orgType names', () => {
    expect(resolveProfile('transit', undefined, snapshotOf()).id).toBe('transit')
    expect(baseProfile('zoo', snapshotOf()).id).toBe('generic')
  })
})

describe('project snapshots', () => {
  it('snapshots a pack domain when chosen, keeps it while chosen, drops it for a built-in', () => {
    expect(packSnapshotFor('heritage_rail')).toBeUndefined()
    registerPackProfiles([freightRailEntry('1.0.0')])
    const first = nextDomainSnapshot('heritage_rail', undefined)
    expect(first).toMatchObject({
      packId: 'org.example.freight-rail',
      version: '1.0.0',
      packName: 'Freight Rail',
    })
    registerPackProfiles([freightRailEntry('2.0.0')])
    expect(nextDomainSnapshot('heritage_rail', first)).toBe(first)
    expect(nextDomainSnapshot('transit', first)).toBeUndefined()
    registerPackProfiles([])
    expect(nextDomainSnapshot('heritage_rail', first)).toBe(first)
    expect(nextDomainSnapshot('heritage_rail', undefined)).toBeUndefined()
  })

  it('reports whether the pack is installed and has another version', () => {
    expect(snapshotStatus(snapshotOf())).toEqual({ installed: false, updateAvailable: false })
    registerPackProfiles([freightRailEntry('1.0.0')])
    expect(snapshotStatus(snapshotOf())).toMatchObject({ installed: true, updateAvailable: false })
    registerPackProfiles([freightRailEntry('1.1.0')])
    expect(snapshotStatus(snapshotOf())).toMatchObject({ installed: true, updateAvailable: true })
  })

  it('diffs two versions of a profile field by field', () => {
    const before = freightRailProfile()
    const after = freightRailProfile({
      outsideParties: ['FRA', 'STB'],
      label: 'Freight railroad (Class I)',
      systems: { it: [...before.systems.it, 'Car hire'], ot: before.systems.ot },
    })
    const diff = profileFieldDiff(before, after)
    expect(diff.map((d) => d.field)).toEqual(['label', 'systems', 'outsideParties'])
    expect(diff.find((d) => d.field === 'outsideParties')).toMatchObject({
      label: 'Outside parties',
      added: ['STB'],
      removed: ['Shippers'],
    })
    expect(diff.find((d) => d.field === 'systems')?.added).toEqual(['IT: Car hire'])
    expect(diff.find((d) => d.field === 'label')).toMatchObject({
      before: 'Freight railroad',
      after: 'Freight railroad (Class I)',
    })
    expect(profileFieldDiff(before, before)).toEqual([])
  })
})
