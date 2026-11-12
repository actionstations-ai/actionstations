// The code-backed parts of every bundled toolkit (connectors, generators, metrics), in one call,
// for startup and for tests that need all of them. Each register function is idempotent.
import { registerAiIncidentsToolkit } from './ai/register'
import { registerAnimalDiseaseToolkit } from './animal_disease/register'
import { registerClinicalToolkit } from './clinical/register'
import { registerClinicalSystemsToolkit } from './clinical-systems/register'
import { registerSpillConnectors } from './connectors/spill'
import { registerEpidemiologyToolkit } from './epidemiology/register'
import { registerFloodingToolkit } from './flooding'
import { registerGeoscienceToolkits } from './geoscience/register'
import { registerGovernanceToolkit } from './governance/register'
import { registerHospitalityToolkit } from './hospitality/register'
import { registerHumanServicesToolkit } from './human-services/register'
import { registerHumanitarianToolkit } from './humanitarian/register'
import { registerJusticeToolkit } from './justice/register'
import { registerLabSafetyToolkit } from './lab_safety/register'
import { registerLogisticsToolkit } from './logistics/register'
import { registerMediaToolkit } from './media'
import { registerPharmacyToolkit } from './pharmacy/register'
import { registerSpaceWeatherToolkit } from './space_weather/register'
import { registerStructuresToolkit } from './structures/register'
import { registerWeatherToolkit } from './weather'
import { registerWildfireToolkit } from './wildfire/register'

export function registerAllToolkitCode(): void {
  registerGeoscienceToolkits()
  registerMediaToolkit()
  registerFloodingToolkit()
  registerWeatherToolkit()
  registerClinicalToolkit()
  registerClinicalSystemsToolkit()
  registerEpidemiologyToolkit()
  registerAiIncidentsToolkit()
  registerHospitalityToolkit()
  registerJusticeToolkit()
  registerLabSafetyToolkit()
  registerAnimalDiseaseToolkit()
  registerPharmacyToolkit()
  registerLogisticsToolkit()
  registerSpaceWeatherToolkit()
  registerGovernanceToolkit()
  registerHumanServicesToolkit()
  registerWildfireToolkit()
  registerHumanitarianToolkit()
  registerStructuresToolkit()
  registerSpillConnectors()
}
