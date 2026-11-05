// The clinical judgment profile (spec 0452 FR-14): for the finished case study runs of a
// project, the mean score at each of the six steps of the Clinical Judgment Measurement Model,
// the overall score and the step that scored lowest. The score is this app's own practice scale,
// not an NCLEX score. Preview runs are never counted. The runs arrive in the input bag under the
// dataset id `case_study_runs` (toolkits/clinical/register.ts supplies them).
import { z } from 'zod'
import { CJMM_LABELS, CJMM_STEPS, type CaseStudyAnswer } from '@shared/schemas'
import { latestAnswers } from '../../evaluate/casestudy'
import { mean, NOT_AVAILABLE, ratioText, type Metric, type MetricOutput } from './types'

export const CASE_STUDY_RUNS_DATASET = 'case_study_runs'

export interface JudgmentRun {
  id: string
  learner?: string
  mode: 'individual' | 'group'
  answers: CaseStudyAnswer[]
}

export interface JudgmentInputs {
  runs: JudgmentRun[]
}

export const JudgmentProfileConfig = z.object({
  /** Limit to one case study; absent counts every finished run. */
  caseId: z.string().optional(),
})
type JudgmentProfileConfig = z.infer<typeof JudgmentProfileConfig>

const pct = (v: number | null): string => (v === null ? NOT_AVAILABLE : `${Math.round(v * 100)}%`)

function compute(inputs: JudgmentInputs, config: JudgmentProfileConfig): MetricOutput {
  const runs = inputs.runs
  const latest = runs.flatMap((r) => latestAnswers(r.answers))
  const steps = CJMM_STEPS.map((step) => {
    const mine = latest.filter((a) => a.step === step)
    return { step, answers: mine.length, mean: mean(mine.map((a) => a.score)) }
  })
  const scored = steps.filter((s) => s.mean !== null)
  const weakest =
    scored.length > 1 ? scored.reduce((a, b) => (b.mean! < a.mean! ? b : a)) : undefined
  const overall = mean(latest.map((a) => a.score))
  return {
    metricId: 'clinical_judgment_profile',
    title: 'Clinical judgment profile',
    config,
    inputs: [
      { label: 'Finished runs counted', value: String(runs.length) },
      { label: 'Group runs', value: String(runs.filter((r) => r.mode === 'group').length) },
      { label: 'Answers counted', value: String(latest.length) },
    ],
    summary: [
      { label: 'Overall score', value: pct(overall) },
      {
        label: 'Lowest step',
        value: weakest ? `${CJMM_LABELS[weakest.step]} (${pct(weakest.mean)})` : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Score by step',
        columns: ['Step', 'Answers', 'Mean score'],
        rows: steps.map((s) => [CJMM_LABELS[s.step], String(s.answers), pct(s.mean)]),
      },
      {
        title: 'Runs',
        columns: ['Run', 'Mode', 'Answers', 'Overall'],
        rows: runs.map((r, i) => {
          const a = latestAnswers(r.answers)
          return [
            r.learner ?? `Anonymous ${i + 1}`,
            r.mode,
            String(a.length),
            pct(mean(a.map((x) => x.score))),
          ]
        }),
      },
    ],
    caveats: [
      'The score is this app’s own practice scale. It makes no claim of equivalence to NCLEX scoring.',
      'Individual results are visible to the instructor; learners are told before they start. Preview runs by the author are not counted.',
      'A step with few answers is a weak basis for a conclusion; the table shows how many answers each mean rests on.',
    ],
    data: {
      runs: runs.length,
      overall,
      overallText: ratioText(overall),
      steps: Object.fromEntries(steps.map((s) => [s.step, { answers: s.answers, mean: s.mean }])),
    },
  }
}

export const clinicalJudgmentProfile: Metric<JudgmentProfileConfig, JudgmentInputs> = {
  id: 'clinical_judgment_profile',
  title: 'Clinical judgment profile',
  configSchema: JudgmentProfileConfig,
  compute,
}
