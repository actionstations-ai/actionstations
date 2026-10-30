// A model's proposed row for a branch (spec 0430 FR-10). A proposal is a draft: nothing here
// or in main writes it into the scenario; a person accepts it, and the verdict is logged.
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { z } from 'zod'
import { GroundingResult } from '../schemas/grounding'
import { MselRow } from '../schemas/scenario'

export const ProposalResult = z.object({
  row: MselRow,
  /** sha256 of the row's event, expected action and format: names the proposal in the log. */
  hash: z.string(),
  /** The source check of the proposed row (#423); absent when it could not be computed. */
  grounding: GroundingResult.optional(),
})
export type ProposalResult = z.infer<typeof ProposalResult>

export function proposalHash(row: Pick<MselRow, 'event' | 'expectedAction' | 'format'>): string {
  const text = JSON.stringify([row.event, row.expectedAction, row.format ?? ''])
  return bytesToHex(sha256(utf8ToBytes(text)))
}

/** One branch of a drafted plan: its rows are proposals until a person applies them. */
export const BranchPlanBranch = z.object({
  branchId: z.string(),
  label: z.string(),
  rationale: z.string(),
  rejoinRowId: z.string().optional(),
  rows: z.array(MselRow),
})
export type BranchPlanBranch = z.infer<typeof BranchPlanBranch>

/** The result of `generate:branch-plan` (#430): drafted rows per branch and the checks run on them. */
export const BranchPlanResult = z.object({
  decisionRowId: z.string(),
  branches: z.array(BranchPlanBranch),
  /** Plain notes on what the repairs changed or dropped. */
  notes: z.array(z.string()).default([]),
  /** Branch checks (BRANCH_*) that still apply to the drafted branches. */
  warnings: z.array(z.string()).default([]),
})
export type BranchPlanResult = z.infer<typeof BranchPlanResult>
