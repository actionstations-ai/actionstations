// Registers the clinical downtime case-data generator; generator-modules.ts lists this module.
// Idempotent, so a startup registration and this import may both run.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { clinicalDowntimeGenerator } from './generators'

if (!generatorIds().includes(clinicalDowntimeGenerator.id))
  registerGenerator(clinicalDowntimeGenerator)
