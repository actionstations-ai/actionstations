// Test-only: pack domain profiles for registry and snapshot tests (#263), a freight-rail
// domain as a pack would ship it, built from the transit profile with its own id, aliases and
// fact categories. Imported only from *.test.ts(x) files.
import { builtinProfile } from './index'
import type { PackProfileEntry } from './registry'
import { DomainProfile } from './schema'

export function freightRailProfile(over: Partial<DomainProfile> = {}): DomainProfile {
  const transit = builtinProfile('transit')
  return DomainProfile.parse({
    ...transit,
    id: 'freight_rail',
    label: 'Freight railroad',
    description: 'A freight railroad: yards, mainline, dispatch.',
    aliases: ['freight rail', 'railroad'],
    factCategories: [
      { id: 'yards', label: 'Rail yards', noun: 'Yards?', idShape: 'alnum', complete: true },
    ],
    threatFamilies: ['uas_drone', 'cyber'],
    outsideParties: ['FRA', 'Shippers'],
    ...over,
  })
}

export function freightRailEntry(
  version = '1.0.0',
  over: Partial<DomainProfile> = {},
): PackProfileEntry {
  return {
    profile: freightRailProfile(over),
    packId: 'org.example.freight-rail',
    packVersion: version,
    packName: 'Freight Rail',
  }
}
