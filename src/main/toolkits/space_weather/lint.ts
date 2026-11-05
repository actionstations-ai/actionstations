// Format checks for space weather products (spec 0468 FR-4). Pure functions over plain data; the
// toolkit names them by id (`lintRules` in packs/toolkits/space_weather.json). Sources: the NOAA
// Space Weather Scales (G to Kp, R to GOES X-ray class, S to 10 MeV proton flux) and the layouts
// of the live SWPC messages. The checks reproduce what a product states; they do not decide when
// SWPC issues a watch or a warning.

export interface SpaceLintIssue {
  rule:
    'scale_mapping' | 'message_code' | 'issue_time' | 'product_kind' | 'cme_arrival' | 'icao_layout'
  message: string
}

/** The G level for a Kp value: 5 is G1 up to 9 is G5, with 9- counted as G4; below 5 is none. */
export function gLevelForKp(kp: number, sign: '' | '-' | '+' = ''): number {
  if (kp >= 9) return sign === '-' ? 4 : 5
  return kp >= 5 ? kp - 4 : 0
}

/** The R level for a GOES X-ray class such as M5 or X1.2; below M1 is none. */
export function rLevelForXray(letter: string, value: number): number {
  const flux =
    value * (letter.toUpperCase() === 'X' ? 1e-4 : letter.toUpperCase() === 'M' ? 1e-5 : 0)
  if (flux >= 2e-3) return 5
  if (flux >= 1e-3) return 4
  if (flux >= 1e-4) return 3
  if (flux >= 5e-5) return 2
  if (flux >= 1e-5) return 1
  return 0
}

/** The S level for a 10 MeV integral proton flux in pfu: 10 is S1, each level ten times higher. */
export function sLevelForFlux(pfu: number): number {
  if (pfu < 10) return 0
  return Math.min(5, Math.floor(Math.log10(pfu)))
}

const GAP = '[^.;\\n]{0,45}?'
/** Between a level and the value that follows it, a comma ends the claim ("G4, Kp 9"). */
const GAP_BACK = '[^.;,\\n]{0,45}?'

/** Claims such as "Kp 7 (G3)", "K-index of 6 ... G2", "X1.2 flare ... R3", "1000 pfu ... S3". */
export function lintScaleMapping(text: string): SpaceLintIssue[] {
  const issues: SpaceLintIssue[] = []
  const add = (message: string) => issues.push({ rule: 'scale_mapping', message })
  const kpFirst = new RegExp(
    `\\b(?:[Kk]p|[Kk]-index)(?: of)?\\s*(\\d)([+-])?${GAP}\\bG([1-5])\\b`,
    'g',
  )
  const gFirst = new RegExp(
    `\\bG([1-5])\\b${GAP_BACK}\\b(?:[Kk]p|[Kk]-index)(?: of)?\\s*(\\d)([+-])?`,
    'g',
  )
  for (const m of text.matchAll(kpFirst))
    checkG(Number(m[1]), (m[2] ?? '') as '', Number(m[3]), add)
  for (const m of text.matchAll(gFirst)) checkG(Number(m[2]), (m[3] ?? '') as '', Number(m[1]), add)

  const xFirst = new RegExp(`\\b([MX])(\\d+(?:\\.\\d+)?)\\b${GAP}\\bR([1-5])\\b`, 'g')
  const rFirst = new RegExp(`\\bR([1-5])\\b${GAP_BACK}\\b([MX])(\\d+(?:\\.\\d+)?)\\b`, 'g')
  for (const m of text.matchAll(xFirst)) checkR(m[1]!, Number(m[2]), Number(m[3]), add)
  for (const m of text.matchAll(rFirst)) checkR(m[2]!, Number(m[3]), Number(m[1]), add)

  const flux = '(\\d[\\d,]*)\\s*(?:pfu|PFU|particle flux units)'
  const fFirst = new RegExp(`\\b${flux}${GAP}\\bS([1-5])\\b`, 'g')
  const sFirst = new RegExp(`\\bS([1-5])\\b${GAP_BACK}\\b${flux}`, 'g')
  for (const m of text.matchAll(fFirst)) checkS(Number(m[1]!.replace(/,/g, '')), Number(m[2]), add)
  for (const m of text.matchAll(sFirst)) checkS(Number(m[2]!.replace(/,/g, '')), Number(m[1]), add)
  return issues
}

function checkG(kp: number, sign: '' | '-' | '+', claimed: number, add: (m: string) => void) {
  const actual = gLevelForKp(kp, sign)
  if (actual !== claimed)
    add(
      `Kp ${kp}${sign} is ${actual ? `G${actual}` : 'below the G scale'}, not G${claimed} (G1 is Kp 5, G2 is 6, G3 is 7, G4 is 8 or 9-, G5 is 9).`,
    )
}

function checkR(letter: string, value: number, claimed: number, add: (m: string) => void) {
  const actual = rLevelForXray(letter, value)
  if (actual !== claimed)
    add(
      `An X-ray class of ${letter}${value} is ${actual ? `R${actual}` : 'below the R scale'}, not R${claimed} (R1 is M1, R2 is M5, R3 is X1, R4 is X10, R5 is X20).`,
    )
}

function checkS(pfu: number, claimed: number, add: (m: string) => void) {
  const actual = sLevelForFlux(pfu)
  if (actual !== claimed)
    add(
      `A 10 MeV proton flux of ${pfu} pfu is ${actual ? `S${actual}` : 'below the S scale'}, not S${claimed} (S1 is 10 pfu, each level ten times higher).`,
    )
}

