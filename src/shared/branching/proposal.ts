// A model's proposed row for a branch (spec 0430 FR-10). A proposal is a draft: nothing here
// or in main writes it into the scenario; a person accepts it, and the verdict is logged.
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { z } from 'zod'
import { MselRow } from '../schemas/scenario'

export const ProposalResult = z.object({
  row: MselRow,
  /** sha256 of the row's event, expected action and format: names the proposal in the log. */
  hash: z.string(),
})
export type ProposalResult = z.infer<typeof ProposalResult>

export function proposalHash(row: Pick<MselRow, 'event' | 'expectedAction' | 'format'>): string {
  const text = JSON.stringify([row.event, row.expectedAction, row.format ?? ''])
  return bytesToHex(sha256(utf8ToBytes(text)))
}
