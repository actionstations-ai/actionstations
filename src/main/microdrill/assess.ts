// Checking an answer against a step's expected points (#437, FR-9, FR-15, FR-18). The model
// sees the question, the expected points and the answer wrapped as data, and may only sort the
// listed points into covered, partly covered and missing; it writes no hints. Before a
// model-checked run the app sends three fixed probe answers; if the model misjudges any, the run
// uses a checklist the participant ticks instead.
import type { MicroDrillAssessOutput, MicroDrillStep } from '@shared/schemas'
import { MicroDrillAssessOutput as AssessSchema } from '@shared/schemas'
import { pipelineDeps } from '../generate/deps'
import { escapeText } from '../generate/retrieval'
import { runStage } from '../generate/stage'
import type { JobContext } from '../jobs/manager'
import { toAppError } from '../lib/errors'

export interface Assessment {
  covered: string[]
  partial: string[]
  missing: string[]
  followUp?: string
}

/** A job context for a single request that is not a job: nothing to cancel, nothing to show. */
function requestContext(): JobContext {
  return {
    jobId: 'micro-drill',
    signal: new AbortController().signal,
    progress: () => {},
    log: () => {},
    token: () => {},
    throwIfCancelled: () => {},
  }
}

/** Keep only the step's own point ids; each lands once, the best verdict winning. */
export function normalizeAssessment(
  step: Pick<MicroDrillStep, 'expectedPoints'>,
  out: MicroDrillAssessOutput,
): Assessment {
  const ids = step.expectedPoints.map((p) => p.id)
  const covered = ids.filter((id) => out.covered.includes(id))
  const partial = ids.filter((id) => !covered.includes(id) && out.partial.includes(id))
  const missing = ids.filter((id) => !covered.includes(id) && !partial.includes(id))
  const followUp = out.followUp?.trim()
  return {
    covered,
    partial,
    missing,
    ...(followUp && missing.length + partial.length ? { followUp } : {}),
  }
}

/** Assessment from the points a participant ticked (no model). */
export function checklistAssessment(
  step: Pick<MicroDrillStep, 'expectedPoints'>,
  ticked: string[],
): Assessment {
  const ids = step.expectedPoints.map((p) => p.id)
  return {
    covered: ids.filter((id) => ticked.includes(id)),
    partial: [],
    missing: ids.filter((id) => !ticked.includes(id)),
  }
}

export async function assessWithModel(
  root: string,
  step: Pick<MicroDrillStep, 'id' | 'prompt' | 'expectedPoints'>,
  answer: string,
): Promise<Assessment> {
  const deps = await pipelineDeps()
  const result = await runStage<MicroDrillAssessOutput>({
    stage: 'micro_drill_assess',
    itemId: step.id,
    projectPath: root,
    vars: {
      question: escapeText(step.prompt),
      points: step.expectedPoints.map((p) => ({ id: p.id, text: escapeText(p.text) })),
      answer: escapeText(answer),
    },
    ctx: requestContext(),
    deps,
    index: await deps.openIndex(root),
  })
  return normalizeAssessment(step, AssessSchema.parse(result.output))
}

const PROBE_STEP: Pick<MicroDrillStep, 'id' | 'prompt' | 'expectedPoints'> = {
  id: 'probe',
  prompt: 'A fault takes down part of a terminal. What are the first three things you do?',
  expectedPoints: [
    ['p1', 'Call the airport operations center immediately'],
    ['p2', 'Isolate the affected terminal gates'],
    ['p3', 'Log every action with its time'],
  ].map(([id, text]) => ({
    id: id!,
    text: text!,
    citation: { documentId: 'probe', documentTitle: 'Probe', headingPath: 'Probe', chunkId: 0 },
  })),
}

/** The three fixed probes: an answer covering everything, one covering nothing, one paraphrase. */
export const PROBES = [
  {
    name: 'a full answer',
    answer:
      'Call the airport operations center immediately, isolate the affected terminal gates, and log every action with its time.',
    ok: (a: Assessment) => a.covered.length === 3,
  },
  {
    name: 'an answer that covers nothing',
    answer: 'I would wait and see what happens before doing anything.',
    ok: (a: Assessment) => a.covered.length === 0 && a.partial.length === 0,
  },
  {
    name: 'a paraphrase',
    answer: 'The gates in the affected terminal should be isolated.',
    ok: (a: Assessment) =>
      (a.covered.includes('p2') || a.partial.includes('p2')) &&
      !a.covered.includes('p1') &&
      !a.covered.includes('p3'),
  },
]

export interface ProbeResult {
  ok: boolean
  reason?: string
}

const PROBE_TTL_MS = 10 * 60_000
const probed = new Map<string, { at: number; result: ProbeResult }>()

/** Run the probes against the project's drafting model; the result is kept for ten minutes. */
export async function probeModel(root: string, now = Date.now()): Promise<ProbeResult> {
  const cached = probed.get(root)
  if (cached && now - cached.at < PROBE_TTL_MS) return cached.result
  const result = await runProbes(root)
  probed.set(root, { at: now, result })
  return result
}

export const clearProbeCache = (): void => probed.clear()

async function runProbes(root: string): Promise<ProbeResult> {
  for (const probe of PROBES) {
    try {
      const got = await assessWithModel(root, PROBE_STEP, probe.answer)
      if (!probe.ok(got))
        return {
          ok: false,
          reason: `The drafting model misjudged a test answer (${probe.name}), so this run uses a checklist.`,
        }
    } catch (err) {
      return {
        ok: false,
        reason: `No drafting model could check answers (${toAppError(err).message}), so this run uses a checklist.`,
      }
    }
  }
  return { ok: true }
}
