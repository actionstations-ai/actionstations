// Registers the governance case-data generator; generator-modules.ts lists this module.
// Idempotent, so startup and tests may both import it.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { governanceIncidentGenerator } from './generators'

if (!generatorIds().includes(governanceIncidentGenerator.id))
  registerGenerator(governanceIncidentGenerator)
