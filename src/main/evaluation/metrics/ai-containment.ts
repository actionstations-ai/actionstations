// Containment of an AI system incident (spec 0467 FR-9): time from detection (the declaration) to
// the kill switch or rollback, and whether evidence (logs, model version, prompts, data) was
// preserved before the system was changed. Evidence preserved first means a preserve-evidence
// decision at or before the pause, or the pause form's own "evidence preserved first" answer.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  AI_DECISION_KINDS as K,
  AI_EVENT_KINDS,
  choseLabel,
  eventsOf,
  firstOf,
  minutesFrom,
  ofKind,
} from './ai-incident-inputs'
import { minutesText, ms, type Metric, type MetricOutput } from './types'

export const AiContainmentConfig = z.object({
  onsetKind: z.string().default(AI_EVENT_KINDS.harmOnset),
})
export type AiContainmentConfig = z.infer<typeof AiContainmentConfig>

export interface AiContainmentInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

/** A pause decision that changes the system: anything but "keep running". */
const changes = (d: MetricDecision): boolean => !choseLabel(d, 'action', 'Keep running')

export function computeAiContainment(
  inputs: AiContainmentInputs,
  config: AiContainmentConfig,
): MetricOutput {
  const onset = eventsOf(inputs.events, config.onsetKind)[0]
  const declared = firstOf(ofKind(inputs.decisions, K.declare))
  const pause = firstOf(ofKind(inputs.decisions, K.pause).filter(changes))
  const evidence = firstOf(ofKind(inputs.decisions, K.evidence))
  const evidenceFirst = pause
    ? choseLabel(pause, 'evidence_first', 'Yes') ||
      (!!evidence && ms(evidence.time) <= ms(pause.time))
    : null
  const toContain = declared && pause ? minutesFrom(declared.time, pause.time) : null
  const onsetToDeclare = onset && declared ? minutesFrom(onset.time, declared.time) : null
  return {
    metricId: 'ai_containment',
    title: 'Containment of an AI system incident',
    config,
    inputs: [
      { label: 'Harm onset in the scenario', value: onset ? onset.time : 'none' },
      { label: 'Declaration', value: declared?.time ?? 'none' },
      { label: 'Kill switch or rollback', value: pause?.time ?? 'none' },
      { label: 'Evidence preserved', value: evidence?.time ?? 'none recorded' },
    ],
    summary: [
      { label: 'Detection to kill switch or rollback', value: minutesText(toContain) },
      { label: 'Onset to declaration', value: minutesText(onsetToDeclare) },
      {
        label: 'Evidence preserved before the change',
        value: evidenceFirst === null ? 'n/a' : evidenceFirst ? 'yes' : 'no',
      },
    ],
    tables: [],
    caveats: [
      'Pausing for everyone and restricting to a safe mode both count as containment; keeping the system running does not.',
      'Evidence first is judged from the recorded decisions, not from the systems themselves.',
      ...(!declared ? ['No incident was declared, so detection time is not available.'] : []),
      ...(!pause ? ['The system was never paused, restricted or rolled back.'] : []),
    ],
    data: { toContainMin: toContain, onsetToDeclareMin: onsetToDeclare, evidenceFirst },
  }
}

export const aiContainment: Metric<AiContainmentConfig, AiContainmentInputs> = {
  id: 'ai_containment',
  title: 'Containment of an AI system incident',
  configSchema: AiContainmentConfig,
  compute: computeAiContainment,
}
