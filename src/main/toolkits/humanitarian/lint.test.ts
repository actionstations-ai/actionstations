// The pure humanitarian checks and the field lint rules that wrap them (spec 0469 FR-7).
import { describe, expect, it } from 'vitest'
import { fieldLintIssues } from '../lint-rules'
import {
  checkClusterActivation,
  checkFundingArithmetic,
  checkGapList,
  checkMovementDecision,
  checkSavingLivesTogether,
  checkSecurityGuardrail,
} from './lint'

describe('cluster activation statements', () => {
  it('flags a Humanitarian Coordinator who activates clusters', () => {
    expect(
      checkClusterActivation('The Humanitarian Coordinator activated the clusters today.'),
    ).toHaveLength(1)
    expect(checkClusterActivation('Clusters were activated by the HC on Monday.')).toHaveLength(1)
  })
  it('accepts a request by the HC and a decision by the Emergency Relief Coordinator', () => {
    expect(
      checkClusterActivation(
        'The HC requested cluster activation; the Emergency Relief Coordinator decided.',
      ),
    ).toEqual([])
  })
  it('flags cluster activation in a refugee setting but not its refusal', () => {
    expect(
      checkClusterActivation('In the refugee camp, clusters are activated for health.'),
    ).toHaveLength(1)
    expect(
      checkClusterActivation(
        'The refugee response is not cluster-led; the refugee agency coordinates.',
      ),
    ).toEqual([])
  })
})

describe('Saving Lives Together', () => {
  it('flags the UN taking responsibility for an NGO security', () => {
    expect(checkSavingLivesTogether('The UN is responsible for NGO staff security.')).toHaveLength(
      1,
    )
    expect(
      checkSavingLivesTogether('Participation does not make the UN responsible for NGO security.'),
    ).toEqual([])
  })
})

describe('security guardrail', () => {
  it('flags ransom amounts, negotiation tactics and evasion technique', () => {
    expect(checkSecurityGuardrail('The group demanded a ransom of US$ 50,000.')).toHaveLength(1)
    expect(checkSecurityGuardrail('Use negotiation tactics such as anchoring.')).toHaveLength(1)
    expect(checkSecurityGuardrail('Staff learn how to escape detention.')).toHaveLength(1)
  })
  it('accepts decisions and communications', () => {
    expect(
      checkSecurityGuardrail(
        'The crisis management team stopped movements and the family liaison officer called the family.',
      ),
    ).toEqual([])
  })
})

describe('gap list', () => {
  const gaps = [
    { id: 'G-1', status: 'unassigned' },
    { id: 'G-2', status: 'assigned', owner: 'A' },
    { id: 'G-3', status: 'covered' },
  ]
  it('requires a partner for assigned and covered lines', () => {
    expect(checkGapList(gaps).map((p) => p.message)).toEqual([
      'Gap G-3 is covered but names no partner.',
    ])
  })
  it('compares the summary with the lines', () => {
    const msgs = checkGapList(gaps, '4 gaps: 2 unassigned, 1 assigned, 1 covered').map(
      (p) => p.message,
    )
    expect(msgs.join(' ')).toMatch(/2 unassigned but the list has 1/)
    expect(msgs.join(' ')).toMatch(/4 gaps but the list has 3/)
    expect(checkGapList([{ id: 'a', status: 'unassigned' }], '1 gaps: 1 unassigned')).toEqual([])
  })
})

describe('funding arithmetic', () => {
  it('accepts consistent totals and flags a wrong gap or percentage', () => {
    expect(
      checkFundingArithmetic({
        required: '62.0',
        received: '21.7',
        gap: '40.3',
        percentFunded: '35%',
      }),
    ).toEqual([])
    expect(
      checkFundingArithmetic({
        required: '62.0',
        received: '21.7',
        gap: '30.0',
        percentFunded: '60%',
      }),
    ).toHaveLength(2)
  })
})

describe('movement decision', () => {
  it('needs a decider and conditions for a conditional approval', () => {
    expect(checkMovementDecision({ decision: 'approved' })).toHaveLength(1)
    expect(checkMovementDecision({ decision: 'conditional', decidedBy: 'SEC' })).toHaveLength(1)
    expect(checkMovementDecision({ decision: 'pending' })).toEqual([])
  })
})

describe('registered rules', () => {
  it('runs on the inject types they read', () => {
    const issues = fieldLintIssues('humanitarian_gap_list', {
      summary: '2 gaps: 2 unassigned',
      gaps: [
        { id: 'G-1', status: 'unassigned' },
        { id: 'G-2', status: 'assigned', owner: 'A' },
      ],
    })
    expect(issues.map((i) => i.message).join(' ')).toMatch(/2 unassigned but the list has 1/)
    expect(
      fieldLintIssues('humanitarian_security_alert', { summary: 'A ransom of $5,000 was asked.' }),
    ).toHaveLength(1)
  })
})
