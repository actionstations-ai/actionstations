// Samples saved (spec 0466 FR-10): the share of the samples at risk that were moved to backup
// before the designer's limit was reached, counting the irreplaceable ones first. A
// `lab_move_samples_to_backup` decision names a group (irreplaceable, no backup, all,
// replaceable) and, when the lab could move only some, a count; groups are taken in the order of
// the register. The limit is an exercise parameter, never a biology claim.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { ms, ratio, ratioText, sameArea, type Metric, type MetricOutput } from './types'

export const LabSamplesSavedConfig = z.object({
  moveKind: z.string().min(1).default('lab_move_samples_to_backup'),
  /** Minutes the move needs before the limit; a move that starts later than limit minus this is late. */
  clearanceMin: z.number().min(0).default(0),
})
export type LabSamplesSavedConfig = z.infer<typeof LabSamplesSavedConfig>

export interface LabSamplesInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

interface Sample {
  id: string
  value: string
  backup: string
  area: string | undefined
  limitAt: number
  movedAt: number | null
}

const GROUPS: Record<string, (s: Sample) => boolean> = {
  irreplaceable_samples: (s) => s.value === 'irreplaceable',
  samples_with_no_backup: (s) => s.backup === 'none',
  replaceable_samples: (s) => s.value === 'replaceable',
  all_samples: () => true,
}

export function computeLabSamplesSaved(
  inputs: LabSamplesInputs,
  config: LabSamplesSavedConfig,
): MetricOutput {
  const samples: Sample[] = inputs.events
    .filter((e) => e.kind === 'sample_at_risk')
    .map((e) => ({
      id: e.id,
      value: String(e.attrs.value ?? ''),
      backup: String(e.attrs.backup ?? ''),
      area: e.area,
      limitAt: ms(e.time),
      movedAt: null,
    }))
  const moves = inputs.decisions
    .filter((d) => d.kind === config.moveKind)
    .sort((a, b) => ms(a.time) - ms(b.time))
  for (const d of moves) {
    const inGroup = GROUPS[String(d.fields.group ?? 'all_samples')] ?? GROUPS.all_samples!
    const count = Number(d.fields.count)
    let left = Number.isFinite(count) && count > 0 ? count : Infinity
    for (const s of samples) {
      if (left === 0) break
      if (s.movedAt !== null || !inGroup(s) || !sameArea(d.area, s.area)) continue
      s.movedAt = ms(d.time)
      left -= 1
    }
  }
  const saved = (s: Sample) =>
    s.movedAt !== null && s.movedAt <= s.limitAt - config.clearanceMin * 60_000
  const irreplaceable = samples.filter((s) => s.value === 'irreplaceable')
  const savedIrr = irreplaceable.filter(saved).length
  const savedAll = samples.filter(saved).length
  const late = samples.filter((s) => s.movedAt !== null && !saved(s)).length
  const never = samples.filter((s) => s.movedAt === null).length
  return {
    metricId: 'lab_samples_saved',
    title: 'Samples saved',
    config,
    inputs: [
      { label: 'Samples at risk', value: String(samples.length) },
      { label: 'Irreplaceable samples', value: String(irreplaceable.length) },
      { label: 'Move decisions', value: String(moves.length) },
    ],
    summary: [
      {
        label: 'Irreplaceable samples moved in time',
        value: `${savedIrr} of ${irreplaceable.length}`,
      },
      {
        label: 'Share of irreplaceable samples saved',
        value: ratioText(ratio(savedIrr, irreplaceable.length)),
      },
      { label: 'Share of all samples saved', value: ratioText(ratio(savedAll, samples.length)) },
      { label: 'Moved after the limit', value: String(late) },
      { label: 'Never moved', value: String(never) },
    ],
    tables: [
      {
        title: 'Samples',
        columns: ['Sample', 'Value', 'Backup', 'Moved', 'Outcome'],
        rows: samples.map((s) => [
          s.id,
          s.value,
          s.backup,
          s.movedAt === null ? 'n/a' : new Date(s.movedAt).toISOString(),
          s.movedAt === null ? 'not moved' : saved(s) ? 'moved in time' : 'moved late',
        ]),
      },
    ],
    caveats: [
      "The limit that ends the window is the exercise designer's parameter, not a statement about any sample's real viability.",
      ...(samples.length === 0 ? ['No samples at risk were found in the case data.'] : []),
    ],
    data: {
      atRisk: samples.length,
      irreplaceable: irreplaceable.length,
      savedIrreplaceable: savedIrr,
      savedAll,
      late,
      never,
      shareIrreplaceable: ratio(savedIrr, irreplaceable.length),
      shareAll: ratio(savedAll, samples.length),
    },
  }
}

export const labSamplesSaved: Metric<LabSamplesSavedConfig, LabSamplesInputs> = {
  id: 'lab_samples_saved',
  title: 'Samples saved',
  configSchema: LabSamplesSavedConfig,
  compute: computeLabSamplesSaved,
}
