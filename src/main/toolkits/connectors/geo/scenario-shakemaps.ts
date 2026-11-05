// USGS ShakeMap scenario replay connector (spec 0450 FR-10): the scenario earthquakes USGS
// publishes (a magnitude 7.7 on the southern San Andreas fault, a Caribbean trench event) with
// their ShakeMap, damage and "Did You Feel It?" style products. These are planning scenarios,
// not real earthquakes, and every label says so. The scenario catalog has no real dates, so the
// connector ignores the period and asks by magnitude (and area when one is given). The case data
// provenance model has two origins, historical and simulated; a scenario fits neither exactly, so
// the source line, every dataset label and the citation carry "scenario" in words.
import { USGS_EVENT_QUERY } from '../../../hazards/sources/usgs'
import { registerConnector } from '../registry'
import { makeEventConnector } from './comcat'

export const SCENARIO_QUERY = USGS_EVENT_QUERY.replace('/fdsnws/event/', '/fdsnws/scenario/')

export const scenarioShakemaps = makeEventConnector({
  id: 'scenario-shakemaps',
  label: 'USGS ShakeMap scenario earthquakes',
  source: 'USGS ShakeMap scenario catalog (planning scenarios, not real earthquakes)',
  terms:
    'U.S. government work, public domain. A scenario is a planning estimate of one possible earthquake, not an event that happened.',
  base: SCENARIO_QUERY,
  suffix: '-scenario',
  labelPrefix: 'SCENARIO (not a real earthquake): ',
  ignorePeriod: true,
  citation: (id) =>
    `U.S. Geological Survey ShakeMap scenario ${id}, https://earthquake.usgs.gov/scenarios/eventpage/${id}. A scenario, not a real earthquake.`,
  catalogCitation:
    'U.S. Geological Survey ShakeMap scenario catalog, https://earthquake.usgs.gov/scenarios/. Scenarios, not real earthquakes.',
})

export const registerScenarioShakemaps = (): void => registerConnector(scenarioShakemaps)
