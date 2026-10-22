// Carrier inference for departure-board rows whose flight is a bare number (#140). The
// carrier comes from, in order: the row's airline column (known names → IATA code, other
// names → a code from the name), the story (a carrier the scenario already put in front of
// this flight number), a brand airline alias, and the carrier most used on the board. A
// candidate that would duplicate another row's flight (same code + number) is skipped, so a
// spoofed row never collides with a real one.

/** Carrier names → IATA codes for the departure board. */
const AIRLINE_CODES: [RegExp, string][] = [
  [/\bdelta\b/i, 'DL'],
  [/\bunited\b/i, 'UA'],
  [/\bamerican\b/i, 'AA'],
  [/\bsouthwest\b/i, 'WN'],
  [/\bjet ?blue\b/i, 'B6'],
  [/\bspirit\b/i, 'NK'],
  [/\bfrontier\b/i, 'F9'],
  [/\balaska\b/i, 'AS'],
  [/\ballegiant\b/i, 'G4'],
  [/\bsun country\b/i, 'SY'],
  [/\bhawaiian\b/i, 'HA'],
  [/\bbreeze\b/i, 'MX'],
  [/\bair canada\b/i, 'AC'],
  [/\bwest ?jet\b/i, 'WS'],
  [/\bbritish airways\b/i, 'BA'],
  [/\blufthansa\b/i, 'LH'],
  [/\bfed ?ex\b/i, 'FX'],
  [/\bups\b/i, '5X'],
  [/\bskywest\b/i, 'OO'],
  [/\brepublic\b/i, 'YX'],
  [/\benvoy\b/i, 'MQ'],
]

export function carrierCode(airline: string): string | undefined {
  return AIRLINE_CODES.find(([re]) => re.test(airline))?.[1]
}

const GENERIC_WORDS = /^(?:air|airline|airlines|airways|aviation|lines|express|the|of)$/i

/**
 * A two-letter code for a carrier name the table does not know ("NCIA Air" → "NC",
 * "North Coast Airways" → "NC"): initials of the distinctive words, or the first two letters
 * of a single distinctive word.
 */
export function codeFromName(airline: string): string | undefined {
  const words = airline.split(/[^A-Za-z0-9]+/).filter((w) => w && !GENERIC_WORDS.test(w))
  if (!words.length) return undefined
  const code = words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[1]![0]}`
  return code.length === 2 && /[A-Z]/i.test(code) ? code.toUpperCase() : undefined
}

/** Code for an airline name: the IATA code when known, else one built from the name. */
export function airlineToCode(airline: string): string | undefined {
  return carrierCode(airline) ?? codeFromName(airline)
}

const CODE_NUMBER = /^([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)$/i

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Carrier codes the story attaches to this number: "UA 666", "United flight 666", "Delta 666". */
export function storyCarriers(number: string, storyText: string): string[] {
  const n = escapeRe(number)
  const found: string[] = []
  const coded = new RegExp(`\\b([A-Z][A-Z0-9]|[0-9][A-Z])\\s?${n}\\b`, 'g')
  for (const m of storyText.matchAll(coded)) found.push(m[1]!)
  const named = new RegExp(
    `\\b([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?)\\s+(?:flight\\s+#?)?${n}\\b`,
    'g',
  )
  for (const m of storyText.matchAll(named)) {
    const code = carrierCode(m[1]!)
    if (code) found.push(code)
  }
  return found
}

/** Codes of the board's rows that already carry one, most frequent first. */
export function boardCarriers(flights: string[]): string[] {
  const counts = new Map<string, number>()
  for (const f of flights) {
    const m = CODE_NUMBER.exec(f.trim())
    if (m && /[A-Z]/i.test(m[1]!))
      counts.set(m[1]!.toUpperCase(), (counts.get(m[1]!.toUpperCase()) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code)
}

/** Brand aliases that name an airline (airlineA, airlineB, airline …). */
export function aliasCarriers(aliases: Record<string, string>): string[] {
  return Object.entries(aliases)
    .filter(([k, v]) => /^airline/i.test(k) && v.trim())
    .flatMap(([, v]) => {
      const code = airlineToCode(v)
      return code ? [code] : []
    })
}

export interface CarrierContext {
  /** Story text (MSEL events, expected actions, earlier injects) for "<carrier> <number>". */
  storyText?: string
  /** Project brand aliases (airlineA / airlineB). */
  aliases?: Record<string, string>
  /** Every flight value on this board, to pick the board's usual carrier and avoid clashes. */
  boardFlights?: string[]
}

/**
 * The carrier code for a bare flight number, or undefined when nothing supports one.
 * `airline` is the row's own airline column; it always wins when it names a carrier.
 */
export function inferCarrier(
  number: string,
  airline: string | undefined,
  ctx: CarrierContext = {},
): string | undefined {
  const fromColumn = airline?.trim() ? airlineToCode(airline) : undefined
  if (fromColumn) return fromColumn
  const taken = new Set(
    (ctx.boardFlights ?? []).map((f) => f.trim().toUpperCase().replace(/\s+/g, ' ')),
  )
  const free = (code: string) => !taken.has(`${code.toUpperCase()} ${number.toUpperCase()}`)
  const candidates = [
    ...storyCarriers(number, ctx.storyText ?? ''),
    ...aliasCarriers(ctx.aliases ?? {}),
    ...boardCarriers(ctx.boardFlights ?? []),
  ]
  return candidates.map((c) => c.toUpperCase()).find(free)
}
