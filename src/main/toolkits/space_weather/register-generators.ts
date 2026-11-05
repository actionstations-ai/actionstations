// Registers the space weather case-data generator; generator-modules.ts lists this module.
// Idempotent, so a startup registration and this import may both run.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { spaceWeatherEventGenerator } from './generators'

if (!generatorIds().includes(spaceWeatherEventGenerator.id))
  registerGenerator(spaceWeatherEventGenerator)
