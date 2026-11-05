// Packs that add threat families conflict like packs that add domain ids (#655): two enabled
// packs may not provide one family id, and no pack may reuse a built-in family id.
import { describe, expect, it } from 'vitest'
import { threatFamily, type DomainProfile } from '@shared/domains'
import { freightRailProfile } from '@shared/domains/pack-fixtures'
import type { PackManifest } from '@shared/schemas/pack'
import {
  builtinDomainConflicts,
  conflictReason,
  findConflicts,
  type ConflictSubject,
} from './conflicts'

const family = (id: string) => ({ ...threatFamily('natural_hazard'), id, label: id })

function subject(id: string, domain: DomainProfile): ConflictSubject {
  const contents = { templates: [], prompts: [], workflows: [], domains: [domain.id] }
  return { id, name: id, manifest: { contents } as unknown as PackManifest, domains: [domain] }
}

const withFamily = (domainId: string, familyId: string) =>
  freightRailProfile({
    id: domainId,
    aliases: [],
    addedThreatFamilies: [family(familyId)],
  })

describe('threat family conflicts', () => {
  it('reports two packs adding the same family id', () => {
    const a = subject('org.a', withFamily('dom_a', 'river_flood'))
    const b = subject('org.b', withFamily('dom_b', 'river_flood'))
    const found = findConflicts(b, [a])
    expect(found).toEqual([
      { kind: 'domains', id: 'threat family river_flood', packId: 'org.a', packName: 'org.a' },
    ])
    expect(conflictReason(found)).toMatch(/Disable org.a to enable this pack/)
  })

  it('does not report different family ids', () => {
    const a = subject('org.a', withFamily('dom_a', 'river_flood'))
    const b = subject('org.b', withFamily('dom_b', 'dam_overtop'))
    expect(findConflicts(b, [a])).toEqual([])
  })

  it('reports a pack adding a built-in family id', () => {
    // The schema refuses this profile; the check still guards profiles that skipped it.
    const unparsed = { ...freightRailProfile(), addedThreatFamilies: [family('cyber')] }
    const s = subject('org.a', unparsed)
    const found = builtinDomainConflicts(s)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'domains', id: 'threat family cyber' })
  })
})
