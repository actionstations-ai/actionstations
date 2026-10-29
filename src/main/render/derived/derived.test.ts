// Code-built alert strings: SAME header, VTEC and UGC, CAP times and XML, ICAO Q line (spec 0432).
import { describe, expect, it } from 'vitest'
import { SAME_EVENTS, sameEventName } from '../../../shared/alerting/same-events'
import { buildCapXml, capStatus, deriveCap, exerciseHeadline, xmlEscape } from './cap'
import { deriveFields } from './index'
import { buildIcaoHeading, buildQLine, deriveNotam } from './notam-q'
import { buildSameHeader, deriveEas, purgeTime, stationId } from './same'
import { capTime, nwsIssuanceLine } from './time'
import { buildUgc, buildVtec, deriveNws, nwsKind } from './vtec'

describe('SAME header (47 CFR 11.31)', () => {
  it('builds the header from fields, with the call sign dash written as a slash', () => {
    const header = buildSameHeader({
      originator: 'WXR',
      event: 'TOR',
      locations: ['039173', '039051'],
      purgeMinutes: 30,
      issued: new Date('2026-06-08T18:29:00Z'),
      station: 'KCLE-NWS',
    })
    expect(header).toBe('ZCZC-WXR-TOR-039173-039051+0030-1591829-KCLE/NWS-')
  })

  it('writes the issue time in UTC as day of year, hour and minute', () => {
    const header = buildSameHeader({
      originator: 'CIV',
      event: 'FFW',
      locations: ['039035'],
      purgeMinutes: 60,
      issued: new Date('2026-10-21T14:20:00-04:00'),
      station: 'EXERCISE',
    })
    expect(header).toBe('ZCZC-CIV-FFW-039035+0100-2941820-EXERCISE-')
  })

  it('rolls into the next year in UTC', () => {
    const header = buildSameHeader({
      originator: 'CIV',
      event: 'CEM',
      locations: ['039035'],
      purgeMinutes: 30,
      issued: new Date('2026-12-31T23:30:00-05:00'),
      station: 'EXERCISE',
    })
    expect(header).toContain('+0030-0010430-')
  })

  it('keeps at most 31 location codes and drops malformed ones', () => {
    const many = Array.from({ length: 40 }, (_, i) => String(39000 + i).padStart(6, '0'))
    const header = buildSameHeader({
      originator: 'CIV',
      event: 'CEM',
      locations: ['12', ...many],
      purgeMinutes: 60,
      issued: new Date('2026-01-01T00:00:00Z'),
      station: 'EXERCISE',
    })
    const where = header.split('+')[0]!.split('-').slice(3)
    expect(where).toHaveLength(31)
    expect(where.every((c) => /^[0-9]{6}$/.test(c))).toBe(true)
  })

  it('rounds the purge time up to a valid step: 15 minutes to an hour, then 30', () => {
    expect([purgeTime(10), purgeTime(20), purgeTime(60), purgeTime(61), purgeTime(95)]).toEqual([
      '0015',
      '0030',
      '0100',
      '0130',
      '0200',
    ])
    expect(purgeTime(400)).toBe('0600')
  })

  it('pads the station id to 8 characters', () => {
    expect(stationId('wxyz-tv')).toBe('WXYZ/TV ')
    expect(stationId('EXERCISE')).toBe('EXERCISE')
    expect(stationId('A VERY LONG NAME')).toHaveLength(8)
  })

  it('derives the crawl in capitals, marked as an exercise, with times in the station zone', () => {
    const d = deriveEas({
      originator: 'CIV',
      event: 'EVI',
      locations: ['039035'],
      areaNames: ['Haldane County', 'Marlow County'],
      issued: '2026-10-21T14:20:00-04:00',
      purgeMinutes: 60,
      station: 'EXERCISE',
      timeZone: 'America/New_York',
    })
    expect(d.crawl).toBe(
      'EXERCISE EXERCISE EXERCISE. A CIVIL AUTHORITY HAS ISSUED A EVACUATION IMMEDIATE FOR THE FOLLOWING AREAS: HALDANE COUNTY; MARLOW COUNTY; BEGINNING AT 2:20 PM EDT AND ENDING AT 3:20 PM EDT. MESSAGE FROM EXERCISE.',
    )
    expect(d.endUtc).toBe('2026-10-21T19:20:00Z')
  })
})

