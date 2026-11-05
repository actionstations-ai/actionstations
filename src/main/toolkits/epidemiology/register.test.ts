import { afterEach, describe, expect, it } from 'vitest'
import { clearGenerators, generatorIds } from '../../case-data/generators'
import { clearConnectors, connectorIds } from '../connectors/registry'
import { registerEpidemiologyToolkit } from './register'

afterEach(() => {
  clearGenerators()
  clearConnectors()
})

describe('registerEpidemiologyToolkit', () => {
  it('registers the five generators and may be called twice', () => {
    registerEpidemiologyToolkit()
    registerEpidemiologyToolkit()
    expect(generatorIds().filter((id) => id.startsWith('epi-'))).toEqual([
      'epi-common-source',
      'epi-compartment',
      'epi-contacts',
      'epi-dispensing',
      'epi-wastewater',
    ])
  })

  it('registers the two CDC connectors the toolkit names', () => {
    registerEpidemiologyToolkit()
    expect(connectorIds()).toEqual(['cdc-nndss', 'cdc-nwss'])
  })
})
