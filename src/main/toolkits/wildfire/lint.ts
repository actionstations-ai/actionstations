// Format checks for wildfire products (spec 0461 FR-6). Pure functions over plain data; the
// toolkit names the rules that wrap them by id (`lintRules` in packs/toolkits/wildfire.json).
// Evacuation words vary by place, so the checks compare a notice with itself (its zone table,
// its headline) and never impose one jurisdiction's definitions.

export interface WildfireLintIssue {
  rule: 'zone_status' | 'containment'
  message: string
}

/** The status words a zone can carry, in the order they are listed in the zone table. */
export const ZONE_STATUSES = [
  'Evacuation order',
  'Evacuation warning',
  'Shelter in place',
  'All clear',
  'Re-entry open',
  'No status',
] as const
export type ZoneStatus = (typeof ZONE_STATUSES)[number]

export interface ZoneRow {
  zone: string
  status: string
}

const ID = '[A-Z0-9]+(?:-[A-Z0-9]+)*'
const LIST = new RegExp(
  `\\bZones?\\s+(${ID}(?:\\s*(?:,|&|\\band\\b|\\bto\\b|\\bthrough\\b)\\s*(?:and\\s+)?${ID})*)`,
  'g',
)

const isZoneId = (token: string): boolean => /\d/.test(token) || /^[A-Z]$/.test(token)

/** Zone ids a text names ("Zones C-1, C-2 and C-3" gives C-1, C-2, C-3), in order, no repeats. */
export function zoneIdsInText(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(LIST)) {
    for (const token of (m[1] ?? '').split(/\s*(?:,|&|\band\b|\bto\b|\bthrough\b)\s*/)) {
      const id = token.trim()
      if (id && isZoneId(id) && !found.includes(id)) found.push(id)
    }
  }
  return found
}

const HEADLINE_WORDS: ReadonlyArray<[RegExp, ZoneStatus]> = [
  [/evacuation order/i, 'Evacuation order'],
  [/evacuation warning/i, 'Evacuation warning'],
  [/shelter in place/i, 'Shelter in place'],
  [/all clear/i, 'All clear'],
  [/re-?entry/i, 'Re-entry open'],
]

/**
 * A zone notice must agree with its own table: no zone listed twice with two statuses, every
 * zone the text names is in the table, and the status words in the headline appear in the table.
 */
export function lintZoneNotice(input: {
  zones: readonly ZoneRow[]
  headline?: string
  text?: readonly string[]
}): WildfireLintIssue[] {
  const issues: WildfireLintIssue[] = []
  const byZone = new Map<string, Set<string>>()
  for (const z of input.zones) {
    const set = byZone.get(z.zone) ?? new Set<string>()
    set.add(z.status)
    byZone.set(z.zone, set)
  }
  for (const [zone, statuses] of byZone)
    if (statuses.size > 1)
      issues.push({
        rule: 'zone_status',
        message: `Zone ${zone} is listed with more than one status (${[...statuses].join(', ')}); a zone has one status at a time.`,
      })
  if (byZone.size) {
    const named = [input.headline ?? '', ...(input.text ?? [])].flatMap(zoneIdsInText)
    for (const id of new Set(named))
      if (!byZone.has(id))
        issues.push({
          rule: 'zone_status',
          message: `The text names Zone ${id}, which is not in the zone table; use the same zone ids on the map, the table and every message.`,
        })
  }
  const present = new Set(input.zones.map((z) => z.status))
  for (const [re, status] of HEADLINE_WORDS)
    if (input.headline && re.test(input.headline) && input.zones.length && !present.has(status))
      issues.push({
        rule: 'zone_status',
        message: `The headline says "${status.toLowerCase()}" but no zone in the table has that status.`,
      })
  return issues
}

/** Percent-contained claims in the text must equal the structured containment, and be 0 to 100. */
export function lintContainment(input: {
  containmentPct?: number
  text: readonly string[]
}): WildfireLintIssue[] {
  const issues: WildfireLintIssue[] = []
  for (const text of input.text)
    for (const m of text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)\s+contained/gi)) {
      const claimed = Number(m[1])
      if (claimed > 100)
        issues.push({
          rule: 'containment',
          message: `Containment cannot be ${claimed} percent; it runs from 0 to 100.`,
        })
      else if (input.containmentPct !== undefined && claimed !== input.containmentPct)
        issues.push({
          rule: 'containment',
          message: `The text says ${claimed} percent contained but containmentPct is ${input.containmentPct}.`,
        })
    }
  return issues
}
