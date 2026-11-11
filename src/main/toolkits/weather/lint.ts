// The weather toolkit's format rules (#658, FR-4): METAR and TAF syntax, LAT...LON polygons,
// product headers and time conventions, P-VTEC. Each checks the structure a forecaster
// would see at a glance, not the meteorology. Formats follow the WMO/FMH-1 METAR groups,
// NWSI 10-813 (TAF), NWSI 10-1703 (VTEC) and 10-1701/10-1702 (headers, polygons).
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'

type Fields = Record<string, unknown>

/** The string values of a field (a string, or the strings of an array), with their paths. */
function stringValues(fields: Fields, key: string): [string, string][] {
  const v = fields[key]
  if (typeof v === 'string') return [[`fields.${key}`, v]]
  if (Array.isArray(v))
    return v.flatMap((x, i): [string, string][] =>
      typeof x === 'string' ? [[`fields.${key}[${i}]`, x]] : [],
    )
  return []
}

const issue = (path: string, message: string): FieldLintIssue => ({ path, message })

// ---- METAR / TAF groups --------------------------------------------------------------------

const WIND = /^(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?KT$/
const VISIBILITY = /^(?:M?\d{1,2}(?: \d\/\d)?SM|\d\/\d{1,2}SM|\d{4}|CAVOK)$/
const WEATHER =
  /^(?:[-+]|VC)?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/
const SKY = /^(?:(?:FEW|SCT|BKN|OVC|VV)\d{3}(?:CB|TCU)?|SKC|CLR|NSC|NCD)$/
const TEMP = /^M?\d{2}\/(?:M?\d{2})?$/
const ALTIMETER = /^[AQ]\d{4}$/
const TIME_Z = /^\d{6}Z$/
const STATION = /^[A-Z][A-Z0-9]{3}$/
const WIND_VARIABLE = /^\d{3}V\d{3}$/
const RUNWAY_VIS = /^R\d{2}[LCR]?\/[PM]?\d{4}(?:V[PM]?\d{4})?(?:FT)?[UDN]?$/

/** Tokens of a METAR body that are not part of the weather groups proper (kept, not judged). */
const METAR_REMARK_START = 'RMK'

function metarProblem(line: string): string | undefined {
  const tokens = line
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(\d) (\d\/\d+SM)/, '$1_$2')
    .split(' ')
  let i = 0
  if (tokens[i] === 'METAR' || tokens[i] === 'SPECI') i++
  if (!STATION.test(tokens[i] ?? '')) return 'a METAR starts with a four-letter station id (KILN)'
  i++
  if (!TIME_Z.test(tokens[i] ?? '')) return 'the observation time is DDHHMMZ in UTC (211853Z)'
  const day = Number(tokens[i]!.slice(0, 2))
  const hour = Number(tokens[i]!.slice(2, 4))
  const min = Number(tokens[i]!.slice(4, 6))
  if (day < 1 || day > 31 || hour > 23 || min > 59)
    return `the time ${tokens[i]} is not a valid DDHHMMZ`
  i++
  if (tokens[i] === 'AUTO' || tokens[i] === 'COR') i++
  const wind = tokens[i] ?? ''
  if (!WIND.test(wind)) return `the wind group "${wind}" must look like 24012G22KT or VRB03KT`
  const speeds = /^(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/.exec(wind)!
  if (speeds[2] && Number(speeds[2]) <= Number(speeds[1]))
    return `the gust in ${wind} must exceed the sustained wind`
  i++
  if (WIND_VARIABLE.test(tokens[i] ?? '')) i++
  const vis = (tokens[i] ?? '').replace('_', ' ')
  if (!VISIBILITY.test(vis)) return `the visibility "${vis}" must look like 10SM, 1 1/2SM or 9999`
  i++
  let temp = false
  let altimeter = false
  for (; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t === METAR_REMARK_START) break
    if (RUNWAY_VIS.test(t) || WEATHER.test(t) || SKY.test(t)) continue
    if (TEMP.test(t)) temp = true
    else if (ALTIMETER.test(t)) altimeter = true
    else return `"${t}" is not a METAR group (weather, sky cover, temperature/dew point, altimeter)`
  }
  if (!temp) return 'the temperature/dew point group (24/22 or M02/M05) is missing'
  if (!altimeter) return 'the altimeter group (A2992) is missing'
  const td = tokens.find((t) => TEMP.test(t))!
  const [t, d] = td.split('/').map((x) => (x.startsWith('M') ? -Number(x.slice(1)) : Number(x)))
  if (d !== undefined && !Number.isNaN(d) && d > t!)
    return `the dew point in ${td} exceeds the temperature`
  return undefined
}

