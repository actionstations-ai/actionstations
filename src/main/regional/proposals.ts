// Proposed changes to rows another organization owns (spec 0440 FR-13). A proposal travels in
// the proposer's next slice; the owner accepts it (the change is applied to the owner's own row)
// or declines it with a note.
import { randomUUID } from 'node:crypto'
import { MselRow, type Scenario } from '@shared/schemas'
import { Proposal, type RegionalState } from '@shared/schemas/regional'
import { AppError } from '../lib/errors'

export interface ProposalInput {
  rowId: string
  field: Proposal['field']
  suggested: Proposal['suggested']
  reason: string
}

export function createProposal(
  state: RegionalState,
  scenario: Pick<Scenario, 'msel'>,
  input: ProposalInput,
): RegionalState {
  const row = scenario.msel.find((r) => r.id === input.rowId)
  if (!row?.owner) throw new AppError('NOT_FOUND', `Row ${input.rowId} is not in this exercise.`)
  if (row.owner === state.thisOrg)
    throw new AppError(
      'VALIDATION',
      'You can edit your own rows directly; propose changes to other organizations’ rows.',
    )
  if (row.visibility === 'owner_controllers')
    throw new AppError('VALIDATION', 'This row is private to its owner’s controllers.')
  const proposal = Proposal.parse({
    id: `prop-${randomUUID().slice(0, 12)}`,
    ...input,
    fromOrg: state.thisOrg,
    toOrg: row.owner,
    status: 'open',
  })
  return { ...state, proposals: [...state.proposals, proposal] }
}

/** Value written to the row when a proposal is accepted (field types differ). */
function applyField(row: MselRow, p: Proposal): MselRow {
  switch (p.field) {
    case 'toRoleIds':
      if (!Array.isArray(p.suggested))
        throw new AppError('VALIDATION', 'Suggested roles must be a list.')
      return { ...row, toRoleIds: p.suggested }
    case 'time':
      return MselRow.parse({ ...row, time: p.suggested })
    default:
      if (typeof p.suggested !== 'string')
        throw new AppError('VALIDATION', 'Suggested value must be text.')
      return { ...row, [p.field]: p.suggested }
  }
}

/** The owner accepts or declines. Accepting changes the owner's own row; nothing else. */
export function resolveProposal(
  state: RegionalState,
  scenario: Scenario,
  id: string,
  accept: boolean,
  note?: string,
): { state: RegionalState; scenario: Scenario } {
  const p = state.proposals.find((x) => x.id === id)
  if (!p) throw new AppError('NOT_FOUND', 'That proposal is not here.')
  if (p.toOrg !== state.thisOrg)
    throw new AppError(
      'FORBIDDEN',
      'Only the organization that owns the row can answer a proposal.',
    )
  if (p.status !== 'open') throw new AppError('CONFLICT', 'That proposal was already answered.')
  let msel = scenario.msel
  if (accept) {
    const row = msel.find((r) => r.id === p.rowId && r.owner === state.thisOrg)
    if (!row) throw new AppError('NOT_FOUND', `Row ${p.rowId} is no longer yours to change.`)
    msel = msel.map((r) => (r === row ? applyField(row, p) : r))
  }
  const resolved: Proposal = {
    ...p,
    status: accept ? 'accepted' : 'declined',
    ...(note ? { note } : {}),
  }
  return {
    scenario: { ...scenario, msel },
    state: { ...state, proposals: state.proposals.map((x) => (x.id === id ? resolved : x)) },
  }
}

/**
 * Add proposals that arrived in the slice of `sourceOrg`. A new proposal must come from its
 * proposer; an answer (accepted or declined) replaces an open copy only when its owner sent it.
 */
export function mergeProposals(
  state: RegionalState,
  incoming: Proposal[],
  sourceOrg: string,
): RegionalState {
  const byId = new Map(state.proposals.map((p) => [p.id, p]))
  for (const p of incoming) {
    const have = byId.get(p.id)
    if (!have && p.fromOrg === sourceOrg) byId.set(p.id, p)
    else if (have?.status === 'open' && p.status !== 'open' && sourceOrg === have.toOrg)
      byId.set(p.id, { ...have, status: p.status, ...(p.note ? { note: p.note } : {}) })
  }
  return { ...state, proposals: [...byId.values()] }
}
