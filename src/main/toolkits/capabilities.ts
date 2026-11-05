// The code a toolkit names by id (spec 0448 FR-1): figure kinds, data connectors, evaluation
// metrics and lint rules. Packs cannot add any of these, so an id the app has no code for does
// nothing at run time. At pack load that is a warning, not a failure: the pack still installs
// (a newer pack may name a capability a newer app has) and the pack details say what is missing.
import type { Toolkit } from '@shared/toolkits'
import { isMetricId } from '../evaluation/metrics/registry'
import { listFigureKinds } from '../render/figures'
import { connectorIds } from './connectors/registry'
import { fieldLintRuleIds } from './lint-rules'

type Named = Pick<Toolkit, 'figureKinds' | 'connectors' | 'metrics' | 'lintRules'>

/** One plain sentence per id the app has no code for; empty when everything is known. */
export function unknownCapabilityWarnings(toolkit: Named): string[] {
  const figures = new Set(listFigureKinds())
  const connectors = new Set(connectorIds())
  const rules = new Set(fieldLintRuleIds())
  const missing = (kind: string, ids: readonly string[], known: (id: string) => boolean) =>
    ids.filter((id) => !known(id)).map((id) => `The app has no ${kind} "${id}"; it is ignored.`)
  return [
    ...missing('figure kind', toolkit.figureKinds, (id) => figures.has(id)),
    ...missing('data connector', toolkit.connectors, (id) => connectors.has(id)),
    ...missing(
      'metric',
      toolkit.metrics.map((m) => m.id),
      isMetricId,
    ),
    ...missing('lint rule', toolkit.lintRules, (id) => rules.has(id)),
  ]
}
