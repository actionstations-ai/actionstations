// Running a micro-drill on this computer (#437, FR-8 to FR-15, FR-19): start a run (deciding
// the hint rule and whether a model or a checklist checks answers), take answers, hand out the
// drill's prewritten hints, and finish with a score and the hint history. Answers stay in the
// project folder; only the finished run's totals go to the program (program.ts).
import {
  MICRO_DRILL_LIMITS,
  MicroDrillRun,
  type HintLevel,
  type MicroDrill,
  type MicroDrillAttempt,
  type MicroDrillRunStep,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { assessWithModel, checklistAssessment, probeModel } from './assess'
import { decideHints, hintOffer, nextLevel, level3Available, updateHistory } from './hints'
import { runCoverage, stepScore } from './score'
import { getMicroDrill, getMicroRun, readHistory, saveMicroRun, writeHistory } from './store'

export interface ParticipantInput {
  label: string
  name?: string | undefined
}

export interface AnswerInput {
  runId: string
  stepId: string
  participantLabel: string
  text: string
  /** Checklist runs: the ids of the expected points the participant says they covered. */
  ticked?: string[] | undefined
}

export interface HintResult {
  level: HintLevel
  text: string
  page?: number
  headingPath?: string
  quote?: string
}

function cleanParticipants(
  drill: MicroDrill,
  input: ParticipantInput[],
  where: MicroDrillRun['where'],
): ParticipantInput[] {
  const cleaned = input
    .map((p, i) => ({
      label: p.label.trim().slice(0, 40) || `Participant ${i + 1}`,
      ...(p.name?.trim() ? { name: p.name.trim().slice(0, 80) } : {}),
    }))
    .slice(0, MICRO_DRILL_LIMITS.participants)
  if (!cleaned.length) cleaned.push({ label: 'Participant 1' })
  if (drill.mode === 'solo' || where === 'player_page') return cleaned.slice(0, 1)
  if (cleaned.length < 2) throw new AppError('VALIDATION', 'A team drill needs two to six people.')
  if (new Set(cleaned.map((p) => p.label)).size !== cleaned.length)
    throw new AppError('VALIDATION', 'Each participant needs a different label.')
  return cleaned
}

async function chooseAssessment(root: string) {
  const probe = await probeModel(root)
  return probe.ok
    ? ({ assessment: 'model' } as const)
    : ({ assessment: 'checklist', checklistReason: probe.reason } as const)
}

export async function startRun(
  root: string,
  drillId: string,
  input: ParticipantInput[],
  where: MicroDrillRun['where'] = 'this_computer',
): Promise<MicroDrillRun> {
  const drill = await getMicroDrill(root, drillId)
  if (drill.status !== 'ready') throw new AppError('VALIDATION', 'Mark the drill Ready to run it.')
  const participants = cleanParticipants(drill, input, where)
  const history = await readHistory(root, drill.annex)
  const hints = decideHints(
    participants.map((p) => p.label),
    drill.steps.map((s) => s.id),
    history,
  )
  const how = await chooseAssessment(root)
  return saveMicroRun(
    root,
    MicroDrillRun.parse({
      id: newId(),
      drillId: drill.id,
      drillVersion: drill.version,
      drillTitle: drill.title,
      annex: drill.annex,
      participants,
      where,
      ...how,
      hintRule: hints.rule,
      withdrawnLevel3: hints.withdrawnLevel3,
      startedAt: nowIso(),
      steps: drill.steps.map((s) => ({ stepId: s.id })),
    }),
  )
}

function openStep(run: MicroDrillRun, drill: MicroDrill, stepId: string) {
  if (run.finishedAt) throw new AppError('CONFLICT', 'This run is finished.')
  const step = drill.steps.find((s) => s.id === stepId)
  const runStep = run.steps.find((s) => s.stepId === stepId)
  if (!step || !runStep) throw new AppError('NOT_FOUND', 'That question is not in this drill.')
  return { step, runStep }
}

function replaceStep(run: MicroDrillRun, next: MicroDrillRunStep): MicroDrillRun {
  return { ...run, steps: run.steps.map((s) => (s.stepId === next.stepId ? next : s)) }
}

async function assess(
  run: MicroDrillRun,
  root: string,
  input: AnswerInput,
  step: MicroDrill['steps'][number],
) {
  if (run.assessment === 'checklist') {
    const valid = new Set(step.expectedPoints.map((p) => p.id))
    return checklistAssessment(
      step,
      (input.ticked ?? []).filter((id) => valid.has(id)),
    )
  }
  if (!input.text.trim()) throw new AppError('VALIDATION', 'Write an answer first.')
  return assessWithModel(root, step, input.text)
}

export async function submitAnswer(
  root: string,
  input: AnswerInput,
): Promise<{ run: MicroDrillRun; hintOffer: HintLevel | null }> {
  const run = await getMicroRun(root, input.runId)
  const drill = await getMicroDrill(root, run.drillId)
  const { step, runStep } = openStep(run, drill, input.stepId)
  if (!run.participants.some((p) => p.label === input.participantLabel))
    throw new AppError('VALIDATION', 'That participant is not in this run.')
  const result = await assess(run, root, input, step)
  const attempt: MicroDrillAttempt = {
    participantLabel: input.participantLabel,
    text: input.text.slice(0, 4000),
    at: nowIso(),
    covered: result.covered,
    partial: result.partial,
    missing: result.missing,
    ...(result.followUp ? { followUp: result.followUp } : {}),
  }
  const attempts = [...runStep.attempts, attempt].slice(-50)
  const next = { ...runStep, attempts, score: stepScore(step, attempts, runStep.hintsUsed) }
  const saved = await saveMicroRun(root, replaceStep(run, next))
  return { run: saved, hintOffer: hintOffer(next, run.hintRule, run.withdrawnLevel3) }
}

function hintOf(step: MicroDrill['steps'][number], level: HintLevel): HintResult {
  const hint = step.hints[level - 1]!
  if (hint.level === 1) return { level, text: hint.text }
  const where = { page: hint.citation.page, headingPath: hint.citation.headingPath }
  return {
    level,
    text: hint.text,
    headingPath: where.headingPath,
    ...(where.page !== undefined ? { page: where.page } : {}),
    ...(hint.level === 3 ? { quote: hint.quote } : {}),
  }
}

/** The next prewritten hint for a step; Level 3 is refused where fading withdrew it. */
export async function takeHint(
  root: string,
  runId: string,
  stepId: string,
): Promise<{ run: MicroDrillRun; hint: HintResult }> {
  const run = await getMicroRun(root, runId)
  const drill = await getMicroDrill(root, run.drillId)
  const { step, runStep } = openStep(run, drill, stepId)
  const level = nextLevel(runStep.hintsUsed)
  if (!level) throw new AppError('CONFLICT', 'All three hints for this question were used.')
  if (level === 3 && !level3Available(stepId, run.withdrawnLevel3))
    throw new AppError(
      'CONFLICT',
      'The plan quote is not offered for this question because you answered it without hints in your last two runs. Open the plan section named in the Level 2 hint.',
    )
  const hintsUsed = [...runStep.hintsUsed, level]
  const next = { ...runStep, hintsUsed, score: stepScore(step, runStep.attempts, hintsUsed) }
  const saved = await saveMicroRun(root, replaceStep(run, next))
  return { run: saved, hint: hintOf(step, level) }
}

/** Finish: coverage, hint history for fading, and the finish time. Reporting is the caller's. */
export async function finishRun(
  root: string,
  runId: string,
  pausedSec: number,
): Promise<MicroDrillRun> {
  const run = await getMicroRun(root, runId)
  if (run.finishedAt) return run
  const drill = await getMicroDrill(root, run.drillId)
  const finished = await saveMicroRun(root, {
    ...run,
    finishedAt: nowIso(),
    pausedSec: Math.max(0, Math.min(pausedSec, 24 * 3600)),
    coverage: runCoverage(run.steps, drill.steps.length),
  })
  const labels = run.participants.map((p) => p.label)
  const history = await readHistory(root, drill.annex)
  await writeHistory(root, drill.annex, updateHistory(history, labels, finished.steps))
  return finished
}
