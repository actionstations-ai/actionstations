// Running a case study (spec 0452 FR-9 to FR-11): one stage at a time, an answer to each prompt
// scored against the key, the rationale shown only after answering, and the next stage chosen by
// the branch. A learner gets only reviewed cases; the author can preview a draft. The view sent to
// the renderer never carries a key or an unanswered prompt's rationale, so a stage reads the same
// for a learner who opens the developer tools. Group runs record each member's own answer before
// the group's agreed answer is scored.
import {
  CASE_STUDY_PRIVACY_NOTE,
  CASE_STUDY_SCORE_NOTE,
  CJMM_LABELS,
  type CaseStudy,
  type CaseStudyRun,
  type CaseStudyAnswer,
  type CaseStudyPrompt,
  type CaseStudyResponse,
  type CaseStudyStage,
  type StepScore,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { renderFigure } from '../render/figures'
import {
  nextStageId,
  overallPercent,
  responseProblem,
  scorePrompt,
  stepProfile,
} from '../evaluate/casestudy'
import { getCaseStudy, getRun, saveRun } from './store'

export interface StartRequest {
  caseId: string
  mode: 'individual' | 'group'
  learner?: string
  acknowledged: boolean
  preview?: boolean
}

export async function startRun(root: string, req: StartRequest): Promise<CaseStudyRun> {
  const c = await getCaseStudy(root, req.caseId)
  if (c.status !== 'reviewed' && !req.preview)
    throw new AppError(
      'VALIDATION',
      'This case study is a draft. The author must review it before learners use it.',
    )
  if (!req.acknowledged)
    throw new AppError('VALIDATION', 'Read the notice about answers and content before starting')
  const run: CaseStudyRun = {
    id: newId(),
    caseId: c.id,
    mode: req.mode,
    ...(req.learner?.trim() ? { learner: req.learner.trim() } : {}),
    acknowledged: true,
    preview: !!req.preview && c.status !== 'reviewed',
    startedAt: nowIso(),
    stageId: c.stages[0]!.id,
    path: [c.stages[0]!.id],
    answers: [],
  }
  return saveRun(root, run)
}

const stageOf = (c: CaseStudy, id: string): CaseStudyStage => {
  const s = c.stages.find((x) => x.id === id)
  if (!s) throw new AppError('NOT_FOUND', `No stage ${id}`)
  return s
}

export interface AnswerRequest {
  runId: string
  promptId: string
  response: CaseStudyResponse
  /** Group run: each member's own answer before the agreed one. */
  preVotes?: { member: string; response: CaseStudyResponse }[]
}

export async function submitAnswer(root: string, req: AnswerRequest): Promise<CaseStudyRun> {
  const run = await getRun(root, req.runId)
  if (run.finishedAt) throw new AppError('CONFLICT', 'This run is finished')
  const c = await getCaseStudy(root, run.caseId)
  const stage = stageOf(c, run.stageId)
  const prompt = stage.prompts.find((p) => p.id === req.promptId)
  if (!prompt) throw new AppError('NOT_FOUND', 'That question is not in this stage')
  if (run.answers.some((a) => a.stageId === stage.id && a.promptId === prompt.id))
    throw new AppError('CONFLICT', 'That question is already answered')
  const problem = responseProblem(prompt, req.response)
  if (problem) throw new AppError('VALIDATION', problem)
  if (req.preVotes?.length) {
    if (run.mode !== 'group')
      throw new AppError('VALIDATION', 'Only a group run records separate votes')
    for (const v of req.preVotes) {
      const p = responseProblem(prompt, v.response)
      if (p) throw new AppError('VALIDATION', `${v.member}: ${p}`)
    }
  }
  const answer: CaseStudyAnswer = {
    stageId: stage.id,
    promptId: prompt.id,
    step: prompt.step,
    response: req.response,
    score: scorePrompt(prompt, req.response),
    ...(req.preVotes?.length ? { preVotes: req.preVotes } : {}),
    answeredAt: nowIso(),
  }
  return saveRun(root, { ...run, answers: [...run.answers, answer] })
}

/** Move to the next stage, or finish. Every prompt of the stage must be answered first. */
export async function advance(root: string, runId: string): Promise<CaseStudyRun> {
  const run = await getRun(root, runId)
  if (run.finishedAt) return run
  const c = await getCaseStudy(root, run.caseId)
  const stage = stageOf(c, run.stageId)
  const mine = run.answers.filter((a) => a.stageId === stage.id)
  if (stage.prompts.some((p) => !mine.some((a) => a.promptId === p.id)))
    throw new AppError('VALIDATION', 'Answer every question in this stage first')
  const next = nextStageId(stage, mine)
  if (!next) return saveRun(root, { ...run, finishedAt: nowIso() })
  stageOf(c, next)
  return saveRun(root, { ...run, stageId: next, path: [...run.path, next] })
}

// ---- the view -------------------------------------------------------------------------------

export interface PlayPrompt {
  id: string
  step: CaseStudyPrompt['step']
  stepLabel: string
  type: CaseStudyPrompt['type']
  text: string
  options?: { id: string; text: string }[]
}

export interface PlayFigure {
  name: string
  kind: string
  svg: string
  summary: string
  table?: { caption?: string; columns: string[]; rows: string[][] }
}

export interface PlayFeedback {
  promptId: string
  response: CaseStudyResponse
  score: number
  rationale: string
  /** What the key counted as best, in words, so the learner can compare. */
  bestAnswer: string
}

export interface PlayView {
  run: CaseStudyRun
  study: {
    id: string
    title: string
    patientSummary: string
    objectives: string[]
    contentNotice?: string
  }
  stage: {
    id: string
    title: string
    time: string
    narrative: string
    figures: PlayFigure[]
    tables: { caption: string; columns: string[]; rows: string[][] }[]
    statements: { speaker: string; text: string }[]
    prompts: PlayPrompt[]
  }
  stageNumber: number
  feedback: PlayFeedback[]
  canAdvance: boolean
  finished: boolean
  profile: StepScore[]
  overall: number | null
  notes: { score: string; privacy: string }
}

function bestAnswer(p: CaseStudyPrompt): string {
  const text = (id: string): string =>
    p.type !== 'rationale' ? (p.options.find((o) => o.id === id)?.text ?? id) : id
  switch (p.type) {
    case 'select_cues':
      return p.key.relevant.map(text).join('; ')
    case 'rank_hypotheses':
      return p.key.order.map((id, i) => `${i + 1}. ${text(id)}`).join('; ')
    case 'choose_actions':
      return Object.entries(p.key.credit)
        .filter(([, c]) => c >= 0.5)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => text(id))
        .join('; ')
    case 'evaluate_outcome':
      return Object.entries(p.key.credit)
        .filter(([, c]) => c === Math.max(...Object.values(p.key.credit)))
        .map(([id]) => text(id))
        .join('; ')
    case 'rationale':
      return p.key.points.map((k) => k.label).join('; ')
  }
}

