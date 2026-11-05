// The clinical care toolkit's app code, registered once at startup from src/main/index.ts (spec
// 0452): its metrics, the input provider that feeds the judgment profile with case study runs and
// the simulated patient generator. Figure kinds register with the figures module and field lint
// rules with the lint registry (lint-rules.ts); decision forms need no code, since the toolkit's
// forms reach live play through the toolkit decision form provider. Safe to call twice.
import { generatorIds } from '../../case-data/generators'
import { listRuns } from '../../casestudy/store'
import { registerMetric } from '../../evaluation/metrics/registry'
import {
  disclosureTiming,
  downtimeWorkflowTime,
  evacuationOrder,
  handoffQuality,
  infectionControlDecisions,
  staffingRatioExceedances,
  timeToEscalation,
  triageAccuracy,
  type ClinicalInputs,
} from '../../evaluation/metrics/clinical-care'
import {
  CASE_STUDY_RUNS_DATASET,
  clinicalJudgmentProfile,
  type JudgmentInputs,
  type JudgmentRun,
} from '../../evaluation/metrics/clinical-judgment'
import { registerMetricInputProvider, type MetricInputProvider } from '../metrics'
import { clinicalTrajectoryGenerator } from './generators'
import { registerGenerator } from '../../case-data/generators'

const eventsAndDecisions = (b: {
  events?: ClinicalInputs['events']
  decisions?: ClinicalInputs['decisions']
}): ClinicalInputs => ({
  events: b.events ?? [],
  decisions: b.decisions ?? [],
})

const judgmentRuns = (b: { datasets?: Record<string, unknown> }): JudgmentInputs => ({
  runs: (b.datasets?.[CASE_STUDY_RUNS_DATASET] as JudgmentRun[] | undefined) ?? [],
})

export const judgmentRunsProvider: MetricInputProvider = async ({ root, ref }) => {
  const caseId = typeof ref.config.caseId === 'string' ? ref.config.caseId : undefined
  const runs = (await listRuns(root, caseId)).filter((r) => r.finishedAt && !r.preview)
  const datasets: Record<string, unknown> = {
    [CASE_STUDY_RUNS_DATASET]: runs.map((r): JudgmentRun => ({
      id: r.id,
      ...(r.learner ? { learner: r.learner } : {}),
      mode: r.mode,
      answers: r.answers,
    })),
  }
  return { datasets }
}

export const CLINICAL_METRIC_IDS = [
  'clinical_judgment_profile',
  'handoff_quality',
  'time_to_escalation',
  'triage_accuracy',
  'evacuation_order',
  'staffing_ratio_exceedances',
  'infection_control_decisions',
  'disclosure_timing',
  'downtime_workflow_time',
] as const

export function registerClinicalToolkit(): void {
  registerMetric(clinicalJudgmentProfile, judgmentRuns)
  registerMetric(handoffQuality, eventsAndDecisions)
  registerMetric(timeToEscalation, eventsAndDecisions)
  registerMetric(triageAccuracy, eventsAndDecisions)
  registerMetric(evacuationOrder, eventsAndDecisions)
  registerMetric(staffingRatioExceedances, eventsAndDecisions)
  registerMetric(infectionControlDecisions, eventsAndDecisions)
  registerMetric(disclosureTiming, eventsAndDecisions)
  registerMetric(downtimeWorkflowTime, eventsAndDecisions)
  registerMetricInputProvider('clinical_judgment_profile', judgmentRunsProvider)
  if (!generatorIds().includes(clinicalTrajectoryGenerator.id))
    registerGenerator(clinicalTrajectoryGenerator)
}
