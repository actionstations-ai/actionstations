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

/** Which archive keys are saved (OS keychain, never a file); the keys themselves never leave main. */
export const CaseKeys = z.object({
  /** The api.data.gov key the FBI Crime Data Explorer connector uses. */
  hasFbiCdeKey: z.boolean(),
  encryptionAvailable: z.boolean(),
})
export type CaseKeys = z.infer<typeof CaseKeys>

/** One option the fetch form asks for (#1139), as the connector declares it. */
export const ConnectorOptionInfo = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'boolean', 'choice']),
  required: z.boolean().optional(),
  help: z.string().optional(),
  choices: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  example: z.union([z.string(), z.number(), z.boolean()]),
})
export type ConnectorOptionInfo = z.infer<typeof ConnectorOptionInfo>

export const ConnectorInfo = z.object({
  id: z.string(),
  label: z.string(),
  source: z.string(),
  terms: z.string(),
  hosts: z.array(z.string()),
  options: z.array(ConnectorOptionInfo).optional(),
  area: z
    .object({
      label: z.enum(['required', 'optional']).optional(),
      bbox: z.enum(['required', 'optional']).optional(),
      help: z.string().optional(),
      example: z
        .object({
          label: z.string().optional(),
          bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
        })
        .optional(),
    })
    .optional(),
  /** The archive asks for a contact address, set under Settings, Case data. */
  contact: z.literal('required').optional(),
})
export type ConnectorInfo = z.infer<typeof ConnectorInfo>

/**
 * One top-level input of a simulation as the form shows it (#1141): a text box, a date and time
 * (UTC), a number, a checkbox, a choice, a list of choices, a list of lines, or JSON for nested
 * inputs. Built in main from the generator's input schema and its labels.
 */
export const GeneratorInput = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string().optional(),
  kind: z.enum(['text', 'datetime', 'number', 'boolean', 'choice', 'choices', 'lines', 'json']),
  required: z.boolean(),
  integer: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  choices: z
    .array(z.object({ value: z.union([z.string(), z.number()]), label: z.string() }))
    .optional(),
})
export type GeneratorInput = z.infer<typeof GeneratorInput>

export const GeneratorInfo = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  toolkits: z.array(z.string()),
  inputs: z.array(GeneratorInput),
  /** A complete, valid set of inputs the form opens with. */
  example: z.record(z.string(), z.unknown()),
})
export type GeneratorInfo = z.infer<typeof GeneratorInfo>

export const caseDataChannels = {
  'case:get': channel(S, CaseSummary),
  'case:connectors': channel(z.void(), z.array(ConnectorInfo)),
  'case:generators': channel(z.void(), z.array(GeneratorInfo)),
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
  'case:keys': channel(z.void(), CaseKeys),
  /** Save the api.data.gov key in the OS keychain (refused when none is available). */
  'case:fbi-cde-key-set': channel(z.object({ key: z.string().trim().min(1).max(200) }), CaseKeys),
  'case:fbi-cde-key-remove': channel(z.void(), CaseKeys),
  'case:fbi-cde-signup-open': channel(z.void(), z.void()),
}
