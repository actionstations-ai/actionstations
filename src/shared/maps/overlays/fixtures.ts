// Small overlay sets shared by the overlay tests: a storm situation near one town.
import type { OverlayLayer } from '../../schemas/map-overlays'
import { buildOverlayLayers, type OverlayDataset, type RasterDescriptor } from './geojson'

export const T0 = '2026-06-12T18:00:00Z'
export const T1 = '2026-06-12T19:00:00Z'
export const T2 = '2026-06-12T20:00:00Z'
export const T3 = '2026-06-12T21:00:00Z'

export const WARNINGS: OverlayDataset = {
  id: 'warnings',
  title: 'Warning areas',
  legend: 'Warnings and watches',
  collection: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'w1',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-84.6, 39.0],
              [-84.2, 39.0],
              [-84.2, 39.3],
              [-84.6, 39.3],
              [-84.6, 39.0],
            ],
          ],
        },
        properties: { name: 'Tornado Warning', severity: 'extreme', onset: T0, expires: T2 },
      },
      {
        type: 'Feature',
        id: 'w2',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-85.0, 38.8],
                [-84.0, 38.8],
                [-84.0, 39.5],
                [-85.0, 39.5],
                [-85.0, 38.8],
              ],
            ],
          ],
        },
        properties: {
          name: 'Severe Thunderstorm Watch',
          severity: 'moderate',
          onset: T1,
          expires: T3,
        },
      },
      { type: 'Feature', geometry: null, properties: { name: 'No shape' } },
    ],
  },
}

export const REPORTS: OverlayDataset = {
  id: 'reports',
  title: 'Storm reports',
  collection: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'r1',
        geometry: { type: 'Point', coordinates: [-84.5, 39.1] },
        properties: { name: 'Hail 1.75 in', onset: T1 },
      },
      {
        type: 'Feature',
        id: 'r2',
        geometry: { type: 'Point', coordinates: [-84.3, 39.2] },
        properties: { name: 'Wind damage', onset: T2 },
      },
    ],
  },
}

export const TRACK: OverlayDataset = {
  id: 'track',
  title: 'Storm track',
  track: true,
  collection: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-84.9, 39.0],
            [-84.6, 39.15],
            [-84.2, 39.3],
          ],
        },
        properties: { name: 'Cell 4', onset: T0, expires: T3 },
      },
    ],
  },
}

/** A 4 by 3 reflectivity-like grid, two frames. */
export const RADAR: RasterDescriptor = {
  id: 'radar',
  title: 'Radar reflectivity',
  legend: 'Reflectivity',
  width: 4,
  height: 3,
  bbox: [-85, 38.8, -84, 39.5],
  colorScale: {
    unit: 'dBZ',
    mode: 'continuous',
    stops: [
      { value: 10, color: '#cfe8f3' },
      { value: 35, color: '#3a9d5d' },
      { value: 50, color: '#d9a400' },
      { value: 65, color: '#8b1a1a' },
    ],
  },
  frames: [
    {
      id: 'f1',
      time: { start: T0, end: T1 },
      values: [5, 12, 20, null, 18, 30, 44, 38, 22, 36, 55, 66],
    },
    {
      id: 'f2',
      time: { start: T2 },
      values: [8, 15, 25, 12, 20, 36, 50, 40, 25, 40, 60, 70],
    },
  ],
}

export const storm = (): OverlayLayer[] =>
  buildOverlayLayers({ datasets: [WARNINGS, TRACK, REPORTS], rasters: [RADAR] }).layers
