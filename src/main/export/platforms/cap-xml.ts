// CAP 1.2 XML export (spec 0432 FR-12, FR-14): one file per cap_alert inject, for agencies whose
// alerting software can import CAP into a practice or training environment. Nothing here
// sends anything. A file is refused unless it is marked as an exercise.
import { AppError } from '../../lib/errors'
import { buildCapXml, CAP_NAMESPACE } from '../../render/derived/cap'
import { validateFields } from '../../render/templates'
import type { ExportModel } from '../model'
import { platformRows } from './rows'

export interface CapFile {
  /** File name inside cap/: <row id>.xml */
  name: string
  xml: string
}

/** Throws unless the XML is a CAP 1.2 exercise or test message with the exercise marking. */
export function assertExerciseCap(xml: string): void {
  const status = /<status>([^<]*)<\/status>/.exec(xml)?.[1]
  const headline = /<headline>([^<]*)<\/headline>/.exec(xml)?.[1] ?? ''
  const ok =
    xml.includes(`xmlns="${CAP_NAMESPACE}"`) &&
    (status === 'Exercise' || status === 'Test') &&
    /<note>EXERCISE - NOT A REAL ALERT/.test(xml) &&
    /^(EXERCISE|EJERCICIO)/.test(headline)
  if (!ok) throw new AppError('INTERNAL', 'Refusing to write a CAP file that is not an exercise')
}

const safeName = (rowId: string): string => rowId.replace(/[^A-Za-z0-9._-]+/g, '_') || 'row'

/** The CAP files for a scenario, plus a warning for each alert whose fields are invalid. */
export function capFiles(model: ExportModel): { files: CapFile[]; warnings: string[] } {
  const files: CapFile[] = []
  const warnings: string[] = []
  for (const r of platformRows(model)) {
    if (r.type !== 'cap_alert' || !r.inject) continue
    const issues = validateFields('cap_alert', r.inject.fields, model.root)
    if (issues.length) {
      warnings.push(
        `${r.row.id}: CAP file not written, fields invalid (${issues[0]!.path} ${issues[0]!.message})`,
      )
      continue
    }
    const xml = buildCapXml(r.inject.fields)
    assertExerciseCap(xml)
    files.push({ name: `${safeName(r.row.id)}.xml`, xml })
  }
  return { files, warnings }
}
