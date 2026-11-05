// Scoring for unfolding case studies (spec 0452 FR-10, FR-14): a pure function over answers and
// keys. Every prompt scores from 0 to 1 with partial credit on this app's own scale; the scale
// makes no claim of equivalence to NCLEX scoring. The per-step profile is the mean score of the
// prompts answered for each step of the Clinical Judgment Measurement Model.
import {
  CJMM_LABELS,
  CJMM_STEPS,
  type CaseStudy,
  type CaseStudyAnswer,
  type CaseStudyPrompt,
  type CaseStudyResponse,
  type CaseStudyStage,
  type StepScore,
} from '@shared/schemas'

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const round3 = (v: number): number => Math.round(v * 1000) / 1000

const asIds = (r: CaseStudyResponse): string[] => (Array.isArray(r) ? r : [])
const asText = (r: CaseStudyResponse): string => (typeof r === 'string' ? r : '')

/** The score, 0 to 1, of one response to one prompt. */
export function scorePrompt(prompt: CaseStudyPrompt, response: CaseStudyResponse): number {
  switch (prompt.type) {
    case 'select_cues': {
      const relevant = new Set(prompt.key.relevant)
      const chosen = [...new Set(asIds(response))]
      const right = chosen.filter((id) => relevant.has(id)).length
      const wrong = chosen.length - right
      return round3(clamp01((right - wrong) / relevant.size))
    }
    case 'rank_hypotheses': {
      const order = prompt.key.order
      const given = [...new Set(asIds(response).filter((id) => order.includes(id)))]
      for (const id of order) if (!given.includes(id)) given.push(id)
      const n = order.length
      const worst = Math.floor((n * n) / 2)
      const off = order.reduce((sum, id, i) => sum + Math.abs(i - given.indexOf(id)), 0)
      return round3(clamp01(1 - off / worst))
    }
    case 'choose_actions': {
      const credit = prompt.key.credit
      const best = Object.values(credit).reduce((s, c) => s + Math.max(c, 0), 0)
      const earned = [...new Set(asIds(response))].reduce((s, id) => s + (credit[id] ?? 0), 0)
      return best === 0 ? 0 : round3(clamp01(earned / best))
    }
    case 'rationale': {
      const text = asText(response).toLowerCase()
      if (!text.trim()) return 0
      const hit = prompt.key.points.filter((p) =>
        p.anyOf.some((phrase) => text.includes(phrase.toLowerCase())),
      ).length
      return round3(hit / prompt.key.points.length)
    }
    case 'evaluate_outcome': {
      const [id] = asIds(response)
      return id === undefined ? 0 : round3(clamp01(prompt.key.credit[id] ?? 0))
    }
  }
}

/** Whether a response has the right shape for a prompt (known option ids, a list or text). */
export function responseProblem(
  prompt: CaseStudyPrompt,
  response: CaseStudyResponse,
): string | undefined {
  if (prompt.type === 'rationale')
    return typeof response === 'string' ? undefined : 'A written answer is expected'
  if (!Array.isArray(response)) return 'Choose from the options'
  const known = new Set(prompt.options.map((o) => o.id))
  if (response.some((id) => !known.has(id))) return 'The answer names an option that does not exist'
  if (new Set(response).size !== response.length) return 'An option is chosen twice'
  if (prompt.type === 'evaluate_outcome' && response.length !== 1) return 'Choose one option'
  if (prompt.type === 'rank_hypotheses' && response.length !== prompt.options.length)
    return 'Rank every option'
  return undefined
}

/** The stage that follows: the last branching prompt of the stage decides, else `next`. */
export function nextStageId(
  stage: CaseStudyStage,
  answers: Pick<CaseStudyAnswer, 'promptId' | 'score'>[],
): string | undefined {
  const deciding = [...stage.prompts].reverse().find((p) => p.branch)
  if (deciding?.branch) {
    const answer = answers.find((a) => a.promptId === deciding.id)
    if (answer) {
      const target =
        answer.score >= deciding.branch.threshold ? deciding.branch.passTo : deciding.branch.failTo
      if (target) return target
    }
  }
  return stage.next
}

/** The latest answer per prompt. */
export function latestAnswers(answers: CaseStudyAnswer[]): CaseStudyAnswer[] {
  const byPrompt = new Map<string, CaseStudyAnswer>()
  for (const a of answers) byPrompt.set(`${a.stageId}/${a.promptId}`, a)
  return [...byPrompt.values()]
}

/** The profile across the six steps: prompts answered, points earned and percent. */
export function stepProfile(answers: CaseStudyAnswer[]): StepScore[] {
  const latest = latestAnswers(answers)
  return CJMM_STEPS.map((step) => {
    const mine = latest.filter((a) => a.step === step)
    const earned = mine.reduce((s, a) => s + a.score, 0)
    return {
      step,
      label: CJMM_LABELS[step],
      prompts: mine.length,
      earned: round3(earned),
      percent: mine.length ? Math.round((earned / mine.length) * 100) : null,
    }
  })
}

/** The overall percent across answered prompts, or null with none. */
export function overallPercent(answers: CaseStudyAnswer[]): number | null {
  const latest = latestAnswers(answers)
  if (!latest.length) return null
  return Math.round((latest.reduce((s, a) => s + a.score, 0) / latest.length) * 100)
}

/** The steps with the lowest and highest percent (ties go to the earlier step), for the report. */
export function strongestAndWeakest(profile: StepScore[]): {
  strong?: StepScore
  weak?: StepScore
} {
  const scored = profile.filter((p): p is StepScore & { percent: number } => p.percent !== null)
  if (scored.length < 2) return {}
  const strong = scored.reduce((a, b) => (b.percent > a.percent ? b : a))
  const weak = scored.reduce((a, b) => (b.percent < a.percent ? b : a))
  return strong.percent === weak.percent ? {} : { strong, weak }
}

/** Every prompt of the stages a run visited, answered or not, in order (for a report). */
export function visitedPrompts(c: CaseStudy, path: string[]): CaseStudyPrompt[] {
  return path.flatMap((id) => c.stages.find((s) => s.id === id)?.prompts ?? [])
}
