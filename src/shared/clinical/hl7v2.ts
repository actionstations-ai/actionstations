// HL7 v2 message checks and decoding for the clinical systems toolkit (spec 0451 FR-5, lint rule
// `hl7v2_syntax`). The standard text is licensed and is not bundled; this module knows only the
// structure of the messages the toolkit shows (ADT A01/A03/A08, ORM O01, ORU R01): pipe-delimited
// segments, MSH separators, required segments, timestamp and value-type shapes. It does not
// claim to validate the standard. Pure: no Node imports.

export interface Hl7Segment {
  id: string
  /** Fields by position: fields[0] is field 1 of the segment (for MSH, field 1 is the separator). */
  fields: string[]
}

export interface Hl7Issue {
  segment: string
  message: string
}

const REQUIRED_SEGMENTS: Record<string, string[]> = {
  'ADT^A01': ['MSH', 'EVN', 'PID', 'PV1'],
  'ADT^A03': ['MSH', 'EVN', 'PID', 'PV1'],
  'ADT^A08': ['MSH', 'EVN', 'PID', 'PV1'],
  'ORM^O01': ['MSH', 'PID', 'ORC', 'OBR'],
  'ORU^R01': ['MSH', 'PID', 'OBR', 'OBX'],
}

export const HL7_MESSAGE_TYPES = Object.keys(REQUIRED_SEGMENTS)

/** Value types the OBX segment may declare in the messages the toolkit shows. */
const OBX_VALUE_TYPES = new Set(['NM', 'ST', 'TX', 'CWE', 'CE', 'SN', 'DT', 'TM'])

/** HL7 date/time: YYYY[MM[DD[HH[MM[SS]]]]] (no zone offsets in the toolkit's samples). */
const DTM = /^\d{4}(\d{2}(\d{2}(\d{2}(\d{2}(\d{2})?)?)?)?)?$/

export function splitSegments(raw: string): string[] {
  return raw
    .split(/\r\n|\r|\n/)
    .map((s) => s.trimEnd())
    .filter((s) => s.length > 0)
}

export function parseHl7(raw: string): Hl7Segment[] {
  return splitSegments(raw).map((line) => {
    const id = line.slice(0, 3)
    if (id === 'MSH') {
      // MSH-1 is the field separator itself; the text after "MSH|" starts at MSH-2.
      return { id, fields: ['|', ...line.slice(4).split('|')] }
    }
    return { id, fields: line.slice(4).split('|') }
  })
}

/** Field `n` (1-based) of the first segment with this id, or '' when absent. */
export function hl7Field(segments: Hl7Segment[], id: string, n: number, repeat = 0): string {
  const seg = segments.filter((s) => s.id === id)[repeat]
  return seg?.fields[n - 1] ?? ''
}

function checkMsh(msh: Hl7Segment | undefined, issues: Hl7Issue[]): string {
  if (!msh) return ''
  if (msh.fields[1] !== '^~\\&')
    issues.push({ segment: 'MSH', message: 'MSH-2 must be the encoding characters ^~\\&' })
  const type = msh.fields[8] ?? ''
  const base = type.split('^').slice(0, 2).join('^')
  if (!REQUIRED_SEGMENTS[base])
    issues.push({
      segment: 'MSH',
      message: `MSH-9 message type "${type}" is not one the toolkit shows`,
    })
  if (!msh.fields[9]) issues.push({ segment: 'MSH', message: 'MSH-10 message control id is empty' })
  if (!/^2\.\d(\.\d)?$/.test(msh.fields[11] ?? ''))
    issues.push({ segment: 'MSH', message: 'MSH-12 version must look like 2.5.1' })
  if (!DTM.test(msh.fields[6] ?? ''))
    issues.push({ segment: 'MSH', message: 'MSH-7 timestamp must be YYYYMMDD[HHMM[SS]]' })
  return base
}

