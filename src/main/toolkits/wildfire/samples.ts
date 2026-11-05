// The fictional sample fire and shutoff event the wildfire tests, previews and goldens use: a
// shrub fire on a foothill ridge pushed to the southwest by a northeast wind that shifts to the
// west, five evacuation zones on the downwind side and one upwind, two places for the AQI.
// Coordinates are an arbitrary foothill area; every name is invented.
import type { FireEventParams } from './simulate/events'
import type { ShutoffEventParams } from './simulate/shutoff'

const IGNITION = { lon: -121.05, lat: 39.2 }
const KM_LAT = 1 / 111.195

/** A point `km` from the ignition toward `bearingDeg`. */
function at(km: number, bearingDeg: number): { lon: number; lat: number } {
  const t = (bearingDeg * Math.PI) / 180
  return {
    lon:
      Math.round(
        (IGNITION.lon + (km * Math.sin(t) * KM_LAT) / Math.cos((IGNITION.lat * Math.PI) / 180)) *
          1e5,
      ) / 1e5,
    lat: Math.round((IGNITION.lat + km * Math.cos(t) * KM_LAT) * 1e5) / 1e5,
  }
}

export const SAMPLE_FIRE: FireEventParams = {
  name: 'Cinder Creek Fire',
  start: '2026-09-12T18:42:00Z',
  stepMinutes: 60,
  durationHours: 14,
  ignition: IGNITION,
  fuel: 'shrub',
  wind: [
    { hour: 0, speedMph: 20, fromDeg: 45 },
    { hour: 5, speedMph: 32, fromDeg: 45 },
    { hour: 10, speedMph: 12, fromDeg: 270 },
  ],
  slope: { percent: 25, upslopeDeg: 225 },
  suppression: { startHour: 9, reduction: 0.5 },
  zones: [
    {
      id: 'C-1',
      name: 'Cinder Canyon Road',
      ...at(1.6, 225),
      radiusKm: 0.5,
      clearanceMin: 45,
      population: 420,
    },
    {
      id: 'C-2',
      name: 'Upper Mill Road',
      ...at(2.8, 220),
      radiusKm: 0.6,
      clearanceMin: 60,
      population: 310,
    },
    {
      id: 'C-3',
      name: 'Pine Hollow',
      ...at(4.2, 230),
      radiusKm: 0.7,
      clearanceMin: 90,
      population: 640,
    },
    {
      id: 'C-4',
      name: 'Calloway Falls north',
      ...at(6.5, 225),
      radiusKm: 0.9,
      clearanceMin: 120,
      population: 1100,
    },
    {
      id: 'C-5',
      name: 'Calloway Falls east',
      ...at(8, 215),
      radiusKm: 1,
      clearanceMin: 120,
      population: 1200,
    },
    {
      id: 'N-1',
      name: 'North Ridge',
      ...at(5, 20),
      radiusKm: 0.6,
      clearanceMin: 60,
      population: 150,
    },
  ],
  places: [
    { name: 'Calloway Falls Elementary', ...at(6.2, 215) },
    { name: 'Calloway Regional Hospital', ...at(8.8, 230) },
  ],
}

export const SAMPLE_SHUTOFF: ShutoffEventParams = {
  utility: 'Pinecrest Valley Electric',
  eventStart: '2026-10-10T22:30:00Z',
  eventHours: 16,
  peakGustMph: 58,
  seed: 4,
  circuitCount: 5,
  circuits: [],
  patrolHours: 3,
  stepMinutes: 30,
}
