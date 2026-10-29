// The Q line of an ICAO-format NOTAM (ICAO Annex 15 / Doc 8126):
//   Q) FIR/QCODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORDINATES+RADIUS
// and the heading "A0123/26 NOTAMN" (or "A0123/26 NOTAMR A0100/26" with the NOTAM it replaces).
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
const flightLevel = (v: unknown, fallback: string): string => {
  const s = text(v).replace(/\D/g, '')
  return s ? s.padStart(3, '0').slice(-3) : fallback
}

export function buildQLine(i: Record<string, unknown>): string {
  const radius = text(i.radiusNm).replace(/\D/g, '').padStart(3, '0').slice(-3) || '005'
  return [
    text(i.fir),
    text(i.qCode),
    text(i.traffic) || 'IV',
    text(i.purpose) || 'NBO',
    text(i.scope) || 'A',
    flightLevel(i.lower, '000'),
    flightLevel(i.upper, '999'),
    `${text(i.coordinates)}${radius}`,
  ].join('/')
}

export function buildIcaoHeading(i: Record<string, unknown>): string {
  const type = text(i.type) || 'N'
  const id = `${text(i.series)}${text(i.number)}`
  const ref = text(i.replaces)
  return `${id} NOTAM${type}${type !== 'N' && ref ? ` ${ref}` : ''}`
}

/** Derived values for a notam inject; only the ICAO variant's block needs any. */
export function deriveNotam(fields: Record<string, unknown>): Record<string, unknown> {
  const icao = obj(fields.icao)
  if (!text(icao.fir) || !text(icao.qCode)) return {}
  return { icaoQ: `Q) ${buildQLine(icao)}`, icaoHeading: buildIcaoHeading(icao) }
}
