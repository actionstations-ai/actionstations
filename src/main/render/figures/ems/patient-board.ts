// patient_tracking_board: one row per tagged patient with priority (word and pattern), where the
// patient is, when the patient left and for which hospital (spec 0456 FR-4). Sized to its rows.
import { z } from 'zod'
import { INK, MUTED } from '../theme'
import { frame, hashId, heading, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import { priorityDefs, prioritySwatch, priorityFromLabel, PRIORITIES } from './priorities'

const PRIORITY_WORDS = PRIORITIES.map((p) => p.label) as [string, ...string[]]

export const PatientBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  patients: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        priority: z.enum(PRIORITY_WORDS),
        location: z.string().max(80).default(''),
        transportTime: z.string().max(20).default(''),
        destination: z.string().max(80).default(''),
      }),
    )
    .min(1)
    .max(60),
})
export type PatientBoardData = z.infer<typeof PatientBoardData>

const ROW = 28
const HEAD = 30

function rowsSvg(d: PatientBoardData, o: { width: number }, key: string, top: number): string {
  const cols = [16, 100, 230, o.width * 0.5, o.width * 0.63]
  let body = `<rect x="0" y="${top}" width="${o.width}" height="${HEAD}" fill="#14100c"/>`
  ;['Patient', 'Priority', 'Location', 'Left scene', 'Destination'].forEach((h, i) => {
    body += text(cols[i]!, top + 20, h, { size: 12, weight: 700, fill: '#ffffff' })
  })
  d.patients.forEach((p, i) => {
    const y = top + HEAD + i * ROW
    const style = priorityFromLabel(p.priority)!
    body += `<line x1="0" x2="${o.width}" y1="${y + ROW}" y2="${y + ROW}" stroke="#d8c79e"/>`
    body += text(cols[0]!, y + 19, p.id, { size: 13, weight: 600 })
    body += prioritySwatch(key, style, cols[1]!, y + 5, 18, 18)
    body += text(cols[1]! + 26, y + 19, p.priority, { size: 13, weight: 700 })
    body += text(cols[2]!, y + 19, p.location, { size: 13, fill: INK })
    body += text(cols[3]!, y + 19, p.transportTime || 'Not yet', {
      size: 13,
      fill: p.transportTime ? INK : MUTED,
    })
    body += text(cols[4]!, y + 19, p.destination || 'Not assigned', {
      size: 13,
      fill: p.destination ? INK : MUTED,
    })
  })
  return body
}

function summaryOf(d: PatientBoardData): string {
  const left = d.patients.filter((p) => p.transportTime).length
  const counts = PRIORITIES.map((s) => ({
    s,
    c: d.patients.filter((p) => p.priority === s.label).length,
  }))
    .filter((x) => x.c)
    .map((x) => `${x.c} ${x.s.label}`)
  return (
    `${d.title ?? 'Patient tracking board'}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.patients.length} patients (${counts.join(', ')}); ` +
    `${left} have left the scene, ${d.patients.length - left} are waiting. ` +
    d.patients
      .map(
        (p) =>
          `${p.id} ${p.priority}${p.location ? ` at ${p.location}` : ''}` +
          (p.transportTime
            ? `, left ${p.transportTime} for ${p.destination || 'an unassigned hospital'}`
            : ''),
      )
      .join('; ') +
    '.'
  )
}

function render(d: PatientBoardData, o: { width: number; height: number }): FigureResult {
  const key = hashId(JSON.stringify(d))
  const summary = summaryOf(d)
  const top = d.title ? 36 : 8
  const height = top + HEAD + d.patients.length * ROW + 8
  let body = heading(d.title, 16)
  if (d.asOf)
    body += text(o.width - 16, 20, `As of ${d.asOf}`, { size: 12, anchor: 'end', fill: MUTED })
  body += rowsSvg(d, o, key, top)
  return {
    svg: frame({
      width: o.width,
      height: Math.max(height, 60),
      title: d.title ?? 'Patient tracking board',
      summary,
      defs: priorityDefs(key),
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Patient', 'Priority', 'Location', 'Left scene', 'Destination'],
      rows: d.patients.map((p) => [p.id, p.priority, p.location, p.transportTime, p.destination]),
    },
  }
}

export const patientBoardKind: FigureKind<PatientBoardData> = {
  kind: 'patient_tracking_board',
  schema: PatientBoardData,
  render,
}