function figuresOf(stage: CaseStudyStage): PlayFigure[] {
  return Object.entries(stage.data.figures).map(([name, spec]) => {
    const r = renderFigure({ kind: spec.kind, data: spec.data })
    return {
      name,
      kind: spec.kind,
      svg: r.svg,
      summary: r.summary,
      ...(r.table ? { table: r.table } : {}),
    }
  })
}

export async function playView(root: string, runId: string): Promise<PlayView> {
  const run = await getRun(root, runId)
  const c = await getCaseStudy(root, run.caseId)
  const stage = stageOf(c, run.stageId)
  const mine = run.answers.filter((a) => a.stageId === stage.id)
  const feedback: PlayFeedback[] = mine.flatMap((a) => {
    const p = stage.prompts.find((x) => x.id === a.promptId)
    return p
      ? [
          {
            promptId: p.id,
            response: a.response,
            score: a.score,
            rationale: p.rationale,
            bestAnswer: bestAnswer(p),
          },
        ]
      : []
  })
  const finished = !!run.finishedAt
  return {
    run,
    study: {
      id: c.id,
      title: c.title,
      patientSummary: c.patient.summary,
      objectives: c.objectives,
      ...(c.contentNotice ? { contentNotice: c.contentNotice } : {}),
    },
    stage: {
      id: stage.id,
      title: stage.title,
      time: stage.time,
      narrative: stage.narrative,
      figures: figuresOf(stage),
      tables: stage.data.tables,
      statements: stage.data.statements,
      prompts: stage.prompts.map((p) => ({
        id: p.id,
        step: p.step,
        stepLabel: CJMM_LABELS[p.step],
        type: p.type,
        text: p.text,
        ...('options' in p ? { options: p.options } : {}),
      })),
    },
    stageNumber: run.path.length,
    feedback,
    canAdvance: stage.prompts.every((p) => mine.some((a) => a.promptId === p.id)),
    finished,
    profile: finished ? stepProfile(run.answers) : [],
    overall: finished ? overallPercent(run.answers) : null,
    notes: { score: CASE_STUDY_SCORE_NOTE, privacy: CASE_STUDY_PRIVACY_NOTE },
  }
}
