// MSEL rows joined with their injects and text renditions, in MSEL order: the input of every
// platform export (Conducttr CSV, EOC package, CAP XML).
import type { Inject, MselRow } from '@shared/schemas'
import { loadTemplate } from '../../render/templates'
import type { ExportModel } from '../model'
import { injectText } from '../text-rendition'
import { groupRows, toText } from '../views'

export interface PlatformRow {
  row: MselRow
  phase: string
  inject: Inject | undefined
  /** Inject type, or the row's suggested format when it has no inject yet. */
  type: string
  /** Recipient role names; empty when the row goes to everyone. */
  recipients: string[]
  /** The inject's text rendition, or the row's event text when there is no inject. */
  text: string
}

function schemaFor(model: ExportModel, type: string): Record<string, unknown> | undefined {
  try {
    return loadTemplate(type, model.root).schema
  } catch {
    return undefined // a type without a template: the generic rendition lists fields in order
  }
}

/** Who the row goes to: role names, or the free-text label; [] means everyone. */
export function recipientsOf(model: ExportModel, row: MselRow): string[] {
  const label = toText(row, model.scenario).trim()
  if (!label || /^all$/i.test(label)) return []
  if (row.toLabel) return [row.toLabel.trim()]
  return row.toRoleIds.map((id) => model.scenario.roles.find((r) => r.id === id)?.name ?? id)
}

export function platformRows(model: ExportModel): PlatformRow[] {
  const out: PlatformRow[] = []
  groupRows(model.scenario).forEach(({ phase, rows }) => {
    for (const row of rows) {
      const inject = model.injects.find((i) => i.mselRowId === row.id)
      const type = inject?.type ?? row.format ?? ''
      out.push({
        row,
        phase: phase?.title ?? 'Additional events',
        inject,
        type,
        recipients: recipientsOf(model, row),
        text: inject ? injectText(inject, schemaFor(model, inject.type)) : row.event,
      })
    }
  })
  return out
}

/** Exercise time H:MM since STARTEX as HH:mm:ss. */
export function clockTime(time: string): string {
  const [h = '0', m = '00'] = time.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`
}
