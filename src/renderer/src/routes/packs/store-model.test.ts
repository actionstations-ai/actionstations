// The pack store model (#1152): one entry per pack, state, filters, shelves and a field's packs.
import { describe, expect, it } from 'vitest'
import type { CachedCatalogView, InstalledPackView } from '@shared/ipc'
import type { PackCatalogEntry } from '@shared/schemas/pack'
import { KIND_LABEL } from './pack-format'
import {
  buildStore,
  contentsLine,
  fieldLabel,
  filterStore,
  sameField,
  shelves,
  stateLabel,
} from './store-model'

const SHA = 'a'.repeat(64)
const CATALOG = 'https://actionstations.ai/packs/index.json'

const pack = (over: Partial<InstalledPackView>): InstalledPackView => ({
  id: 'ai.actionstations.wildfire',
  version: '0.8.0',
  name: 'Wildfire and power shutoff',
  summary: 'Wildfire field.',
  description: '',
  domains: ['wildfire'],
  tags: [],
  enabled: true,
  installedAt: '2026-11-01T00:00:00.000Z',
  source: { kind: 'bundled' },
  archiveSha256: SHA,
  contentSha256: SHA,
  items: [
    {
      kind: 'domains',
      id: 'wildfire',
      title: 'Wildfire',
      replacesBuiltin: false,
      size: 1,
      license: 'CC0-1.0',
    },
    { kind: 'templates', id: 'a', title: 'A', replacesBuiltin: false, size: 1, license: 'CC0-1.0' },
    { kind: 'templates', id: 'b', title: 'B', replacesBuiltin: false, size: 1, license: 'CC0-1.0' },
  ],
  conflicts: [],
  bundled: true,
  ...over,
})

const entry = (over: Partial<PackCatalogEntry>): PackCatalogEntry => ({
  id: 'ai.actionstations.wildfire-library',
  name: 'Wildfire reference library',
  version: '1.1.0',
  formatVersion: 1,
  summary: 'NWCG and utility wildfire plans.',
  author: { name: 'Action Stations' },
  contributors: [],
  license: 'CC0-1.0',
  kinds: ['documents'],
  domains: ['wildfire'],
  tags: ['library'],
  minAppVersion: '0.7.1',
  size: 1024,
  sha256: SHA,
  url: 'https://example.org/w.aspack',
  updated: '2026-11-01T00:00:00Z',
  ...over,
})

const catalog = (entries: PackCatalogEntry[], url = CATALOG): CachedCatalogView => ({
  url,
  name: 'Action Stations',
  fetchedAt: '2026-11-01T00:00:00Z',
  skipped: 0,
  entries,
})

describe('buildStore', () => {
  it('lists each pack once: installed with its state, catalog-only as available', () => {
    const store = buildStore(
      [
        pack({}),
        pack({
          id: 'org.x.rail',
          name: 'Rail',
          domains: ['freight_rail'],
          bundled: false,
          source: { kind: 'file', name: 'r.aspack' },
          version: '1.0.0',
        }),
      ],
      [
        catalog([entry({}), entry({ version: '1.0.0' })]),
        catalog(
          [
            entry({}),
            entry({
              id: 'org.x.rail',
              name: 'Rail',
              version: '1.2.0',
              kinds: ['templates'],
              domains: ['freight_rail'],
            }),
          ],
          'https://b.example/index.json',
        ),
      ],
      [],
    )
    expect(store.map((p) => [p.id, p.kind, p.category.id, stateLabel(p.state)])).toEqual([
      ['ai.actionstations.wildfire', 'field', 'hazards', 'On'],
      ['org.x.rail', 'field', 'transportation', 'Update'],
      ['ai.actionstations.wildfire-library', 'library', 'hazards', 'Get'],
    ])
    expect(store[1]!.update?.latest.version).toBe('1.2.0')
    expect(contentsLine(store[0]!.counts, KIND_LABEL)).toBe('2 templates · 1 domain profile')
    expect(contentsLine(store[2]!.counts, KIND_LABEL)).toBe('Reference documents')
  })

  it('never offers a catalog update for a pack included with the app', () => {
    const [field] = buildStore(
      [pack({})],
      [catalog([entry({ id: 'ai.actionstations.wildfire', version: '9.0.0' })])],
      [],
    )
    expect(field!.update).toBeUndefined()
  })
})

describe('store views', () => {
  const store = buildStore(
    [
      pack({}),
      pack({
        id: 'ai.actionstations.weather',
        name: 'Weather toolkit',
        domains: [],
        items: [
          {
            kind: 'toolkits',
            id: 'w',
            title: 'W',
            replacesBuiltin: false,
            size: 1,
            license: 'CC0-1.0',
          },
        ],
      }),
      pack({
        id: 'ai.actionstations.airport',
        name: 'Airports',
        domains: ['airport'],
        enabled: false,
      }),
    ],
    [catalog([entry({})])],
    [],
  )

  it('shelves by category, fields before toolkits and libraries', () => {
    expect(shelves(store).map((s) => [s.category.id, s.packs.map((p) => p.name)])).toEqual([
      ['transportation', ['Airports']],
      ['hazards', ['Wildfire and power shutoff', 'Weather toolkit', 'Wildfire reference library']],
    ])
  })

  it('searches every word across name, summary, category and kind', () => {
    expect(
      filterStore(store, { query: 'hazards library', category: '', kind: '' }).map((p) => p.name),
    ).toEqual(['Wildfire reference library'])
    expect(
      filterStore(store, { query: '', category: 'hazards', kind: 'field' }).map((p) => p.name),
    ).toEqual(['Wildfire and power shutoff'])
  })

  it('lists the other packs of the same field and names the field after its field pack', () => {
    const fire = store.find((p) => p.id === 'ai.actionstations.wildfire')!
    expect(sameField(fire, store).map((p) => p.name)).toEqual(['Wildfire reference library'])
    expect(fieldLabel('wildfire', store)).toBe('Wildfire and power shutoff')
    expect(fieldLabel('space_weather', store)).toBe('Space weather')
    expect(stateLabel(store.find((p) => p.name === 'Airports')!.state)).toBe('Off')
  })
})
