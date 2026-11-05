// case:* (spec 0448 FR-7..FR-10, ADR-0076): case data stored with a scenario. The renderer never
// sends an address: a fetch names a connector by id, and main shows the size estimate first.
// `case:fetch` is refused without the estimate id from `case:plan-fetch` and `consent: true`.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import {
  CaseArea,
  CaseDataSettings,
  CaseDatasetKind,
  CaseManifest,
  CaseTimeMapping,
  CaseTimeRange,
} from '../schemas/case-data'

const S = z.object({ projectPath: z.string().min(1), scenarioId: SafeId })

export const CaseSummary = z.object({
  manifest: CaseManifest.nullable(),
  bytes: z.number(),
  limitBytes: z.number(),
})
export type CaseSummary = z.infer<typeof CaseSummary>

export const CaseFetchQuery = z.object({
  range: CaseTimeRange,
  area: CaseArea,
  options: z
    .record(z.string().max(60), z.union([z.string().max(200), z.number(), z.boolean()]))
    .default({}),
})

export const CaseFetchPlan = z.object({
  estimateId: z.string(),
  connectorId: z.string(),
  source: z.string(),
  terms: z.string(),
  hosts: z.array(z.string()),
  estimate: z.object({
    items: z.array(
      z.object({
        datasetId: z.string(),
        label: z.string(),
        kind: CaseDatasetKind,
        bytes: z.number(),
      }),
    ),
    requests: z.number(),
  }),
  totalBytes: z.number(),
  roomBytes: z.number(),
  exceedsLimit: z.boolean(),
})
export type CaseFetchPlan = z.infer<typeof CaseFetchPlan>

export const caseDataChannels = {
  'case:get': channel(S, CaseSummary),
  'case:connectors': channel(
    z.void(),
    z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        source: z.string(),
        terms: z.string(),
        hosts: z.array(z.string()),
      }),
    ),
  ),
  'case:generators': channel(z.void(), z.array(z.object({ id: z.string(), label: z.string() }))),
  'case:plan-fetch': channel(
    S.extend({ connectorId: z.string().min(1).max(64), query: CaseFetchQuery }),
    CaseFetchPlan,
  ),
  'case:fetch': channel(
    S.extend({ estimateId: z.string().min(1).max(64), consent: z.literal(true) }),
    CaseManifest,
  ),
  'case:generate': channel(
    S.extend({ generatorId: z.string().min(1).max(64), params: z.record(z.string(), z.unknown()) }),
    CaseManifest,
  ),
  'case:remove-dataset': channel(S.extend({ datasetId: SafeId }), CaseManifest),
  'case:time-mapping-save': channel(
    S.extend({ timeMapping: CaseTimeMapping.nullable() }),
    CaseManifest,
  ),
  'case:settings': channel(z.void(), CaseDataSettings),
  'case:settings-save': channel(CaseDataSettings, CaseDataSettings),
}
