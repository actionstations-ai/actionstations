// A case study for a whole class (spec 0452 FR-11), on the live survey pipeline: the instructor
// sends one stage at a time to the room's devices, each device answers once per stage, and the
// instructor sees the room's answers as they arrive. A stage becomes a survey (one question per
// prompt) in the running scenario; the keys, the rationales and the scoring stay on the
// instructor's computer, so nothing a device receives carries the answer. Answers are anonymous
// by the survey rules (no name, device or address is stored), so class results are totals and
// distributions, never a person's answers, and the survey's minimum-responses rule hides detail
// until enough devices have answered. Ranking prompts are asked as "the most likely
// explanation" because a device answers one choice per question.
import {
  CASE_STUDY_SCORE_NOTE,
  CJMM_LABELS,
  classSurveyId,
  CJMM_STEPS,
  type CaseStudy,
  type CaseStudyPrompt,
  type CaseStudyStage,
  type CjmmStep,
  type Survey,
  type SurveyQuestion,
  type SurveyResponse,
} from '@shared/schemas'
import { scorePrompt } from '../evaluate/casestudy'
import { AppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { renderFigure } from '../render/figures'
import { readResponses, writeSurvey } from '../surveys/store'
import { getCaseStudy } from './store'

export const CLASS_ANONYMITY_NOTE =
  'Your answers in a class session are anonymous: no name or device is stored with them. Your instructor sees the room’s totals.'

function figureText(stage: CaseStudyStage): string[] {
  return Object.values(stage.data.figures).map((spec) => {
    const r = renderFigure({ kind: spec.kind, data: spec.data })
    return r.summary
  })
}

/** What a device reads before the questions: the narrative, what was said and the data in words. */
export function stageIntro(c: CaseStudy, stage: CaseStudyStage): string {
  const parts = [
    `**${c.title}**`,
    stage.narrative,
    ...stage.data.statements.map((s) => `${s.speaker}: “${s.text}”`),
    ...stage.data.tables.map((t) => `${t.caption}: ${t.rows.map((r) => r.join(' ')).join('; ')}`),
    ...figureText(stage),
  ]
  if (stage.id === c.stages[0]!.id && c.contentNotice)
    parts.push(`Content notice: ${c.contentNotice} You may choose not to answer.`)
  parts.push(CLASS_ANONYMITY_NOTE, CASE_STUDY_SCORE_NOTE)
  return parts.join('\n\n').slice(0, 3900)
}

function questionFor(p: CaseStudyPrompt): SurveyQuestion {
  const base = {
    id: p.id,
    text: `${CJMM_LABELS[p.step]}: ${p.text}`.slice(0, 1000),
    help: '',
    required: false,
  }
  switch (p.type) {
    case 'select_cues':
    case 'choose_actions':
      return { ...base, type: 'choice', multiple: true, options: p.options, allowOther: false }
    case 'evaluate_outcome':
      return { ...base, type: 'choice', multiple: false, options: p.options, allowOther: false }
    case 'rank_hypotheses':
      return {
        ...base,
        text: `${CJMM_LABELS[p.step]}: ${p.text} Choose the single most likely one.`.slice(0, 1000),
        type: 'choice',
        multiple: false,
        options: p.options,
        allowOther: false,
      }
    case 'rationale':
      return { ...base, type: 'text', long: true, maxLength: 1000 }
  }
}

/** The survey of one stage, without any key. */
export function surveyForStage(c: CaseStudy, stage: CaseStudyStage): Survey {
  const now = nowIso()
  return {
    formatVersion: 1,
    id: classSurveyId(c.id, stage.id),
    title: `${c.title}: ${stage.title}`.slice(0, 200),
    kind: 'custom',
    timing: 'during',
    introMd: stageIntro(c, stage),
    askRoleGroup: false,
    roleGroups: [],
    sections: [
      {
        id: 'stage',
        title: stage.title.slice(0, 200),
        introMd: '',
        questions: stage.prompts.map(questionFor),
      },
    ],
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  } as Survey
}

/** Write the stage's survey into the scenario (idempotent) and return its id. */
export async function prepareClassStage(
  root: string,
  scenarioId: string,
  caseId: string,
  stageId: string,
): Promise<{ study: CaseStudy; stage: CaseStudyStage; surveyId: string }> {
  const study = await getCaseStudy(root, caseId)
  if (study.status !== 'reviewed')
    throw new AppError(
      'VALIDATION',
      'This case study is a draft. The author must review it before a class uses it.',
    )
  const stage = study.stages.find((s) => s.id === stageId)
  if (!stage) throw new AppError('NOT_FOUND', `No stage ${stageId}`)
  const survey = surveyForStage(study, stage)
  await writeSurvey(root, scenarioId, survey)
  return { study, stage, surveyId: survey.id }
}

// ---- results ----------------------------------------------------------------------------------

/** A device's answer to a prompt as a score from 0 to 1 on this app's practice scale. */
export function scoreClassAnswer(p: CaseStudyPrompt, answer: unknown): number | undefined {
  if (answer === undefined || answer === null) return undefined
  if (p.type === 'rationale') return typeof answer === 'string' ? scorePrompt(p, answer) : undefined
  if (!Array.isArray(answer)) return undefined
  const ids = answer.map(String)
  if (p.type === 'rank_hypotheses') {
    const [first] = ids
    const at = p.key.order.indexOf(first ?? '')
    if (at < 0) return undefined
    return Math.round((1 - at / (p.key.order.length - 1)) * 1000) / 1000
  }
  return scorePrompt(p, ids)
}

export interface ClassPromptResult {
  promptId: string
  step: CjmmStep
  stepLabel: string
  text: string
  /** Devices that answered this question. */
  answered: number
  /** Mean score; null when no device answered or detail is held back. */
  meanScore: number | null
  options?: { id: string; text: string; count: number | null }[]
  /** Shown only when `reveal` is on. */
  reveal?: { bestAnswer: string; rationale: string }
  suppressed: boolean
}

export interface ClassStageResults {
  surveyId: string
  stageId: string
  stageTitle: string
  /** Devices that answered anything. */
  responses: number
  minResponses: number
  prompts: ClassPromptResult[]
  notes: { score: string; anonymity: string }
}

function bestAnswerText(p: CaseStudyPrompt): string {
  const text = (id: string): string =>
    p.type === 'rationale' ? id : (p.options.find((o) => o.id === id)?.text ?? id)
  switch (p.type) {
    case 'select_cues':
      return p.key.relevant.map(text).join('; ')
    case 'rank_hypotheses':
      return p.key.order.map((id, i) => `${i + 1}. ${text(id)}`).join('; ')
    case 'choose_actions':
      return Object.entries(p.key.credit)
        .filter(([, c]) => c >= 0.5)
        .map(([id]) => text(id))
        .join('; ')
    case 'evaluate_outcome': {
      const top = Math.max(...Object.values(p.key.credit))
      return Object.entries(p.key.credit)
        .filter(([, c]) => c === top)
        .map(([id]) => text(id))
        .join('; ')
    }
    case 'rationale':
      return p.key.points.map((k) => k.label).join('; ')
  }
}

export function summarizeStage(
  study: CaseStudy,
  stage: CaseStudyStage,
  responses: SurveyResponse[],
  opts: { minResponses: number; reveal: boolean },
): ClassStageResults {
  const enough = responses.length >= opts.minResponses
  const prompts = stage.prompts.map((p): ClassPromptResult => {
    const answers = responses.map((r) => r.answers[p.id]).filter((a) => a !== undefined)
    const scores = answers
      .map((a) => scoreClassAnswer(p, a))
      .filter((s): s is number => s !== undefined)
    const counts = new Map<string, number>()
    if ('options' in p)
      for (const a of answers)
        if (Array.isArray(a))
          for (const id of a) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1)
    return {
      promptId: p.id,
      step: p.step,
      stepLabel: CJMM_LABELS[p.step],
      text: p.text,
      answered: answers.length,
      meanScore:
        enough && scores.length
          ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 1000) / 1000
          : null,
      ...('options' in p
        ? {
            options: p.options.map((o) => ({
              id: o.id,
              text: o.text,
              count: enough ? (counts.get(o.id) ?? 0) : null,
            })),
          }
        : {}),
      ...(opts.reveal ? { reveal: { bestAnswer: bestAnswerText(p), rationale: p.rationale } } : {}),
      suppressed: !enough,
    }
  })
  return {
    surveyId: classSurveyId(study.id, stage.id),
    stageId: stage.id,
    stageTitle: stage.title,
    responses: responses.length,
    minResponses: opts.minResponses,
    prompts,
    notes: { score: CASE_STUDY_SCORE_NOTE, anonymity: CLASS_ANONYMITY_NOTE },
  }
}

