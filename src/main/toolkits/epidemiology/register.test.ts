import { afterEach, describe, expect, it } from 'vitest'
import { clearGenerators, generatorIds } from '../../case-data/generators'
import { registerEpidemiologyToolkit } from './register'

afterEach(() => clearGenerators())

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
})
