// The micro-drill run functions bound to the running session's project folder (#437, FR-17).
import { probeModel } from './assess'
import type { DrillRuns } from './live'
import { reportToProgram } from './program'
import { finishRun, startRun, submitAnswer, takeHint } from './run'
import { getMicroDrill } from './store'

export function drillRuns(root: () => string): DrillRuns {
  return {
    getDrill: (id) => getMicroDrill(root(), id),
    mode: async () => {
      const probe = await probeModel(root())
      return probe.ok
        ? { assessment: 'model' }
        : { assessment: 'checklist', ...(probe.reason ? { reason: probe.reason } : {}) }
    },
    start: (drillId, label) => startRun(root(), drillId, [{ label }], 'player_page'),
    answer: (input) => submitAnswer(root(), input),
    hint: (runId, stepId) => takeHint(root(), runId, stepId),
    finish: (runId) => finishRun(root(), runId, 0),
    report: () => reportToProgram(root()),
  }
}
