// Inventory discrepancy generator (spec 0466 FR-8): an expected count against an observed count
// for a list of registered items, with the cause of each discrepancy. Most reported losses turn
// out to be records problems (the program's 2024 report: 8 of 9 loss reports were record-keeping
// issues), so the default draws a records cause in eight of nine discrepancies; the designer can
// force a cause. Items are generic lots; nothing here names an agent. Seeded and fictional.
import { z } from 'zod'
import { makeRng } from '../../epidemiology/simulate/rng'

export const RECORDS_CAUSES = [
  'transfer_logged_in_one_system_only',
  'destruction_not_signed',
  'mislabeled_box',
  'miscount',
  'data_entry_error',
] as const
export const CAUSES = [...RECORDS_CAUSES, 'unaccounted'] as const
export type DiscrepancyCause = (typeof CAUSES)[number]

export const CAUSE_TEXT: Record<DiscrepancyCause, string> = {
  transfer_logged_in_one_system_only: 'A transfer was recorded in one system and not the other.',
  destruction_not_signed: 'A destruction was carried out and never signed off in the record.',
  mislabeled_box: 'A box was labeled with the wrong lot and sits in another freezer.',
  miscount: 'The count was wrong; a recount matches the record.',
  data_entry_error: 'The inventory record was keyed with the wrong number.',
  unaccounted: 'No records explanation has been found yet.',
}

export const InventoryParams = z.object({
  seed: z.number().int().default(1),
  entity: z
    .string()
    .min(1)
    .max(120)
    .default('Marston State University (fictional registered entity)'),
  items: z.number().int().min(2).max(40).default(12),
  freezers: z.array(z.string().min(1).max(40)).min(1).max(8).default(['Freezer 3', 'Freezer 4']),
  discrepancies: z.number().int().min(0).max(10).default(1),
  /** Force the cause of every discrepancy; otherwise records causes, with one in nine unaccounted. */
  cause: z.enum(CAUSES).optional(),
  countedAt: z.iso.datetime().default('2026-10-21T09:15:00Z'),
})
export type InventoryParams = z.infer<typeof InventoryParams>

export interface InventoryRow {
  item: string
  location: string
  expected: number
  observed: number
  note: string
  /** Facilitator-only: why the counts differ; empty when they match. */
  cause: DiscrepancyCause | ''
}

export interface InventoryRun {
  countedAt: string
  rows: InventoryRow[]
}

export function runInventory(raw: z.input<typeof InventoryParams>): InventoryRun {
  const p = InventoryParams.parse(raw)
  const rng = makeRng(p.seed)
  const rows: InventoryRow[] = Array.from({ length: p.items }, (_, i) => {
    const expected = 1 + rng.int(4)
    return {
      item: `Registered item INV-${String(400 + i * 3 + rng.int(3)).padStart(4, '0')}`,
      location: p.freezers[i % p.freezers.length]!,
      expected,
      observed: expected,
      note: '',
      cause: '' as const,
    }
  })
  const picks = new Set<number>()
  while (picks.size < Math.min(p.discrepancies, rows.length)) picks.add(rng.int(rows.length))
  for (const i of picks) {
    const row = rows[i]!
    const cause: DiscrepancyCause =
      p.cause ?? (rng.chance(1 / 9) ? 'unaccounted' : rng.pick(RECORDS_CAUSES))
    const shortBy = cause === 'data_entry_error' && rng.chance(0.5) ? -1 : 1
    row.observed = Math.max(0, row.expected - shortBy)
    row.cause = cause
    row.note =
      row.observed < row.expected ? 'One fewer than the record' : 'One more than the record'
  }
  return { countedAt: p.countedAt, rows }
}
