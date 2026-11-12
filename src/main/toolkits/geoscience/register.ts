// Registers the earth science toolkits' code-backed parts: the replay connectors and the simulated
// generators. Idempotent, so startup and tests may both call it.
import type { z } from 'zod'
import {
  generatorIds,
  registerGenerator,
  type SimulatedGenerator,
} from '../../case-data/generators'
import type {
  DebrisFlowParams,
  EarthquakeParams,
  LaharParams,
  TsunamiParams,
  UnrestParams,
} from '../geo/simulate/generators'
import { GEO_GENERATORS } from '../geo/simulate/generators'
import { comcat } from '../connectors/geo/comcat'
import { fdsnWaveforms } from '../connectors/geo/fdsn'
import { landslideAssessments, quaternaryFaults } from '../connectors/geo/hazard-layers'
import { scenarioShakemaps } from '../connectors/geo/scenario-shakemaps'
import { tsunamiEvents } from '../connectors/geo/tsunami-events'
import { volcanoNotices } from '../connectors/geo/volcano-notices'
import { coopsTides, ndbcDart } from '../connectors/geo/water-level'
import { hasConnector, registerConnector } from '../connectors/registry'

export const GEO_CONNECTORS = [
  comcat,
  scenarioShakemaps,
  fdsnWaveforms,
  volcanoNotices,
  tsunamiEvents,
  coopsTides,
  ndbcDart,
  quaternaryFaults,
  landslideAssessments,
]

type Declaration = Pick<SimulatedGenerator, 'description' | 'toolkits' | 'example' | 'fields'>

const PLACE_HELP = 'JSON object: name, lon and lat in decimal degrees (west and south negative).'

