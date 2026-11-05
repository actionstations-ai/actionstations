import { describe, expect, it } from 'vitest'
import {
  fieldTaskGroups,
  mergeTagObjectives,
  tagCapabilityRows,
  tagObjectiveDrafts,
} from './program-tags'
import { ToolkitSchema } from './schema'

const toolkit = (id: string, capabilities: unknown[]) =>
  ToolkitSchema.parse({ id, name: id, description: id, capabilities })

const a = toolkit('a', [
  {
    coreCapability: 'situational_assessment',
    criticalTasks: ['Keep one count.', 'Date every figure.'],
    mappings: [{ framework: 'PHEP', ids: ['6', '13'] }],
  },
  { coreCapability: 'not_a_capability', criticalTasks: ['ignored'] },
  { coreCapability: 'cybersecurity', criticalTasks: [] },
])
const b = toolkit('b', [
  {
    coreCapability: 'operational_coordination',
    criticalTasks: ['Agree one case definition.'],
    mappings: [{ framework: 'PHEP', ids: ['3'] }],
  },
  {
    coreCapability: 'situational_assessment',
    criticalTasks: ['Keep one count.', 'Track reporting delays.'],
    mappings: [{ framework: 'Other', ids: ['13'] }],
  },
])

const tag = {
  label: 'PHEP Capstone 300 (functional exercise)',
  objectives: [
    'Laboratory: the role of the LRN-B in a large response.',
    'Incorporate the applicable capability functions.',
    'Include the five priorities.',
  ],
}

describe('a program tag’s objectives', () => {
  it('take the lead words before a colon as the name', () => {
    expect(tagObjectiveDrafts(tag)).toEqual([
      { name: 'Laboratory', text: 'The role of the LRN-B in a large response.' },
      { name: '', text: 'Incorporate the applicable capability functions.' },
      { name: '', text: 'Include the five priorities.' },
    ])
  })

  it('are appended with fresh ids and unique names, named after the tag when unnamed', () => {
    let n = 0
    const existing = [{ id: 'o1', name: 'Laboratory', text: 'Our own lab objective.' }]
    const r = mergeTagObjectives(existing, [tag], () => `new-${++n}`)
    expect(r.objectives.map((o) => [o.id, o.name])).toEqual([
      ['o1', 'Laboratory'],
      ['new-1', 'Laboratory (2)'],
      ['new-2', 'PHEP Capstone 300'],
      ['new-3', 'PHEP Capstone 300 (2)'],
    ])
    expect(r.added).toHaveLength(3)
  })

  it('are not added twice, whether the scenario holds them split or as the program words them', () => {
    const once = mergeTagObjectives([], [tag], () => 'x').objectives
    expect(mergeTagObjectives(once, [tag], () => 'y').added).toEqual([])
    const asWritten = tag.objectives.map((text, i) => ({ id: `o${i}`, name: '', text }))
    expect(mergeTagObjectives(asWritten, [tag], () => 'z').added).toEqual([])
  })
})

describe('a program tag’s capabilities', () => {
  const t = {
    capabilities: ['Capability 3: Coordination', 'Capability 13: Surveillance', 'Priorities'],
    capabilityFramework: 'PHEP',
  }

  it('map to the Core Capabilities whose toolkit mapping in the same framework names the number', () => {
    expect(tagCapabilityRows(t, [a, b])).toEqual([
      { label: 'Capability 3: Coordination', coreCapabilities: ['operational_coordination'] },
      { label: 'Capability 13: Surveillance', coreCapabilities: ['situational_assessment'] },
      { label: 'Priorities', coreCapabilities: [] },
    ])
  })

  it('map to nothing when the tag names no framework', () => {
    expect(tagCapabilityRows({ capabilities: t.capabilities }, [a, b])).toEqual([])
  })
})

describe('field critical tasks for the evaluation guides', () => {
  it('group the toolkits’ tasks by Core Capability, merged without repeats', () => {
    expect(fieldTaskGroups([a, b])).toEqual([
      {
        capability: 'situational_assessment',
        name: 'Situational Assessment',
        tasks: ['Keep one count.', 'Date every figure.', 'Track reporting delays.'],
        mappings: 'PHEP 6, 13; Other 13',
      },
      {
        capability: 'operational_coordination',
        name: 'Operational Coordination',
        tasks: ['Agree one case definition.'],
        mappings: 'PHEP 3',
      },
    ])
  })

  it('are empty without toolkits', () => {
    expect(fieldTaskGroups([])).toEqual([])
  })
})
