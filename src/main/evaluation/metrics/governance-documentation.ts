// Decision documentation (spec 0459 FR-9): each governance decision should carry its owner, the
// facts known at the time, its basis and a time. The time is the moment it was recorded; the
// other three are fields of the toolkit's decision forms. The metric lists every gap and gives
// the share of decisions that are complete; it does not judge whether a basis is good.
import { z } from 'zod'
import type { MetricDecision } from '@shared/schemas/metrics'
import { GOV_FORM_IDS, textOf } from './governance-inputs'
import { ratio, ratioText, stringList, type Metric, type MetricOutput } from './types'

export const GovDecisionDocumentationConfig = z.object({
  /** Decision kinds that count; the governance forms when empty. */
  decisionKinds: stringList.default([]),
  /** Fields a documented decision fills in. */
  requiredFields: stringList.default(['decided_by', 'information_known', 'basis']),
})
export type GovDecisionDocumentationConfig = z.infer<typeof GovDecisionDocumentationConfig>

export interface GovDecisionDocumentationInputs {
  decisions: MetricDecision[]
}

const FIELD_LABEL: Record<string, string> = {
  decided_by: 'Owner',
  information_known: 'Facts known then',
  basis: 'Basis',
}

export function computeGovDecisionDocumentation(
  inputs: GovDecisionDocumentationInputs,
  config: GovDecisionDocumentationConfig,
): MetricOutput {
  const kinds = config.decisionKinds.length ? config.decisionKinds : GOV_FORM_IDS
  const decisions = inputs.decisions.filter((d) => kinds.includes(d.kind))
  const rows = decisions.map((d) => ({
    d,
    missing: config.requiredFields.filter((f) => textOf(d, f) === ''),
  }))
  const complete = rows.filter((r) => r.missing.length === 0).length
  return {
    metricId: 'gov_decision_documentation',
    title: 'Decision documentation',
    config,
    inputs: [
      { label: 'Decisions counted', value: String(decisions.length) },
      { label: 'Fields required', value: config.requiredFields.join(', ') },
    ],
    summary: [
      { label: 'Decisions fully documented', value: `${complete} of ${decisions.length}` },
      { label: 'Share fully documented', value: ratioText(ratio(complete, decisions.length)) },
      { label: 'Decisions with a gap', value: String(decisions.length - complete) },
    ],
    tables: [
      {
        title: 'Decisions',
        columns: ['Time', 'Decision', 'Missing'],
        rows: rows.map((r) => [
          r.d.time,
          r.d.kind,
          r.missing.map((f) => FIELD_LABEL[f] ?? f).join(', ') || 'Nothing missing',
        ]),
      },
    ],
    caveats: [
      'Documented means the fields are filled in, not that the basis is sound.',
      ...(decisions.length === 0 ? ['No governance decisions were recorded.'] : []),
    ],
    data: { decisions: decisions.length, complete },
  }
}

export const govDecisionDocumentation: Metric<
  GovDecisionDocumentationConfig,
  GovDecisionDocumentationInputs
> = {
  id: 'gov_decision_documentation',
  title: 'Decision documentation',
  configSchema: GovDecisionDocumentationConfig,
  compute: computeGovDecisionDocumentation,
}
