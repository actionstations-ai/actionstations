import { describe, expect, it } from 'vitest'
import {
  CORE_CAPABILITIES,
  CoreCapabilityId,
  DEFAULT_CAPABILITY_HINTS,
  MISSION_AREAS,
  capabilitiesByArea,
  capabilityName,
  isCoreCapability,
  orderedCapabilities,
} from './core-capabilities'

describe('FEMA Core Capabilities', () => {
  it('ships the 32 capabilities of the National Preparedness Goal with unique ids', () => {
    expect(CORE_CAPABILITIES).toHaveLength(32)
    expect(new Set(CORE_CAPABILITIES.map((c) => c.id)).size).toBe(32)
    expect(new Set(CORE_CAPABILITIES.map((c) => c.name)).size).toBe(32)
    for (const c of CORE_CAPABILITIES) {
      expect(c.id).toMatch(/^[a-z][a-z_]+$/)
      expect(c.definition.length).toBeGreaterThan(20)
      expect(c.areas.length).toBeGreaterThan(0)
    }
  })

  it('uses every mission area, with the three common capabilities in all five', () => {
    for (const area of MISSION_AREAS)
      expect(CORE_CAPABILITIES.some((c) => (c.areas as readonly string[]).includes(area))).toBe(
        true,
      )
    for (const id of ['planning', 'public_information_and_warning', 'operational_coordination'])
      expect(CORE_CAPABILITIES.find((c) => c.id === id)?.areas).toHaveLength(5)
  })

  it('validates ids with the zod enum and names them', () => {
    expect(CoreCapabilityId.safeParse('cybersecurity').success).toBe(true)
    expect(CoreCapabilityId.safeParse('resilience').success).toBe(false)
    expect(isCoreCapability('housing')).toBe(true)
    expect(capabilityName('operational_coordination')).toBe('Operational Coordination')
    expect(capabilityName('made_up')).toBe('made_up')
  })

  it('orders the hinted capabilities first and keeps all 32', () => {
    const airport = orderedCapabilities(['critical_transportation', 'cybersecurity', 'nope'])
    expect(airport.slice(0, 2).map((c) => c.id)).toEqual([
      'critical_transportation',
      'cybersecurity',
    ])
    expect(airport).toHaveLength(32)
    expect(
      orderedCapabilities()
        .slice(0, 5)
        .map((c) => c.id),
    ).toEqual(DEFAULT_CAPABILITY_HINTS)
  })

  it('groups by first mission area for pickers', () => {
    const groups = capabilitiesByArea()
    expect(groups.map((g) => g.area)).toEqual([...MISSION_AREAS])
    expect(groups.flatMap((g) => g.capabilities)).toHaveLength(32)
  })
})
