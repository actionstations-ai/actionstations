// Sample radar figure data built from the recorded Level II fixture (KILN, 7 May 2024, 20:03Z;
// the first records of the volume only, so the sweeps are sectors). Used by the radar figure's
// tests and to write the weather figure template's preview.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RadarData } from '../../../render/figures/weather/radar'
import { decodeVolume, type MomentName, type Volume } from './level2'
import { polarFromSweep } from './polar'

export const FIXTURE_PATH = join(
  __dirname,
  '../../../../../tests/fixtures/weather/KILN20240507_200303_V06.part',
)

let cached: Volume | undefined
export const fixtureVolume = (): Volume => (cached ??= decodeVolume(readFileSync(FIXTURE_PATH)))

const PRODUCTS: Record<RadarData['product'], { moment: MomentName; elevation: number }> = {
  reflectivity: { moment: 'REF', elevation: 1 },
  correlation_coefficient: { moment: 'RHO', elevation: 1 },
  velocity: { moment: 'VEL', elevation: 2 },
}

/** Radar figure data for the fixture; the overlays mark a warning polygon near the strongest echoes. */
export function sampleRadarData(product: RadarData['product']): RadarData {
  const volume = fixtureVolume()
  const { moment, elevation } = PRODUCTS[product]
  const sweep = volume.sweeps.find((s) => s.elevationNumber === elevation)!
  const field = polarFromSweep(sweep, moment, { maxRangeKm: 150 })!
  const site = {
    id: volume.icao,
    name: 'Wilmington OH',
    lat: volume.latitude,
    lon: volume.longitude,
  }
  return {
    title: 'Radar view, exercise injects',
    origin: 'historical',
    site,
    product,
    time: new Date(sweep.startMs).toISOString(),
    elevationDeg: sweep.elevationDeg,
    extentKm: 150,
    field,
    overlays: {
      counties: [],
      places: [
        { name: 'Cincinnati', lat: 39.1, lon: -84.51 },
        { name: 'Dayton', lat: 39.76, lon: -84.19 },
        { name: 'Columbus', lat: 39.96, lon: -83.0 },
      ],
      polygons: [
        {
          label: 'Exercise warning',
          kind: 'warning',
          points: [
            [39.9, -82.62],
            [39.85, -82.3],
            [39.66, -82.38],
            [39.7, -82.68],
          ],
        },
      ],
      motions: [{ lat: 39.78, lon: -82.5, fromDeg: 250, speedKt: 32 }],
    },
  }
}