function checkSegmentShapes(segments: Hl7Segment[], issues: Hl7Issue[]): void {
  for (const seg of segments) {
    if (!/^[A-Z][A-Z0-9]{2}$/.test(seg.id))
      issues.push({
        segment: seg.id,
        message: `segment id "${seg.id}" is not three upper-case characters`,
      })
  }
  const pid = segments.find((s) => s.id === 'PID')
  if (pid) {
    if (!pid.fields[2])
      issues.push({ segment: 'PID', message: 'PID-3 patient identifier is empty' })
    if (!pid.fields[4]) issues.push({ segment: 'PID', message: 'PID-5 patient name is empty' })
    const dob = pid.fields[6] ?? ''
    if (dob && !DTM.test(dob))
      issues.push({ segment: 'PID', message: 'PID-7 birth date must be YYYYMMDD' })
    const sex = pid.fields[7] ?? ''
    if (sex && !['M', 'F', 'O', 'U', 'A', 'N'].includes(sex))
      issues.push({
        segment: 'PID',
        message: 'PID-8 administrative sex must be M, F, O, U, A or N',
      })
  }
  for (const [i, obx] of segments.filter((s) => s.id === 'OBX').entries()) {
    const type = obx.fields[1] ?? ''
    if (!OBX_VALUE_TYPES.has(type))
      issues.push({
        segment: 'OBX',
        message: `OBX #${i + 1} value type "${type}" is not one the toolkit shows`,
      })
    if (type === 'NM' && !/^-?\d+(\.\d+)?$/.test(obx.fields[4] ?? ''))
      issues.push({
        segment: 'OBX',
        message: `OBX #${i + 1} is typed NM but its value is not a number`,
      })
    if (!obx.fields[2])
      issues.push({ segment: 'OBX', message: `OBX #${i + 1} has no observation identifier` })
  }
}

/** Structural problems in an HL7 v2 message; an empty list means none were found. */
export function validateHl7(raw: string): Hl7Issue[] {
  const issues: Hl7Issue[] = []
  if (!raw.startsWith('MSH|')) {
    return [{ segment: 'MSH', message: 'a message starts with "MSH|"' }]
  }
  const segments = parseHl7(raw)
  const type = checkMsh(segments[0], issues)
  for (const need of REQUIRED_SEGMENTS[type] ?? [])
    if (!segments.some((s) => s.id === need))
      issues.push({ segment: need, message: `${type} needs a ${need} segment` })
  checkSegmentShapes(segments, issues)
  return issues
}

/** A decoded row of the message view: where it is in the message, what it means, its value. */
export interface Hl7Decoded {
  field: string
  meaning: string
  value: string
}

const MEANINGS: Record<string, string> = {
  'MSH-3': 'Sending application',
  'MSH-4': 'Sending facility',
  'MSH-5': 'Receiving application',
  'MSH-6': 'Receiving facility',
  'MSH-7': 'Message time',
  'MSH-9': 'Message type',
  'MSH-10': 'Message control id',
  'MSH-12': 'HL7 version',
  'PID-3': 'Patient identifier',
  'PID-5': 'Patient name',
  'PID-7': 'Birth date',
  'PID-8': 'Administrative sex',
  'PV1-2': 'Patient class',
  'PV1-3': 'Assigned location',
  'ORC-1': 'Order control',
  'ORC-2': 'Placer order number',
  'OBR-4': 'Universal service identifier',
  'OBX-3': 'Observation identifier',
  'OBX-5': 'Observation value',
  'OBX-6': 'Units',
  'OBX-7': 'Reference range',
  'OBX-8': 'Abnormal flag',
  'OBX-11': 'Result status',
}

/** Decode the fields in MEANINGS that the message carries, in segment order. */
export function decodeHl7(raw: string): Hl7Decoded[] {
  const out: Hl7Decoded[] = []
  for (const seg of parseHl7(raw)) {
    seg.fields.forEach((value, i) => {
      const key = `${seg.id}-${i + 1}`
      if (MEANINGS[key] && value) out.push({ field: key, meaning: MEANINGS[key], value })
    })
  }
  return out
}

/**
 * Whether a displayed decoded table agrees with the raw text: every row names a field whose
 * raw value equals the displayed value (the "deliberately wrong field" of a flawed sample is a
 * choice the author states, so a caller can list it as `allowMismatch`).
 */
export function decodedMismatches(
  raw: string,
  shown: readonly Hl7Decoded[],
  allowMismatch: readonly string[] = [],
): string[] {
  const segments = parseHl7(raw)
  const problems: string[] = []
  for (const row of shown) {
    const m = /^([A-Z0-9]{3})-(\d+)$/.exec(row.field)
    if (!m) {
      problems.push(`${row.field} is not a field reference`)
      continue
    }
    const actual = hl7Field(segments, m[1]!, Number(m[2]))
    if (actual !== row.value && !allowMismatch.includes(row.field))
      problems.push(`${row.field} shows "${row.value}" but the message has "${actual}"`)
  }
  return problems
}
