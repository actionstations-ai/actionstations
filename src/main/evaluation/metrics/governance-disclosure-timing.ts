// Disclosure timing (spec 0459 FR-9): from discovery to the materiality determination, from the
// determination to the filing against the four-business-day clock, and from discovery to the
// board notice. The determination, the filing and the board notice are decisions the players
// record; the clock is computed on the US federal business calendar. The metric states the
// times and does not judge them: the designer sets any target, and it is exercise aid, not
// legal advice.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { addBusinessDays } from '@shared/compliance/calendars'
import {
  decisionsOfKind,
  eventsOfKind,
  GOV_EVENT,
  GOV_FORM,
  hoursBetween,
  hoursText,
} from './governance-inputs'
import { NOT_AVAILABLE, ms, type Metric, type MetricOutput } from './types'

export const GovDisclosureTimingConfig = z.object({
  /** Business days after a material determination (SEC Form 8-K Item 1.05: four). */
  filingBusinessDays: z.number().int().min(1).max(30).default(4),
  determinationFormId: z.string().default(GOV_FORM.determination),
  disclosureFormId: z.string().default(GOV_FORM.disclosure),
  boardFormId: z.string().default(GOV_FORM.board),
  /** The designer's own target for discovery to determination, in hours. None by default. */
  determinationTargetHours: z.number().min(0).max(720).optional(),
})
export type GovDisclosureTimingConfig = z.infer<typeof GovDisclosureTimingConfig>

export interface GovDisclosureTimingInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const isDetermination = (d: MetricDecision): boolean =>
  d.fields.determination === 'material' || d.fields.determination === 'not_material'

const CAVEATS = [
  'Exercise aid, not legal advice. Check the current rule and your counsel.',
  'The four business days run from the determination, on the US federal business calendar. The investigation does not have to finish first, and a determination cannot be put off by delaying a meeting.',
]

export function computeGovDisclosureTiming(
  inputs: GovDisclosureTimingInputs,
  config: GovDisclosureTimingConfig,
): MetricOutput {
  const discovered = eventsOfKind(inputs.events, GOV_EVENT.discovered)[0]
  const determinations = decisionsOfKind(inputs.decisions, config.determinationFormId)
  const pending = determinations.filter((d) => d.fields.determination === 'not_yet_determined')
  const final = determinations.find(isDetermination)
  const material = final?.fields.determination === 'material'
  const filing = decisionsOfKind(inputs.decisions, config.disclosureFormId).find(
    (d) => d.fields.item === 'item_1_05' || d.fields.item === 'item_8_01',
  )
  const board = decisionsOfKind(inputs.decisions, config.boardFormId)[0]

  const toDetermination = discovered && final ? hoursBetween(discovered.time, final.time) : null
  const toBoard = discovered && board ? hoursBetween(discovered.time, board.time) : null
  const deadline =
    final && material
      ? addBusinessDays(new Date(final.time), config.filingBusinessDays, 'us_federal')
      : null
  const toFiling = final && filing ? hoursBetween(final.time, filing.time) : null
  const filedItem = filing?.fields.item === 'item_1_05' ? 'Item 1.05' : filing ? 'Item 8.01' : null
  let filingStatus = NOT_AVAILABLE
  if (deadline && filing && filedItem === 'Item 1.05')
    filingStatus = ms(filing.time) <= deadline.getTime() ? 'On time' : 'Late'
  else if (deadline && !filing) filingStatus = 'No filing recorded'
  else if (filedItem === 'Item 8.01') filingStatus = 'Item 8.01 filed; not an Item 1.05 report'
  const target = config.determinationTargetHours
  const targetText =
    target === undefined
      ? 'No target set'
      : toDetermination === null
        ? NOT_AVAILABLE
        : toDetermination <= target
          ? `Within ${target} h`
          : `Over ${target} h`

  return {
    metricId: 'gov_disclosure_timing',
    title: 'Disclosure timing',
    config,
    inputs: [
      { label: 'Incident discovered', value: discovered?.time ?? NOT_AVAILABLE },
      { label: 'Materiality determination recorded', value: final?.time ?? NOT_AVAILABLE },
      { label: '"Not yet determined" decisions', value: String(pending.length) },
      { label: 'Filing recorded', value: filing?.time ?? NOT_AVAILABLE },
      { label: 'Board notice recorded', value: board?.time ?? NOT_AVAILABLE },
    ],
    summary: [
      { label: 'Discovery to determination', value: hoursText(toDetermination) },
      { label: 'Determination', value: final ? String(final.fields.determination) : NOT_AVAILABLE },
      { label: 'Determination against the designer target', value: targetText },
      { label: 'Determination to filing', value: hoursText(toFiling) },
      { label: 'Filing deadline', value: deadline ? deadline.toISOString() : NOT_AVAILABLE },
      { label: 'Filing', value: filingStatus },
      { label: 'Discovery to board notice', value: hoursText(toBoard) },
    ],
    tables: [
      {
        title: 'Determinations recorded',
        columns: ['Time', 'Determination', 'Hours after discovery'],
        rows: determinations.map((d) => [
          d.time,
          String(d.fields.determination ?? ''),
          discovered ? hoursText(hoursBetween(discovered.time, d.time)) : NOT_AVAILABLE,
        ]),
      },
    ],
    caveats: [
      ...CAVEATS,
      ...(!discovered ? ['No discovery event was found in the case data.'] : []),
      ...(!final ? ['No materiality determination (material or not material) was recorded.'] : []),
      ...(pending.length && !final
        ? ['The only determinations recorded were "not yet determined".']
        : []),
    ],
    data: {
      discoveryToDeterminationHours: toDetermination,
      determinationToFilingHours: toFiling,
      discoveryToBoardHours: toBoard,
      deadline: deadline ? deadline.toISOString() : null,
      filingStatus,
    },
  }
}

export const govDisclosureTiming: Metric<GovDisclosureTimingConfig, GovDisclosureTimingInputs> = {
  id: 'gov_disclosure_timing',
  title: 'Disclosure timing',
  configSchema: GovDisclosureTimingConfig,
  compute: computeGovDisclosureTiming,
}