describe('VTEC and UGC (NWSI 10-1703)', () => {
  const begin = new Date('2026-10-21T18:14:00Z')
  const end = new Date('2026-10-21T21:15:00Z')

  it('builds a new-event P-VTEC string with begin and end times', () => {
    const v = buildVtec({
      action: 'NEW',
      office: 'KILN',
      phenomenon: 'FF',
      significance: 'W',
      eventNumber: 42,
      begin,
      end,
    })
    expect(v).toBe('/O.NEW.KILN.FF.W.0042.261021T1814Z-261021T2115Z/')
  })

  it('prints the begin time as zeros for a continuation, and zeros for an open end', () => {
    const v = buildVtec({
      action: 'CON',
      office: 'KILN',
      phenomenon: 'FF',
      significance: 'W',
      eventNumber: 42,
      begin,
    })
    expect(v).toBe('/O.CON.KILN.FF.W.0042.000000T0000Z-000000T0000Z/')
  })

  it('builds the UGC line with the expiry as DDHHMM in UTC', () => {
    expect(buildUgc('OH', 'C', ['035', '093'], end)).toBe('OHC035-093-212115-')
  })

  it('writes the issuance line in the office time zone', () => {
    expect(nwsIssuanceLine(new Date('2026-10-21T18:14:00Z'), 'America/New_York')).toBe(
      '214 PM EDT Wed Oct 21 2026',
    )
  })

  it('classifies products', () => {
    expect(nwsKind('Tornado Warning')).toBe('warning')
    expect(nwsKind('Flash Flood Statement')).toBe('statement')
    expect(nwsKind('Special Weather Statement')).toBe('sps')
    expect(nwsKind('Tornado Watch')).toBe('watch')
  })

  it('derives a statement with the action phrase and no VTEC for a Special Weather Statement', () => {
    const base = {
      timeZone: 'America/New_York',
      issuedAt: '2026-10-21T14:14:00-04:00',
      untilAt: '2026-10-21T17:15:00-04:00',
      vtecInfo: { action: 'CAN', office: 'KILN', phenomenon: 'FF', eventNumber: 42 },
    }
    const statement = deriveNws({ ...base, product: 'Flash Flood Statement' })
    expect(statement.vtec).toBe('/O.CAN.KILN.FF.W.0042.000000T0000Z-000000T0000Z/')
    expect(statement.actionPhrase).toBe('is cancelled for')
    expect(statement.warningName).toBe('Flash Flood Warning')
    expect(statement.until).toBe('515 PM EDT')
    expect(deriveNws({ ...base, product: 'Special Weather Statement' }).vtec).toBeUndefined()
  })
})