/** What the simulation form needs for each earth science generator (#1141). */
export const GEO_DECLARATIONS: Readonly<Record<string, Declaration>> = {
  'sim-earthquake': {
    description:
      'An earthquake at a place and magnitude you choose: shaking that falls with distance from the fault, an aftershock sequence and the aftershock forecast written from the same numbers, and early warning times that are late near the epicenter. It writes the event, a ShakeMap-style grid, shaking at each place, the aftershocks, the forecast and the events the timing measures score against.',
    toolkits: ['seismic', 'structures'],
    example: {
      name: 'Haldane earthquake',
      epicenter: { lon: -124.1, lat: 46.82 },
      magnitude: 6.8,
      depthKm: 18,
      originTime: '2026-11-05T14:22:07Z',
      strikeDeg: 20,
      places: [
        { name: 'Aberdeen', lon: -123.815, lat: 46.975 },
        { name: 'Olympia', lon: -122.9, lat: 47.04 },
        { name: 'Seattle', lon: -122.33, lat: 47.61 },
      ],
      gridCols: 40,
      gridRows: 32,
      aftershockDays: 30,
      aftershockMinMagnitude: 2.5,
      forecastAtDays: 0.25,
      alertDelaySec: 5,
      seed: 1,
    } satisfies z.input<typeof EarthquakeParams>,
    fields: {
      name: { label: 'Event name', help: 'A fictional name used in the labels.' },
      epicenter: { label: 'Epicenter', help: 'JSON object: lon and lat in decimal degrees.' },
      magnitude: { label: 'Magnitude', help: 'Moment magnitude, 4 to 9.2.' },
      depthKm: { label: 'Depth (km)', help: '1 to 80 km.' },
      originTime: { label: 'Origin time (UTC)', help: 'As an ISO date and time.' },
      strikeDeg: {
        label: 'Fault strike (degrees)',
        help: 'Direction of the fault, degrees clockwise from north, 0 to 359.',
      },
      places: {
        label: 'Places',
        help: 'JSON list (up to 10) of { name, lon, lat }; each gets its shaking and early warning time.',
      },
      gridCols: { label: 'Grid columns', help: 'Shaking grid width in cells, 10 to 100.' },
      gridRows: { label: 'Grid rows', help: 'Shaking grid height in cells, 10 to 100.' },
      aftershockDays: {
        label: 'Aftershock days',
        help: 'Days of aftershocks to simulate, 1 to 365.',
      },
      aftershockMinMagnitude: {
        label: 'Smallest aftershock',
        help: 'Smallest aftershock magnitude listed, 2 to 4.',
      },
      forecastAtDays: {
        label: 'Forecast issued after (days)',
        help: 'Days after the mainshock the aftershock forecast is issued, 0 to 30 (0.25 is six hours).',
      },
      alertDelaySec: {
        label: 'Alert delay (seconds)',
        help: 'Seconds from origin until the early warning alert goes out, 2 to 30.',
      },
      seed: {
        label: 'Random seed',
        help: 'Any whole number; the same seed gives the same aftershocks.',
      },
    },
  },
  'sim-volcanic-unrest': {
    description:
      'Volcanic unrest with rising earthquakes, uplift and gas, an alert level that follows a stated rule, and an eruption on the day you choose or none. It writes the seismicity, tilt, GPS and SO2 series, the alert level and the events the volcano measures read.',
    toolkits: ['volcanic'],
    example: {
      volcano: { name: 'Mount Hollis', lon: -121.76, lat: 46.87 },
      startTime: '2026-10-22T00:00:00Z',
      days: 30,
      eruptionDay: 24,
      baselineQuakesPerDay: 6,
      seed: 1,
    } satisfies z.input<typeof UnrestParams>,
    fields: {
      volcano: { label: 'Volcano', help: PLACE_HELP },
      startTime: { label: 'Start (UTC)', help: 'Day 0 of the unrest, as an ISO date and time.' },
      days: { label: 'Days', help: 'Length of the unrest, 5 to 90 days.' },
      eruptionDay: {
        label: 'Eruption day',
        help: 'Day from the start the eruption begins, within the run; leave empty for unrest that does not erupt.',
      },
      baselineQuakesPerDay: {
        label: 'Background earthquakes a day',
        help: 'Earthquakes a day before unrest builds, 1 to 50.',
      },
      seed: {
        label: 'Random seed',
        help: 'Any whole number; the same seed gives the same series.',
      },
    },
  },
  'sim-lahar': {
    description:
      'A lahar detected at its source and the time it would reach each community along the valley. It writes the travel times and the arrival events the evacuation timing measures read.',
    toolkits: ['volcanic'],
    example: {
      source: { name: 'Mount Hollis summit', lon: -121.76, lat: 46.87 },
      detectedAt: '2026-11-05T14:22:00Z',
      communities: [
        { name: 'Orting', lon: -122.2, lat: 47.1, minutes: 40 },
        { name: 'Puyallup', lon: -122.29, lat: 47.19, minutes: 65 },
      ],
    } satisfies z.input<typeof LaharParams>,
    fields: {
      source: { label: 'Lahar source', help: PLACE_HELP },
      detectedAt: {
        label: 'Detected (UTC)',
        help: 'When the lahar is detected, as an ISO date and time.',
      },
      communities: {
        label: 'Communities',
        help: 'JSON list (1 to 12) of { name, lon, lat, minutes (travel time from detection) }.',
      },
    },
  },
  'sim-tsunami': {
    description:
      'A tsunami from an earthquake source, with arrival times from distance at each place (local places in minutes, distant ones in hours) and a tide gauge record at one place. It writes the arrivals, the gauge series, the wave series and the events the tsunami message measures read.',
    toolkits: ['tsunami', 'seismic'],
    example: {
      source: { name: 'Offshore source', lon: -126.8, lat: 46.2 },
      magnitude: 8.6,
      originTime: '2026-11-05T14:22:07Z',
      meanDepthM: 3000,
      places: [
        { name: 'Westport', lon: -124.1, lat: 46.89 },
        { name: 'Long Beach', lon: -124.05, lat: 46.35 },
        { name: 'Hilo', lon: -155.09, lat: 19.72 },
      ],
      gaugePlace: 'Westport',
      waveHeightM: 1.2,
      wavePeriodMin: 25,
      tideAmplitudeM: 1,
    } satisfies z.input<typeof TsunamiParams>,
    fields: {
      source: { label: 'Source', help: PLACE_HELP },
      magnitude: { label: 'Earthquake magnitude', help: '6.5 to 9.5.' },
      originTime: { label: 'Origin time (UTC)', help: 'As an ISO date and time.' },
      meanDepthM: {
        label: 'Mean ocean depth (m)',
        help: 'Sets the wave speed, 200 to 6,000 meters.',
      },
      places: { label: 'Places', help: 'JSON list (1 to 15) of { name, lon, lat } on the coast.' },
      gaugePlace: {
        label: 'Tide gauge at',
        help: 'Name of the place whose tide gauge record is simulated; the first place when empty.',
      },
      waveHeightM: { label: 'Wave height (m)', help: '0.1 to 15 meters at the gauge.' },
      wavePeriodMin: { label: 'Wave period (minutes)', help: '5 to 90 minutes.' },
      tideAmplitudeM: { label: 'Tide amplitude (m)', help: '0 to 4 meters.' },
    },
  },
  'sim-debris-flow': {
    description:
      'A rainfall scenario over a burn area, and one debris flow for each basin whose 15-minute rain crosses its threshold. It writes the rainfall and 15-minute rain series, the debris flows and the events and series the debris flow measures read.',
    toolkits: ['debris_flow', 'wildfire'],
    example: {
      fire: 'Cedar Ridge Fire',
      startTime: '2026-11-05T18:00:00Z',
      peakIntensityMmHr: 40,
      durationMin: 180,
      thresholdMm15: 6,
      basins: [
        { name: 'Basin A', lon: -118.7, lat: 46.35, thresholdMm15: 4 },
        { name: 'Basin B', lon: -118.6, lat: 46.35, thresholdMm15: 9 },
        { name: 'Basin C', lon: -118.5, lat: 46.35 },
      ],
    } satisfies z.input<typeof DebrisFlowParams>,
    fields: {
      fire: {
        label: 'Fire (burn area)',
        help: 'Name of the fire whose burn area the rain falls on.',
      },
      startTime: { label: 'Rain starts (UTC)', help: 'As an ISO date and time.' },
      peakIntensityMmHr: {
        label: 'Peak rain intensity (mm/h)',
        help: '2 to 150 millimeters an hour.',
      },
      durationMin: { label: 'Storm length (minutes)', help: '30 to 720 minutes.' },
      thresholdMm15: {
        label: 'Threshold (mm in 15 minutes)',
        help: 'Rain over 15 minutes at which a basin without its own threshold produces a flow, 1 to 40 mm.',
      },
      basins: {
        label: 'Basins',
        help: "JSON list (1 to 20) of { name, lon, lat, thresholdMm15 (optional, the basin's own threshold) }.",
      },
    },
  },
}

export function registerGeoscienceToolkits(): void {
  const have = new Set(generatorIds())
  for (const g of GEO_GENERATORS)
    if (!have.has(g.id)) registerGenerator({ ...g, ...GEO_DECLARATIONS[g.id] })
  for (const c of GEO_CONNECTORS) if (!hasConnector(c.id)) registerConnector(c)
}