const KIND_BY_PREFIX: Record<string, string> = {
  WAT: 'WATCH',
  WAR: 'WARNING',
  ALT: 'ALERT',
  SUM: 'SUMMARY',
}

/** A SWPC message code (six characters such as WATA20, WARK07, ALTXMF) against its product kind. */
export function lintMessageCode(code: string, kind: string, headline = ''): SpaceLintIssue[] {
  const issues: SpaceLintIssue[] = []
  if (!/^[A-Z]{3}[A-Z0-9]{3}$/.test(code)) {
    issues.push({
      rule: 'message_code',
      message: `"${code}" is not a SWPC message code shape (three letters for the product kind then three characters, such as WATA20 or ALTK06).`,
    })
    return issues
  }
  const expected = KIND_BY_PREFIX[code.slice(0, 3)]
  if (expected && expected !== kind)
    issues.push({
      rule: 'message_code',
      message: `Code ${code} is a ${expected.toLowerCase()} code but the product kind is ${kind}.`,
    })
  const k = /^(?:WAR|ALT)K0?(\d)$/.exec(code)
  const stated = /K-index of (\d)/i.exec(headline)
  if (k && stated && k[1] !== stated[1])
    issues.push({
      rule: 'message_code',
      message: `Code ${code} is for a K-index of ${k[1]} but the headline says ${stated[1]}.`,
    })
  return issues
}

const SWPC_TIME = /^\d{4} [A-Z][a-z]{2} \d{2} \d{4} UTC$/

/** The issue time as the products write it, in UTC. */
export function lintSwpcIssueTime(time: string): SpaceLintIssue[] {
  if (SWPC_TIME.test(time.trim())) return []
  return [
    {
      rule: 'issue_time',
      message: `Issue time "${time}" should be UTC as the products write it, like "2026 Nov 05 1558 UTC".`,
    },
  ]
}

/** Watch, warning and alert as SWPC defines them: an alert reports a threshold crossed. */
export function lintProductKind(kind: string, headline: string): SpaceLintIssue[] {
  if (kind === 'ALERT' && /\b(predicted|expected|forecast|likely)\b/i.test(headline))
    return [
      {
        rule: 'product_kind',
        message:
          'An alert says a threshold has been reached or an event has begun; predicted or expected conditions belong in a watch or a warning.',
      },
    ]
  if (kind === 'WATCH' && /\b(reached|exceeded|observed|in progress|began)\b/i.test(headline))
    return [
      {
        rule: 'product_kind',
        message:
          'A watch is for elevated risk with uncertain timing; conditions that have been reached belong in an alert or a summary.',
      },
    ]
  return []
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Minutes since the epoch for "2026 Nov 06 1200 UTC", or undefined when it does not parse. */
export function parseSwpcTime(text: string): number | undefined {
  const m = /^(\d{4}) ([A-Z][a-z]{2}) (\d{2}) (\d{2})(\d{2}) UTC$/.exec(text.trim())
  const month = m ? MONTHS.indexOf(m[2]!) : -1
  if (!m || month < 0) return undefined
  return Date.UTC(Number(m[1]), month, Number(m[3]), Number(m[4]), Number(m[5])) / 60000
}

/** CME arrival is uncertain by hours: ordered times and a window of at least three hours. */
export function lintCmeArrival(a: {
  earliest: string
  mostLikely: string
  latest: string
}): SpaceLintIssue[] {
  const e = parseSwpcTime(a.earliest)
  const m = parseSwpcTime(a.mostLikely)
  const l = parseSwpcTime(a.latest)
  if (e === undefined || m === undefined || l === undefined) return []
  const issues: SpaceLintIssue[] = []
  if (!(e <= m && m <= l))
    issues.push({
      rule: 'cme_arrival',
      message: 'The arrival times must run earliest, most likely, latest.',
    })
  else if (l - e < 180)
    issues.push({
      rule: 'cme_arrival',
      message:
        'CME arrival time is uncertain by hours; give a window of at least three hours between earliest and latest.',
    })
  return issues
}

/** The ICAO advisory's fixed lines: DTG, advisory number, effect tokens and four forecast lines. */
export function lintIcaoAdvisory(f: {
  dtg?: string
  advisoryNumber?: string
  effect?: string
  forecasts?: { hours?: string }[]
}): SpaceLintIssue[] {
  const issues: SpaceLintIssue[] = []
  const add = (message: string) => issues.push({ rule: 'icao_layout', message })
  if (f.dtg !== undefined && !/^\d{8}\/\d{4}Z$/.test(f.dtg))
    add(`DTG "${f.dtg}" should be YYYYMMDD/HHMMZ.`)
  if (f.advisoryNumber !== undefined && !/^\d{4}\/\d+$/.test(f.advisoryNumber))
    add(`Advisory number "${f.advisoryNumber}" should be YYYY/N.`)
  if (f.effect !== undefined) {
    const parts = f.effect.split(/\s+AND\s+/)
    for (const p of parts)
      if (!/^(HF COM|GNSS|RADIATION|SATCOM) (MOD|SEV)$/.test(p))
        add(`SWX EFFECT "${p}" should be HF COM, GNSS, RADIATION or SATCOM followed by MOD or SEV.`)
  }
  if (f.forecasts !== undefined) {
    const hours = f.forecasts.map((x) => x.hours)
    const want = ['+6 HR', '+12 HR', '+18 HR', '+24 HR']
    if (hours.length !== 4 || want.some((w, i) => hours[i] !== w))
      add('An advisory has four forecast lines: +6 HR, +12 HR, +18 HR and +24 HR.')
  }
  return issues
}
