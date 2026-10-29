import { buildGraph, type BranchScenario } from './graph'

/** Every decision resolved to its default option (decision id -> option id). */
export function defaultDecisions(scenario: BranchScenario): Map<string, string> {
  const out = new Map<string, string>()
  for (const [id, { decision }] of buildGraph(scenario).decisions)
    out.set(id, decision.defaultOptionId)
  return out
}
