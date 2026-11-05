// ArcGIS REST feature layers as GeoJSON for flood hazard connectors (spec 0454 FR-10): the
// FEMA National Flood Hazard Layer and the NWS forecast inundation extent. One query function
// with paging; the request carries only a layer address and a rounded box, never plan content.
import { z } from 'zod'
import { getJson } from './json'
import type { FetchContext } from './registry'

const Collection = z.looseObject({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.looseObject({
      type: z.literal('Feature'),
      geometry: z.looseObject({ type: z.string() }).nullable(),
      properties: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
})
export type FeatureCollection = z.infer<typeof Collection>

export interface ArcgisQuery {
  /** Layer address up to and including the layer number, e.g. https://host/.../MapServer/28 */
  layerUrl: string
  bbox: [number, number, number, number]
  outFields: string
  pageSize: number
  maxPages: number
  source: string
}

/** All features of the layer that intersect the box, in WGS84, up to pageSize x maxPages. */
export async function queryLayer(q: ArcgisQuery, ctx: FetchContext): Promise<FeatureCollection> {
  const features: FeatureCollection['features'] = []
  for (let page = 0; page < q.maxPages; page++) {
    const url =
      `${q.layerUrl}/query?where=1%3D1&geometry=${q.bbox.join(',')}` +
      `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&outFields=${encodeURIComponent(q.outFields)}&returnGeometry=true&outSR=4326` +
      `&resultOffset=${page * q.pageSize}&resultRecordCount=${q.pageSize}&f=geojson`
    const res = await getJson(ctx, url, Collection, q.source)
    features.push(...res.features)
    if (res.features.length < q.pageSize) break
  }
  return { type: 'FeatureCollection', features }
}