describe('CAP 1.2 (OASIS 2010, IPAWS profile)', () => {
  const fields = {
    identifier: 'EXERCISE-1',
    sender: 'alerts@example.org',
    senderName: 'Rook County <EM> & Fire',
    status: 'Exercise',
    msgType: 'Alert',
    sent: '2026-10-21T14:14:00Z',
    expires: '2026-10-21T17:15:00-04:00',
    category: 'Met',
    event: 'Flash Flood Warning',
    responseType: ['Avoid'],
    urgency: 'Immediate',
    severity: 'Severe',
    certainty: 'Observed',
    eventCode: 'FFW',
    easOrg: 'CIV',
    areaDesc: 'Haldane County',
    sameCodes: ['039035'],
    headline: 'Flash Flood Warning',
    description: 'Water rising.',
    instruction: 'Move to higher ground.',
    cmamText: 'x'.repeat(95),
    cmamLongText: 'y'.repeat(40),
  }

  it('never writes Z in a time and prefixes the headline with EXERCISE', () => {
    expect(capTime('2026-10-21T14:14:00Z')).toBe('2026-10-21T14:14:00+00:00')
    const xml = buildCapXml(fields)
    expect(xml).toContain('<sent>2026-10-21T14:14:00+00:00</sent>')
    expect(xml).toContain('<headline>EXERCISE - Flash Flood Warning</headline>')
  })

  it('turns Actual or anything unknown into Exercise', () => {
    expect(capStatus('Actual')).toBe('Exercise')
    expect(capStatus('Test')).toBe('Test')
    expect(buildCapXml({ ...fields, status: 'Actual' })).toContain('<status>Exercise</status>')
  })

  it('escapes markup in values', () => {
    expect(xmlEscape('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;')
    expect(buildCapXml(fields)).toContain('Rook County &lt;EM&gt; &amp; Fire')
  })

  it('cuts the WEA parameters at 90 and 360 characters and reports the counts', () => {
    const xml = buildCapXml(fields)
    expect(xml).toContain(`<value>${'x'.repeat(90)}</value>`)
    const d = deriveCap(fields)
    expect(d.shortCount).toBe(95)
    expect(d.shortOver).toBe(true)
    expect(d.longOver).toBe(false)
  })

  it('writes a second info block for the Spanish text', () => {
    const xml = buildCapXml({ ...fields, infoEs: { headline: 'Advertencia', description: 'Agua' } })
    expect(xml.match(/<info>/g)).toHaveLength(2)
    expect(xml).toContain('<language>es-US</language>')
    expect(xml).toContain('<headline>EJERCICIO - Advertencia</headline>')
    expect(exerciseHeadline('EXERCISE - already')).toBe('EXERCISE - already')
  })

  it('has no DOCTYPE, entity or processing instruction beyond the XML declaration', () => {
    const xml = buildCapXml(fields)
    expect(xml).not.toMatch(/<!DOCTYPE|<!ENTITY|<\?(?!xml )/)
  })
})

describe('ICAO NOTAM', () => {
  const icao = {
    series: 'A',
    number: '0412/26',
    type: 'N',
    fir: 'KZOB',
    qCode: 'QRTCA',
    traffic: 'IV',
    purpose: 'NBO',
    scope: 'W',
    lower: '0',
    upper: '29',
    coordinates: '4128N08143W',
    radiusNm: '3',
  }

  it('builds the Q line with padded flight levels and radius', () => {
    expect(buildQLine(icao)).toBe('KZOB/QRTCA/IV/NBO/W/000/029/4128N08143W003')
  })

  it('builds the heading, naming the replaced NOTAM for R and C', () => {
    expect(buildIcaoHeading(icao)).toBe('A0412/26 NOTAMN')
    expect(buildIcaoHeading({ ...icao, type: 'R', replaces: 'A0398/26' })).toBe(
      'A0412/26 NOTAMR A0398/26',
    )
  })

  it('derives nothing without an icao block', () => {
    expect(deriveNotam({ text: 'X' })).toEqual({})
    expect(deriveNotam({ icao }).icaoQ).toMatch(/^Q\) KZOB\//)
  })
})

describe('deriveFields', () => {
  it('returns {} for a type without derivation and never throws', () => {
    expect(deriveFields('memo', {})).toEqual({})
    expect(deriveFields('eas_broadcast', { issued: 5 })).toEqual({})
  })

  it('knows the SAME event names', () => {
    expect(sameEventName('TOR')).toBe('Tornado Warning')
    expect(sameEventName('ZZZ')).toBe('ZZZ')
    expect(Object.keys(SAME_EVENTS).every((c) => /^[A-Z]{3}$/.test(c))).toBe(true)
  })
})