const metarRule: FieldLintRule = {
  id: 'metar_syntax',
  // METAR and SPECI lines use the standard groups in order (station, DDHHMMZ, wind, visibility, weather, sky, temperature/dew point, altimeter).
  injectTypes: ['metar_report'],
  check: (fields) =>
    stringValues(fields, 'reports').flatMap(([path, line]) => {
      const problem = metarProblem(line)
      return problem ? [issue(path, `METAR: ${problem}`)] : []
    }),
}

const VALID_PERIOD = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/

function tafProblem(taf: string): string | undefined {
  const tokens = taf.trim().split(/\s+/)
  let i = 0
  if (tokens[i] === 'TAF') i++
  if (tokens[i] === 'AMD' || tokens[i] === 'COR') i++
  if (!STATION.test(tokens[i] ?? '')) return 'a TAF names a four-letter station (KILN)'
  i++
  if (!TIME_Z.test(tokens[i] ?? '')) return 'the issue time is DDHHMMZ in UTC'
  i++
  const period = VALID_PERIOD.exec(tokens[i] ?? '')
  if (!period) return 'the valid period is DDHH/DDHH (2118/2224)'
  if (Number(period[2]) > 24 || Number(period[4]) > 24)
    return `the valid period ${tokens[i]} has an hour above 24`
  i++
  const body = tokens.slice(i)
  for (let k = 0; k < body.length; k++) {
    const t = body[k]!
    if (/^(?:TEMPO|BECMG|PROB(?:30|40))$/.test(t)) {
      const next = t.startsWith('PROB') && body[k + 1] === 'TEMPO' ? body[k + 2] : body[k + 1]
      if (!VALID_PERIOD.test(next ?? '')) return `${t} needs a DDHH/DDHH period`
      continue
    }
    if (/^FM\d{6}$/.test(t) || t === 'TEMPO' || VALID_PERIOD.test(t)) continue
    if (WIND.test(t) || VISIBILITY.test(t) || WEATHER.test(t) || SKY.test(t)) continue
    if (/^(?:NSW|P6SM|WS\d{3}\/\d{3}\d{2,3}KT|T[XN]M?\d{2}\/\d{4}Z)$/.test(t)) continue
    return `"${t}" is not a TAF group (wind, visibility, weather, sky cover, FM/TEMPO/BECMG/PROB)`
  }
  if (!body.some((t) => WIND.test(t))) return 'the forecast has no wind group'
  return undefined
}

const tafRule: FieldLintRule = {
  id: 'taf_syntax',
  // A TAF has a station, issue time, DDHH/DDHH valid period and well-formed wind, visibility, weather, sky and change groups (FM, TEMPO, BECMG, PROB30/40).
  injectTypes: ['taf_forecast'],
  check: (fields) =>
    stringValues(fields, 'taf').flatMap(([path, taf]) => {
      if (!taf.trim()) return []
      const problem = tafProblem(taf)
      return problem ? [issue(path, `TAF: ${problem}`)] : []
    }),
}

/** The weather text products whose headers, times and polygons follow NWS conventions. */
const NWS_TEXT_TYPES = [
  'nws_weather_warning',
  'convective_outlook',
  'mesoscale_discussion',
  'spc_watch',
  'local_storm_report',
  'public_information_statement',
  'area_forecast_discussion',
  'hazardous_weather_outlook',
  'tropical_cyclone_advisory',
  'tropical_cyclone_discussion',
  'tropical_cyclone_local_statement',
  'storm_surge_warning',
  'excessive_rainfall_outlook',
  'fire_weather_forecast',
  'red_flag_warning',
  'sigmet_advisory',
] as const

// ---- polygons, headers, VTEC ---------------------------------------------------------------

const POLYGON_FIELDS = ['latLon', 'polygon', 'latlon'] as const

