import { describe, expect, it } from 'vitest'
import type { PackExportSources } from './types'
import {
  idLabel,
  initialState,
  itemsIssues,
  licenseIssues,
  metadataIssues,
  suggestPackId,
  toRequest,
  withProjectDefaults,
  type WizardState,
} from './wizard-model'

const sources: PackExportSources = {
  templates: [{ id: 'rail_board', label: 'Rail board' }],
  prompts: [],
  workflows: [],
  project: {
    path: '/p/Metro.asproj',
    name: 'Metro Line',
    domain: { id: 'transit', label: 'Transit', builtin: true },
    documents: [
      { id: 'd1', title: 'Plan', filename: 'plan.md' },
      { id: 'd2', title: 'Map', filename: 'map.pdf', license: 'CC0-1.0' },
    ],
    exampleSlug: 'metro-line',
  },
  appVersion: '0.3.0',
  suggestedUser: 'jdoe',
}

const withMeta = (s: WizardState): WizardState => ({
  ...s,
  meta: {
    ...s.meta,
    name: 'Metro kit',
    id: 'io.github.jdoe.metro-kit',
    summary: 'A kit.',
    authorName: 'J. Doe',
  },
})

describe('wizard model', () => {
  it('suggests io.github.<user>.<name> ids', () => {
    expect(suggestPackId('J.Doe', 'Metro Kit: Rail!')).toBe('io.github.j-doe.metro-kit-rail')
    expect(suggestPackId('', '')).toBe('io.github.you.my-pack')
    expect(idLabel('--A__b--', 'x')).toBe('a-b')
  })

  it('fills project defaults and keeps document licenses already known', () => {
    const s = withProjectDefaults(initialState('/p/Metro.asproj'), sources)
    expect(s.domainId).toBe('transit_custom')
    expect(s.example).toMatchObject({ slug: 'metro-line', title: 'Metro Line' })
    expect(s.documents).toEqual({
      d1: { include: false, license: '' },
      d2: { include: false, license: 'CC0-1.0' },
    })
  })

  it('needs at least one item and a complete example', () => {
    const s = withProjectDefaults(initialState('/p/Metro.asproj'), sources)
    expect(itemsIssues(s)).toEqual(['Choose at least one item.'])
    expect(itemsIssues({ ...s, includeExample: true })).toEqual([
      'Write a short summary of the example.',
      'The example needs notice text (shown in every project opened from it).',
    ])
  })

  it('checks the metadata', () => {
    const s = initialState(null)
    expect(metadataIssues(withMeta(s))).toEqual([])
    expect(
      metadataIssues({ ...withMeta(s), meta: { ...withMeta(s).meta, id: 'mypack' } }),
    ).toContain('The id must be reverse-DNS, e.g. io.github.you.my-pack.')
  })

  it('has no default pack license and needs one per included document', () => {
    let s = withProjectDefaults(initialState('/p/Metro.asproj'), sources)
    s = { ...s, documents: { ...s.documents, d1: { include: true, license: '' } } }
    expect(licenseIssues(s, { d1: 'Plan' })).toEqual([
      'Choose the pack license.',
      'Document "Plan" has no license.',
      'Confirm that you may redistribute this content.',
    ])
    s = {
      ...s,
      license: 'MIT',
      confirmed: true,
      documents: { ...s.documents, d1: { include: true, license: 'CC-BY-4.0' } },
    }
    expect(licenseIssues(s, { d1: 'Plan' })).toEqual([])
  })

  it('builds the request main expects', () => {
    let s = withMeta(withProjectDefaults(initialState('/p/Metro.asproj'), sources))
    s = {
      ...s,
      templates: ['rail_board'],
      license: 'MIT',
      confirmed: true,
      documents: { ...s.documents, d2: { include: true, license: 'CC0-1.0' } },
      meta: { ...s.meta, tags: 'rail, metro', domains: '' },
    }
    expect(toRequest(s)).toEqual({
      metadata: {
        id: 'io.github.jdoe.metro-kit',
        name: 'Metro kit',
        version: '1.0.0',
        summary: 'A kit.',
        author: { name: 'J. Doe' },
        license: 'MIT',
        domains: [],
        tags: ['rail', 'metro'],
      },
      templates: ['rail_board'],
      prompts: [],
      workflows: [],
      projectPath: '/p/Metro.asproj',
      documents: [{ documentId: 'd2', license: 'CC0-1.0' }],
      redistributeConfirmed: true,
    })
  })
})
