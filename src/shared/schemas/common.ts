import { z } from 'zod'

/**
 * Path-safe identifier (ULIDs, "I-07b", prompt names). Ids become folder and file names,
 * so they may never contain separators, dots-only segments, or leading punctuation.
 */
export const SafeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, 'Invalid id')
export const Id = SafeId

/** http(s) URL only — rejects javascript:, file:, data: and friends. */
export const HttpUrl = z.url({ protocol: /^https?$/ })

type PatchShape<S extends z.ZodRawShape> = {
  [K in keyof S]: z.ZodOptional<z.ZodType<z.output<S[K]>>>
}

/**
 * Patch schema for an object: every field optional and with NO defaults applied.
 * zod v4's .partial() keeps inner .default()s, which would silently reset fields the
 * caller did not send. Use this for every update/patch request.
 */
export function patchOf<S extends z.ZodRawShape>(
  schema: z.ZodObject<S>,
): z.ZodObject<PatchShape<S>> {
  const shape: Record<string, z.ZodType> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    let inner = field as z.ZodType
    while (inner instanceof z.ZodDefault || inner instanceof z.ZodPrefault) {
      inner = (inner as z.ZodDefault).unwrap() as z.ZodType
    }
    shape[key] = inner.optional()
  }
  return z.object(shape) as unknown as z.ZodObject<PatchShape<S>>
}
export const IsoDateTime = z.iso.datetime({ offset: true })
/** Exercise clock "H:MM" (0:00, 1:15, 3:45). */
export const ExerciseTime = z.string().regex(/^\d{1,2}:[0-5]\d$/, 'Expected exercise time H:MM')
/** Wall clock "HH:MM" (09:15). */
export const WallClock = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM')
/** Relative POSIX-style path inside a project folder; never absolute, never escapes. */
export const RelPath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.split(/[\\/]/).includes('..'), {
    message: 'Path must be relative and stay inside the project',
  })

export const Citation = z.object({
  documentId: Id,
  documentTitle: z.string(),
  /** e.g. "TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure" */
  headingPath: z.string(),
  page: z.number().int().positive().optional(),
  quote: z.string().optional(),
  chunkId: z.number().int().optional(),
})
export type Citation = z.infer<typeof Citation>

/** Convert "H:MM" to minutes. */
export function exerciseMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function formatExerciseTime(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
