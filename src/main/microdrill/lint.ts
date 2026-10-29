// Build checks for a micro-drill (#437, FR-5), deterministic and run on every save: every
// citation points into the annex, every Level 3 quote is in the chunk it cites, no question
// gives away its own answer, the drill fits its duration, and no stray person name appears.
// Problems are shown on the drill and keep it from Ready until fixed or overridden.
import type { Chunk, MicroDrill, MicroDrillCitation, MicroDrillLintIssue } from '@shared/schemas'
import { normalizedForm } from '@shared/redline/excerpt'

const MINUTES_PER_STEP = 3
const SITUATION_MINUTES = 2
/** A drill may run this many minutes over the plan before it is flagged. */
const SLACK_MINUTES = 2
/** Points this short are too generic to count as "the answer inside the question". */
const MIN_GIVEAWAY_CHARS = 25
const TITLED_NAME = /\b(?:Mr|Mrs|Ms|Mx|Dr|Captain|Chief|Officer|Director)\.?\s+[A-Z][a-z]{2,}/g

/** The model sees "&amp;" and "&lt;" for "&" and "<"; undo that before comparing with the plan. */
export const unescapeText = (s: string): string => s.replace(/&lt;/g, '<').replace(/&amp;/g, '&')

type Issue = MicroDrillLintIssue

function citationIssues(
  where: string,
  cite: MicroDrillCitation,
  ids: Set<number>,
  stepId: string,
): Issue[] {
  return ids.has(cite.chunkId)
    ? []
    : [
        {
          code: 'citation_outside_annex',
          stepId,
          message: `${where} cites a passage outside the annex.`,
        },
      ]
}

function quoteIssues(step: MicroDrill['steps'][number], byId: Map<number, Chunk>): Issue[] {
  const hint = step.hints[2]
  const chunk = byId.get(hint.citation.chunkId)
  if (!chunk) return []
  const quote = normalizedForm(unescapeText(hint.quote))
  return quote && normalizedForm(chunk.text).includes(quote)
    ? []
    : [
        {
          code: 'quote_not_verbatim',
          stepId: step.id,
          message: 'The Level 3 hint quotes words that are not in the passage it cites.',
        },
      ]
}

function giveawayIssues(step: MicroDrill['steps'][number]): Issue[] {
  const prompt = normalizedForm(step.prompt)
  const given = [step.modelAnswer, ...step.expectedPoints.map((p) => p.text)]
    .map(normalizedForm)
    .filter((t) => t.length >= MIN_GIVEAWAY_CHARS)
  return given.some((t) => prompt.includes(t))
    ? [
        {
          code: 'prompt_gives_answer',
          stepId: step.id,
          message: 'The question contains its own answer.',
        },
      ]
    : []
}

function nameIssues(drill: MicroDrill, annexText: string): Issue[] {
  const own = normalizedForm(annexText)
  const text = [
    drill.situation,
    ...drill.steps.flatMap((s) => [s.prompt, s.modelAnswer, ...s.hints.map((h) => h.text)]),
  ].join('\n')
  const names = [...new Set(text.match(TITLED_NAME) ?? [])].filter(
    (n) => !own.includes(normalizedForm(n)),
  )
  return names.map((n) => ({
    code: 'person_name',
    message: `"${n}" is a person's name that is not in the plan. Use a role or a fictional name.`,
  }))
}

function durationIssues(drill: MicroDrill): Issue[] {
  const needed = drill.steps.length * MINUTES_PER_STEP + SITUATION_MINUTES
  return needed > drill.durationMin + SLACK_MINUTES
    ? [
        {
          code: 'too_long',
          message: `${drill.steps.length} questions need about ${needed} minutes; the drill is set for ${drill.durationMin}.`,
        },
      ]
    : []
}

/** All build checks for a drill against the chunks of its annex. */
export function lintDrill(drill: MicroDrill, annexChunks: Chunk[]): MicroDrillLintIssue[] {
  const ids = new Set(annexChunks.map((c) => c.id))
  const byId = new Map(annexChunks.map((c) => [c.id, c]))
  const issues: Issue[] = [...durationIssues(drill)]
  for (const step of drill.steps) {
    const n = drill.steps.indexOf(step) + 1
    for (const p of step.expectedPoints)
      issues.push(...citationIssues(`An expected point of question ${n}`, p.citation, ids, step.id))
    issues.push(
      ...citationIssues(`The Level 2 hint of question ${n}`, step.hints[1].citation, ids, step.id),
      ...citationIssues(`The Level 3 hint of question ${n}`, step.hints[2].citation, ids, step.id),
      ...quoteIssues(step, byId),
      ...giveawayIssues(step),
    )
  }
  issues.push(...nameIssues(drill, annexChunks.map((c) => c.text).join('\n')))
  return issues.slice(0, 100)
}