export async function classStageResults(
  root: string,
  scenarioId: string,
  caseId: string,
  stageId: string,
  opts: { minResponses: number; reveal: boolean },
): Promise<ClassStageResults> {
  const study = await getCaseStudy(root, caseId)
  const stage = study.stages.find((s) => s.id === stageId)
  if (!stage) throw new AppError('NOT_FOUND', `No stage ${stageId}`)
  const responses = await readResponses(root, scenarioId, classSurveyId(caseId, stageId)).catch(
    () => [],
  )
  return summarizeStage(study, stage, responses, opts)
}

export interface ClassStepProfile {
  step: CjmmStep
  label: string
  answers: number
  percent: number | null
}

/** The room's mean score at each step across every stage opened so far. */
export async function classStepProfile(
  root: string,
  scenarioId: string,
  caseId: string,
  minResponses: number,
): Promise<ClassStepProfile[]> {
  const study = await getCaseStudy(root, caseId)
  const byStep = new Map<string, number[]>()
  for (const stage of study.stages) {
    const responses = await readResponses(root, scenarioId, classSurveyId(caseId, stage.id)).catch(
      () => [],
    )
    if (responses.length < minResponses) continue
    for (const p of stage.prompts)
      for (const r of responses) {
        const s = scoreClassAnswer(p, r.answers[p.id])
        if (s !== undefined) byStep.set(p.step, [...(byStep.get(p.step) ?? []), s])
      }
  }
  return CJMM_STEPS.map((step) => {
    const v = byStep.get(step) ?? []
    return {
      step,
      label: CJMM_LABELS[step],
      answers: v.length,
      percent: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) : null,
    }
  })
}

export { classSurveyId }
