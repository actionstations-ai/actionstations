// Helpers shared by the flood connectors: decode and validate a JSON response. These services
// change without notice, so an unexpected shape is refused with a message that names the source
// instead of being passed on (spec 0454 Security).
import type { z } from 'zod'
import { AppError } from '../../lib/errors'
import type { FetchContext } from './registry'

export async function getJson<T>(
  ctx: FetchContext,
  url: string,
  schema: z.ZodType<T>,
  source: string,
): Promise<T> {
  const res = await ctx.get(url)
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(res.data))
  } catch {
    throw new AppError('PROVIDER', `${source} did not return JSON; the service may have changed.`)
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const where = result.error.issues[0]?.path.join('.') || 'the response'
    throw new AppError(
      'PROVIDER',
      `${source} returned an unexpected shape at ${where}; the service may have changed.`,
    )
  }
  return result.data
}

/** A bounding box rounded outward to 0.01 degree, so a request never carries a precise location. */
export function roundedBbox(
  bbox: readonly [number, number, number, number] | undefined,
  maxSpanDeg: number,
  source: string,
): [number, number, number, number] {
  if (!bbox) throw new AppError('VALIDATION', `${source} needs an area: draw or pick a box.`)
  const [w, s, e, n] = bbox
  const out: [number, number, number, number] = [
    Math.floor(w * 100) / 100,
    Math.floor(s * 100) / 100,
    Math.ceil(e * 100) / 100,
    Math.ceil(n * 100) / 100,
  ]
  if (!(out[2] > out[0]) || !(out[3] > out[1]))
    throw new AppError('VALIDATION', `${source}: the area has no size.`)
  if (out[2] - out[0] > maxSpanDeg || out[3] - out[1] > maxSpanDeg)
    throw new AppError(
      'VALIDATION',
      `${source}: the area is larger than ${maxSpanDeg} degrees on a side; pick a smaller one.`,
    )
  return out
}

export const toBytes = (v: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(v))
