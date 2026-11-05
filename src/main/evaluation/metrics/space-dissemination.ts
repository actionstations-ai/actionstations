// Space weather dissemination (spec 0468 FR-11): each entity named in the exercise's operating
// plan against the team's `space_disseminate` decisions, with the time from the first SWPC
// message to each entity being told. The log of these decisions is the exercise's evidence that
// the information reached the entities in the plan; it does not replace an entity's own
// compliance records. The entity list and the target are the designer's.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  mean,
  minutesText,
  ms,
  NOT_AVAILABLE,
  ratio,
  ratioText,
  stringList,
  type Metric,
  type MetricOutput,
} from './types'

export const SpaceDisseminationConfig = z.object({
  /** Entities named in the operating plan; a comma-separated list is accepted. */
  entities: stringList.default([]),
  /** Minutes after the first SWPC message by which each entity should be told; 0 sets no target. */
  targetMinutes: z.number().min(0).default(0),
})
export type SpaceDisseminationConfig = z.infer<typeof SpaceDisseminationConfig>

export interface SpaceDisseminationInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const norm = (s: string): string => s.trim().toLowerCase()

/** The entities a decision names, from its `entities` text (comma or semicolon separated). */
function entitiesOf(d: MetricDecision): string[] {
  const raw = d.fields.entities ?? d.fields.entity
  return String(raw ?? '')
    .split(/[,;\n]/)
    .map(norm)
    .filter(Boolean)
}

export function computeSpaceDissemination(
  inputs: SpaceDisseminationInputs,
  config: SpaceDisseminationConfig,
): MetricOutput {
  const told = inputs.decisions
    .filter((d) => d.kind === 'space_disseminate')
    .sort((a, b) => ms(a.time) - ms(b.time))
  const firstMessage = inputs.events
    .filter((e) => e.kind === 'swpc_message')
    .map((e) => ms(e.time))
    .sort((a, b) => a - b)[0]
  const rows = config.entities.map((entity) => {
    const hit = told.find((d) => entitiesOf(d).includes(norm(entity)))
    const minutes =
      hit && firstMessage !== undefined ? (ms(hit.time) - firstMessage) / 60_000 : null
    const onTime =
      hit && config.targetMinutes > 0 && minutes !== null ? minutes <= config.targetMinutes : null
    return { entity, time: hit?.time ?? null, minutes, onTime }
  })
  const reached = rows.filter((r) => r.time !== null)
  const minutesList = rows.flatMap((r) => (r.minutes === null ? [] : [r.minutes]))
  const onTimeCount = rows.filter((r) => r.onTime === true).length
  return {
    metricId: 'space_dissemination',
    title: 'Space weather dissemination',
    config,
    inputs: [
      { label: 'Entities in the plan', value: String(rows.length) },
      {
        label: 'First SWPC message',
        value: firstMessage === undefined ? NOT_AVAILABLE : new Date(firstMessage).toISOString(),
      },
      {
        label: 'Target',
        value:
          config.targetMinutes > 0
            ? `told within ${config.targetMinutes} min of the first message (set by the designer)`
            : 'none set',
      },
    ],
    summary: [
      { label: 'Entities told', value: `${reached.length} of ${rows.length}` },
      { label: 'Share told', value: ratioText(ratio(reached.length, rows.length)) },
      { label: 'Entities never told', value: String(rows.length - reached.length) },
      ...(config.targetMinutes > 0
        ? [{ label: 'Told within target', value: `${onTimeCount} of ${rows.length}` }]
        : []),
      { label: 'Mean minutes from first message', value: minutesText(mean(minutesList)) },
    ],
    tables: [
      {
        title: 'Entities',
        columns: ['Entity', 'Told at', 'Minutes after first message', 'Within target'],
        rows: rows.map((r) => [
          r.entity,
          r.time ?? 'Not told',
          minutesText(r.minutes),
          r.onTime === null ? NOT_AVAILABLE : r.onTime ? 'Yes' : 'No',
        ]),
      },
    ],
    caveats: [
      'The log of dissemination decisions is exercise evidence. It does not replace an entity’s own records.',
      ...(rows.length === 0 ? ['No entities were configured, so nothing was scored.'] : []),
    ],
    data: {
      entities: rows.length,
      told: reached.length,
      shareTold: ratio(reached.length, rows.length),
      meanMinutes: mean(minutesList),
    },
  }
}

export const spaceDissemination: Metric<SpaceDisseminationConfig, SpaceDisseminationInputs> = {
  id: 'space_dissemination',
  title: 'Space weather dissemination',
  configSchema: SpaceDisseminationConfig,
  compute: computeSpaceDissemination,
}
