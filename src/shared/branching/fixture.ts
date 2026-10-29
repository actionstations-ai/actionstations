import type { DecisionRecord } from '../ipc/facilitator'
// A small branched scenario shared by the branching tests: one trunk, a decision with two
// branches, and a nested decision inside the second branch.
import type { Branch, Decision } from '../schemas/scenario'
import { MselRow } from '../schemas/scenario'

export function mselRow(id: string, time: string, extra: Partial<MselRow> = {}): MselRow {
  return MselRow.parse({
    id,
    phaseId: 'p1',
    time,
    from: 'SimCell',
    toRoleIds: [],
    event: `Event ${id}`,
    expectedAction: 'Act',
    purposeTag: 'CORE_NARRATIVE',
    ...extra,
  })
}

export const D1: Decision = {
  id: 'd1',
  question: 'Pay the ransom or rebuild?',
  options: [
    { id: 'pay', label: 'Pay', description: '', branchId: 'b1' },
    { id: 'rebuild', label: 'Rebuild', description: '', branchId: 'b2' },
  ],
  mode: 'anonymous',
  rule: { kind: 'majority' },
  defaultOptionId: 'rebuild',
  votingRoleIds: [],
}

export const D2: Decision = {
  id: 'd2',
  question: 'Notify the public now?',
  options: [
    { id: 'now', label: 'Now', description: '', branchId: 'b3' },
    { id: 'later', label: 'Later', description: '' },
  ],
  mode: 'anonymous',
  rule: { kind: 'plurality' },
  defaultOptionId: 'later',
  votingRoleIds: [],
}

export const BRANCHES: Branch[] = [
  { id: 'b1', label: 'Pay', decisionId: 'd1', optionId: 'pay', rejoinRowId: 'I-16', rationale: '' },
  {
    id: 'b2',
    label: 'Rebuild',
    decisionId: 'd1',
    optionId: 'rebuild',
    rejoinRowId: 'I-16',
    rationale: '',
  },
  {
    id: 'b3',
    label: 'Now',
    decisionId: 'd2',
    optionId: 'now',
    rejoinRowId: 'I-14b',
    rationale: '',
  },
]

export function branchedScenario(): {
  msel: MselRow[]
  branches: Branch[]
  roles: never[]
} {
  return {
    roles: [],
    branches: BRANCHES.map((b) => ({ ...b })),
    msel: [
      mselRow('START', '0:00', { purposeTag: 'STARTEX' }),
      mselRow('I-10', '1:30', { purposeTag: 'DECISION_POINT', decision: D1 }),
      mselRow('I-11a', '1:40', { branchId: 'b1' }),
      mselRow('I-12a', '1:55', { branchId: 'b1' }),
      mselRow('I-11b', '1:40', { branchId: 'b2' }),
      mselRow('I-11c', '1:50', { branchId: 'b2', purposeTag: 'DECISION_POINT', decision: D2 }),
      mselRow('I-12b', '1:55', { branchId: 'b3' }),
      mselRow('I-14b', '2:00', { branchId: 'b2' }),
      mselRow('I-16', '2:05'),
      mselRow('END', '2:30', { purposeTag: 'ENDEX' }),
    ],
  }
}

export const record = (
  decisionId: string,
  optionId: string,
  extra: Partial<DecisionRecord> = {},
): DecisionRecord => ({
  decisionId,
  optionId,
  by: 'vote',
  rule: { kind: 'majority' },
  input: { tally: {}, cast: 0 },
  at: '2026-01-01T00:00:00.000Z',
  exerciseTime: '1:30',
  note: '',
  ...extra,
})
