// Lint rule `erg_distance_untabled` (spec 0456 FR-6) and the schema of the optional guidebook
// data file. No guidebook content ships with the app: until a table is loaded the rule flags every
// real UN number that appears with distances in the same sentence, so an author either names the
// guidebook edition the numbers came from in the same sentence, uses a fictional material, or loads a table.
// The facts it works from are plain text; nothing is looked up or sent anywhere.
import { z } from 'zod'

/** One row of the guidebook's isolation and protective action table, as a data file carries it. */
export const ErgEntry = z.object({
  unNumber: z.string().regex(/^[0-9]{4}$/),
  guide: z.string().regex(/^[0-9]{3}P?$/),
  name: z.string().min(1).max(120),
  distances: z
    .array(
      z.object({
        spill: z.enum(['small', 'large']),
        time: z.enum(['day', 'night']),
        isolationMeters: z.number().positive(),
        protectiveKm: z.number().positive(),
      }),
    )
    .min(1)
    .max(8),
})
export type ErgEntry = z.infer<typeof ErgEntry>

/** `packs/data/erg/<name>.json`: entries and the edition they came from (shown in handbooks). */
export const ErgTable = z.object({
  edition: z.string().min(1).max(80),
  entries: z.array(ErgEntry).max(2000),
})
export type ErgTable = z.infer<typeof ErgTable>

export interface ErgFinding {
  code: 'ERG_DISTANCE_UNTABLED'
  unNumber: string
  distances: string[]
  message: string
}

const METERS: Record<string, number> = {
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  m: 1,
  meter: 1,
  meters: 1,
  metre: 1,
  metres: 1,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
}
const UN = /\b(?:UN|NA)\s?(\d{4})\b/gi
const DIST = /(\d[\d,]*(?:\.\d+)?)\s*(feet|foot|ft|meters?|metres?|miles?|mi|kilometers?|km|m)\b/gi
const FICTIONAL = /\b(fictional|invented|made-up|exercise material|exercise values?)\b/i
/** The author says the numbers came from their own copy, which the controller handbook states. */
const FROM_BOOK = /\b(guidebook|ERG ?20\d\d)\b/i

const toMeters = (value: string, unit: string): number =>
  Number(value.replace(/,/g, '')) * (METERS[unit.toLowerCase()] ?? 1)

function matchesTable(table: ErgTable | undefined, un: string, meters: number[]): boolean {
  const entry = table?.entries.find((e) => e.unNumber === un)
  if (!entry) return false
  const known = entry.distances.flatMap((d) => [d.isolationMeters, d.protectiveKm * 1000])
  return meters.some((m) => known.some((k) => Math.abs(m - k) <= k * 0.05))
}

/** Findings for a text: real UN numbers paired with distances that no loaded table backs. */
export function ergDistanceUntabled(text: string, table?: ErgTable): ErgFinding[] {
  const findings: ErgFinding[] = []
  for (const sentence of text.split(/(?<=[.;!?])\s+|\n+/)) {
    if (FICTIONAL.test(sentence) || FROM_BOOK.test(sentence)) continue
    const uns = [...sentence.matchAll(UN)].map((m) => m[1]!)
    const dists = [...sentence.matchAll(DIST)].map((m) => ({
      text: `${m[1]} ${m[2]}`,
      meters: toMeters(m[1]!, m[2]!),
    }))
    if (!uns.length || !dists.length) continue
    for (const un of new Set(uns)) {
      if (
        matchesTable(
          table,
          un,
          dists.map((d) => d.meters),
        )
      )
        continue
      findings.push({
        code: 'ERG_DISTANCE_UNTABLED',
        unNumber: un,
        distances: dists.map((d) => d.text),
        message:
          `UN${un} appears with distances (${dists.map((d) => d.text).join(', ')}) that are not in a loaded guidebook table. ` +
          'Say they come from your own guidebook edition, use a fictional material, or load a table.',
      })
    }
  }
  return findings
}