function polygonProblem(text: string): string | undefined {
  const m = /LAT\.\.\.LON\s+([\d\s]+)/.exec(text)
  if (!m) return 'a polygon line starts with LAT...LON'
  const nums = m[1]!.trim().split(/\s+/)
  if (nums.length % 2) return 'LAT...LON lists latitude/longitude pairs; one number is left over'
  const pairs = nums.length / 2
  if (pairs < 3) return 'a polygon needs at least three points'
  if (pairs > 20) return `a polygon has at most 20 points, this one has ${pairs}`
  for (let k = 0; k < nums.length; k += 2) {
    const lat = nums[k]!
    const lon = nums[k + 1]!
    if (!/^\d{4}$/.test(lat) || !/^\d{4,5}$/.test(lon))
      return `the point ${lat} ${lon} must be latitude in hundredths of a degree (4 digits) and west longitude (4 or 5 digits)`
    if (Number(lat) < 1500 || Number(lat) > 7200)
      return `latitude ${lat} is outside the United States and its waters`
  }
  if (nums[0] === nums[nums.length - 2] && nums[1] === nums[nums.length - 1] && pairs > 3)
    return 'the polygon repeats its first point at the end; NWS polygons close implicitly'
  return undefined
}

const latLonRule: FieldLintRule = {
  id: 'latlon_polygon',
  injectTypes: NWS_TEXT_TYPES,
  // A LAT...LON polygon lists 3 to 20 points as four-digit latitude and four- or five-digit west longitude in hundredths of a degree.
  check: (fields) =>
    POLYGON_FIELDS.flatMap((key) => stringValues(fields, key)).flatMap(([path, text]) => {
      if (!text.trim()) return []
      const problem = polygonProblem(text)
      return problem ? [issue(path, `Polygon: ${problem}`)] : []
    }),
}

const WMO = /^[A-Z]{4}\d{2} [A-Z]{4} \d{6}(?: (?:RR|CC|AA)[A-Z])?$/
const AWIPS = /^[A-Z0-9]{4,9}$/
const ISSUED =
  /^(?:0?[1-9]\d{2}|1[0-2]\d{2}) (?:AM|PM) [A-Z]{3,4} (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2} \d{4}$/

const headerRule: FieldLintRule = {
  id: 'product_header',
  injectTypes: NWS_TEXT_TYPES,
  // Product headers follow NWS conventions: WMO heading (TTAAii CCCC DDHHMM), a 4 to 9 character AWIPS id, and an issuance time such as 214 PM EDT Wed Oct 21 2026.
  check: (fields) => {
    const out: FieldLintIssue[] = []
    for (const [path, v] of stringValues(fields, 'wmoHeader'))
      if (v && !WMO.test(v.trim()))
        out.push(
          issue(
            path,
            'The WMO heading looks like "WFUS53 KILN 211814" (TTAAii CCCC DDHHMM, with an optional RRx, CCx or AAx indicator)',
          ),
        )
    for (const [path, v] of stringValues(fields, 'awipsId'))
      if (v && !AWIPS.test(v.trim()))
        out.push(
          issue(path, 'The AWIPS id is 4 to 9 upper-case letters or digits (TORILN, MIATCPAT4)'),
        )
    for (const [path, v] of stringValues(fields, 'issued'))
      if (v && !ISSUED.test(v.trim()))
        out.push(
          issue(
            path,
            'The issuance time looks like "214 PM EDT Wed Oct 21 2026" (hour and minutes without a colon, local time zone, weekday, month, day, year)',
          ),
        )
    return out
  },
}

const VTEC =
  /^\/[OTEX]\.(NEW|CON|EXT|EXA|EXB|UPG|CAN|EXP|COR|ROU)\.[A-Z]{4}\.[A-Z]{2}\.[WAYSFON]\.\d{4}\.(?:\d{6}T\d{4}Z)-(?:\d{6}T\d{4}Z)\/$/

const vtecRule: FieldLintRule = {
  id: 'vtec_syntax',
  injectTypes: NWS_TEXT_TYPES,
  // A typed P-VTEC line is /k.aaa.cccc.pp.s.####.yymmddThhnnZ-yymmddThhnnZ/ (NWSI 10-1703).
  check: (fields) =>
    stringValues(fields, 'vtec').flatMap(([path, v]) =>
      v && !VTEC.test(v.trim())
        ? [
            issue(
              path,
              'The P-VTEC line looks like /O.NEW.KILN.TO.W.0012.261104T1830Z-261104T1915Z/',
            ),
          ]
        : [],
    ),
}

export const WEATHER_LINT_RULES: readonly FieldLintRule[] = [
  metarRule,
  tafRule,
  latLonRule,
  headerRule,
  vtecRule,
]

for (const rule of WEATHER_LINT_RULES) registerFieldLintRule(rule)
