// Data recovery (spec 0466 FR-10): of the research systems the incident affected, how many were
// restored from backup and how many hours of work each restore lost. The backup series gives
// hours since the last good backup for each system; a `lab_restore_data_from_backup` decision
// names the system and its time reads the series, so a restore after a failed backup shows the
// longer gap. Systems never restored are listed.
import { z } from 'zod'
import type { MetricDecision, ModeledSeries } from '@shared/schemas/metrics'
import { mean, ms, NOT_AVAILABLE, ratio, ratioText, type Metric, type MetricOutput } from './types'

export const LabDataRecoveryConfig = z.object({
  restoreKind: z.string().min(1).default('lab_restore_data_from_backup'),
  /** Hours of lost work a restore may cost and still count as a good recovery. */
  acceptableLossHours: z.number().min(0).default(24),
})
export type LabDataRecoveryConfig = z.infer<typeof LabDataRecoveryConfig>

export interface LabRecoveryInputs {
  series: ModeledSeries[]
  decisions: MetricDecision[]
}

const norm = (s: string): string => s.trim().toLowerCase()

function valueAt(series: ModeledSeries, at: number): number | null {
  const pts = [...series.points].sort((a, b) => ms(a.time) - ms(b.time))
  let last: number | null = null
  for (const p of pts) {
    if (ms(p.time) > at) break
    last = p.value
  }
  return last
}

export function computeLabDataRecovery(
  inputs: LabRecoveryInputs,
  config: LabDataRecoveryConfig,
): MetricOutput {
  const restores = inputs.decisions
    .filter((d) => d.kind === config.restoreKind)
    .sort((a, b) => ms(a.time) - ms(b.time))
  const rows = inputs.series.map((s) => {
    const restore = restores.find(
      (d) => norm(String(d.fields.system ?? d.area ?? '')) === norm(s.zone),
    )
    const lost = restore ? valueAt(s, ms(restore.time)) : null
    return { zone: s.zone, restore, lost }
  })
  const restored = rows.filter((r) => r.restore)
  const good = restored.filter((r) => r.lost !== null && r.lost <= config.acceptableLossHours)
  const losses = restored.flatMap((r) => (r.lost === null ? [] : [r.lost]))
  const meanLoss = mean(losses)
  const meanHours = meanLoss === null ? null : Math.round(meanLoss * 10) / 10
  return {
    metricId: 'lab_data_recovery',
    title: 'Data recovery',
    config,
    inputs: [
      { label: 'Systems affected', value: String(rows.length) },
      { label: 'Restore decisions', value: String(restores.length) },
    ],
    summary: [
      { label: 'Systems restored', value: `${restored.length} of ${rows.length}` },
      { label: 'Share restored', value: ratioText(ratio(restored.length, rows.length)) },
      {
        label: `Restored with at most ${config.acceptableLossHours} h of work lost`,
        value: `${good.length} of ${restored.length}`,
      },
      {
        label: 'Mean hours of work lost',
        value: meanHours === null ? NOT_AVAILABLE : `${meanHours} h`,
      },
      { label: 'Not restored', value: String(rows.length - restored.length) },
    ],
    tables: [
      {
        title: 'Systems',
        columns: ['System', 'Restored', 'Hours of work lost', 'Outcome'],
        rows: rows.map((r) => [
          r.zone,
          r.restore ? r.restore.time : NOT_AVAILABLE,
          r.lost === null ? NOT_AVAILABLE : String(r.lost),
          !r.restore
            ? 'not restored'
            : r.lost !== null && r.lost <= config.acceptableLossHours
              ? 'within the limit'
              : 'work lost beyond the limit',
        ]),
      },
    ],
    caveats: [
      "The acceptable loss is the exercise designer's number. Hours lost are read from the simulated backup series at the time of the restore.",
      ...(rows.length === 0 ? ['No backup series was found in the case data.'] : []),
    ],
    data: {
      systems: rows.length,
      restored: restored.length,
      withinLimit: good.length,
      meanHoursLost: meanLoss,
      shareRestored: ratio(restored.length, rows.length),
    },
  }
}

export const labDataRecovery: Metric<LabDataRecoveryConfig, LabRecoveryInputs> = {
  id: 'lab_data_recovery',
  title: 'Data recovery',
  configSchema: LabDataRecoveryConfig,
  compute: computeLabDataRecovery,
}
