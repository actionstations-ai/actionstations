// Regulatory clocks and compliance mapping (#426, spec 0426 §4). Regulations and frameworks come
// from packs (project copy > installed pack > bundled); the project switches them on or off.
// Firing and filing clocks is a facilitator.json update through facilitator:state-save.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { Framework, ProjectCompliance, Regulation } from '../schemas/compliance'

const P = z.object({ projectPath: z.string().min(1) })
const S = P.extend({ scenarioId: SafeId })

/** Where a regulation or framework the project uses comes from (as ProvenanceBadge shows it). */
export const ComplianceSource = z.object({
  layer: z.enum(['project', 'pack', 'bundled']),
  packId: z.string().optional(),
  packVersion: z.string().optional(),
  packName: z.string().optional(),
})
export type ComplianceSource = z.infer<typeof ComplianceSource>

export const ListedRegulation = z.object({
  regulation: Regulation,
  enabled: z.boolean(),
  /** The project's domain profile lists it by default. */
  suggested: z.boolean(),
  source: ComplianceSource,
})
export type ListedRegulation = z.infer<typeof ListedRegulation>

export const ListedFramework = z.object({
  framework: Framework,
  enabled: z.boolean(),
  suggested: z.boolean(),
  source: ComplianceSource,
})
export type ListedFramework = z.infer<typeof ListedFramework>

export const ComplianceList = z.object({
  regulations: z.array(ListedRegulation),
  frameworks: z.array(ListedFramework),
  /** The project allows model-assisted control mapping (spec 0426 FR-12). */
  modelMapping: z.boolean(),
})
export type ComplianceList = z.infer<typeof ComplianceList>

const Switches = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.boolean())

const CoverageRow = z.object({
  controlId: z.string(),
  path: z.array(z.string()),
  title: z.string(),
  rowIds: z.array(z.string()),
  suggestedOnly: z.boolean(),
  evidence: z.enum(['none', 'planned', 'delivered', 'observed']),
  references: z.array(z.string()),
  gaps: z.array(z.string()),
})

/** src/shared/compliance/coverage.ts CoverageReport, for the renderer and the AAR draft (#419). */
export const CoverageReportView = z.object({
  scenarioTitle: z.string(),
  startSource: z.enum(['brief', 'startex', 'assumed']),
  frameworks: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      shortLabel: z.string(),
      version: z.string(),
      levels: z.array(z.string()),
      rows: z.array(CoverageRow),
      gapCount: z.number(),
    }),
  ),
  clocks: z.array(
    z.object({
      cite: z.string(),
      key: z.string(),
      regulation: z.string(),
      status: z.string(),
      clock: z.string(),
      recipient: z.string(),
      triggeredAt: z.string().optional(),
      dueAt: z.string().optional(),
      filedAt: z.string().optional(),
      result: z.enum(['waiting', 'running', 'due_soon', 'overdue', 'met', 'missed', 'waived']),
      resultLabel: z.string(),
      note: z.string(),
    }),
  ),
  disclaimer: z.string(),
})

export const complianceChannels = {
  /** Every regulation and framework available to the project, enabled or not. */
  'compliance:list': channel(P, ComplianceList),
  /** Switch regulations / frameworks on or off (merged into project.json `compliance`). */
  'compliance:set': channel(
    P.extend({
      regulations: Switches.optional(),
      frameworks: Switches.optional(),
      modelMapping: z.boolean().optional(),
    }),
    ProjectCompliance,
  ),
  /** Which provider a model-assisted control mapping would use, and whether the text stays here. */
  'compliance:model-info': channel(
    P,
    z.object({ providerLabel: z.string().optional(), local: z.boolean(), reason: z.string() }),
  ),
  /**
   * Suggest controls for MSEL rows with the routed critique model (FR-12). Needs the project
   * switch. The job result is `{ suggestions: { rowId, ref }[] }`; nothing is stored.
   */
  'compliance:suggest-model': channel(
    S.extend({ rowIds: z.array(z.string().max(64)).max(200).optional() }),
    z.object({ jobId: SafeId }),
  ),
  /** The coverage matrix and clock results of one scenario (FR-13). */
  'compliance:coverage': channel(S, CoverageReportView),
}
