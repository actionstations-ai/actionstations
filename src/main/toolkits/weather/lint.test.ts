import { describe, expect, it } from 'vitest'
import { fieldLintIssues, fieldLintRuleIds } from '../lint-rules'

// Every registered rule that reads the type runs; the ids say which rules a case is about.
const run = (_ids: string[], type: string, fields: Record<string, unknown>) =>
  fieldLintIssues(type, fields)

describe('metar_syntax', () => {
  const ok = [
    'METAR KILN 211853Z 24012G22KT 3SM +TSRA BKN025CB 24/22 A2992 RMK AO2',
    'KCVG 040053Z AUTO VRB03KT 10SM CLR M02/M05 A3012',
    'SPECI KDAY 211900Z 27015G28KT 1 1/2SM TSRA BR BKN008 OVC020 22/21 A2985',
    'KCMH 211851Z 00000KT 9999 FEW250 18/10 A3001',
  ]
  it.each(ok)('accepts %s', (line) => {
    expect(run(['metar_syntax'], 'metar_report', { reports: [line] })).toEqual([])
  })

  it.each([
    ['KILN 211853Z 24012G10KT 3SM BKN025 24/22 A2992', /gust/],
    ['KILN 2118Z 24012KT 3SM BKN025 24/22 A2992', /DDHHMMZ/],
    ['KILN 211853Z 24012KT 3SM BKN025 22/24 A2992', /dew point/],
    ['KILN 211853Z 24012KT 3SM BKN025 24/22', /altimeter/],
    ['KILN 211853Z 24012KT 3SM BKN025 A2992', /temperature/],
    ['KILN 211853Z 240KT 3SM BKN025 24/22 A2992', /wind group/],
    ['KILN 211853Z 24012KT 3SM LOTS 24/22 A2992', /not a METAR group/],
  ])('flags %s', (line, why) => {
    const issues = run(['metar_syntax'], 'metar_report', { reports: [line] })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(why)
    expect(issues[0]!.path).toBe('fields.reports[0]')
  })

  it('ignores other inject types', () => {
    expect(run(['metar_syntax'], 'memo', { reports: ['garbage'] })).toEqual([])
  })
})

describe('taf_syntax', () => {
  const taf = `TAF KILN 211720Z 2118/2224 24010KT P6SM SCT050
 FM212100 22015G25KT 3SM TSRA BKN025CB
 TEMPO 2121/2124 1SM +TSRA OVC015CB
 PROB30 2203/2206 VRB20G35KT
 BECMG 2209/2211 30008KT P6SM SKC`
  it('accepts a well-formed TAF', () => {
    expect(run(['taf_syntax'], 'taf_forecast', { taf })).toEqual([])
  })
  it.each([
    ['TAF KILN 211720Z 2118-2224 24010KT P6SM SCT050', /valid period/],
    ['TAF KILN 211720Z 2118/2224 24010KT P6SM SCT050 TEMPO 1SM TSRA', /TEMPO needs/],
    ['TAF KILN 211720Z 2118/2224 P6SM SCT050', /no wind/],
    ['TAF 211720Z 2118/2224 24010KT', /station/],
    ['TAF KILN 211720Z 2118/2224 24010KT SPLAT', /not a TAF group/],
  ])('flags %s', (text, why) => {
    const issues = run(['taf_syntax'], 'taf_forecast', { taf: text })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(why)
  })
})

describe('latlon_polygon', () => {
  it('accepts a warning polygon, with five-digit longitudes too', () => {
    expect(
      run(['latlon_polygon'], 'nws_weather_warning', {
        latLon: 'LAT...LON 4148 8166 4139 8139 4121 8144 4125 8172',
      }),
    ).toEqual([])
    expect(
      run(['latlon_polygon'], 'nws_weather_warning', {
        latLon: 'LAT...LON 3500 10012 3510 10001 3490 10005',
      }),
    ).toEqual([])
  })
  it.each([
    ['LAT...LON 4148 8166 4139 8139', /three points/],
    ['LAT...LON 4148 8166 4139 8139 4121', /left over/],
    ['LAT...LON 41.48 -81.66 41.39 -81.39 41.21 -81.44', /hundredths|LAT\.\.\.LON/],
    ['LAT...LON 4148 8166 4139 8139 4121 8144 4148 8166', /repeats/],
    ['41.48 -81.66', /starts with LAT/],
  ])('flags %s', (latLon, why) => {
    const issues = run(['latlon_polygon'], 'nws_weather_warning', { latLon })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(why)
  })
  it('limits a polygon to 20 points', () => {
    const pts = Array.from({ length: 21 }, (_, i) => `41${10 + i} 81${10 + i}`).join(' ')
    expect(
      run(['latlon_polygon'], 'nws_weather_warning', { latLon: `LAT...LON ${pts}` })[0]!.message,
    ).toMatch(/20/)
  })
})

describe('product_header and vtec_syntax', () => {
  it('accepts the sample warning header', () => {
    expect(
      run(['product_header', 'vtec_syntax'], 'nws_weather_warning', {
        wmoHeader: 'WGUS51 KILN 211814',
        awipsId: 'FFWILN',
        issued: '214 PM EDT Wed Oct 21 2026',
        vtec: '/O.NEW.KILN.FF.W.0042.261021T1814Z-261021T2115Z/',
      }),
    ).toEqual([])
  })
  it('flags each malformed header line', () => {
    const issues = run(['product_header', 'vtec_syntax'], 'nws_weather_warning', {
      wmoHeader: 'WGUS51 KILN 21:18',
      awipsId: 'ffw wilmington',
      issued: '2:14 PM EDT',
      vtec: '/NEW.KILN.FF.W.42/',
    })
    expect(issues.map((i) => i.path)).toEqual([
      'fields.wmoHeader',
      'fields.awipsId',
      'fields.issued',
      'fields.vtec',
    ])
  })
  it('registers every weather rule by id', () => {
    expect(fieldLintRuleIds()).toEqual(
      expect.arrayContaining([
        'metar_syntax',
        'taf_syntax',
        'latlon_polygon',
        'product_header',
        'vtec_syntax',
      ]),
    )
  })
})
