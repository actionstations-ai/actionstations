import { describe, expect, it } from 'vitest'
import { rowMatchesPrefix, ControllerRosterPayload } from '@shared/live'
import { MselRow, Scenario } from '@shared/schemas'
import type { RegionalState } from '@shared/schemas/regional'
import type { SessionLogEntry } from '@shared/schemas/live'
import { generateBundleKeys, fingerprintOf } from './keys'
import { pinKey, pinStatus } from './pinning'
import { createProposal, mergeProposals, resolveProposal } from './proposals'
import { buildRoster, sliceLogsFor, orgsWithoutLiveKey } from './session'
import { claimRows } from './apply'
import { isSharedRow, nextRevisions } from './build'

const keyA = generateBundleKeys()
const keyB = generateBundleKeys()

const state = (over: Partial<RegionalState> = {}): RegionalState => ({
  exerciseId: '01J8ZQ4F7M3N5P6R7S8T9V0W1X',
  role: 'host',
  thisOrg: 'city',
  hostOrg: 'city',
  orgs: [
    { orgId: 'city', name: 'City', prefix: 'CITY' },
    { orgId: 'air', name: 'Airport', prefix: 'AIR' },
    { orgId: 'hosp', name: 'Hospital', prefix: 'HOSP' },
  ],
  frameVersion: 1,
  final: false,
  received: {},
  shareQuotes: false,
  shareFullLog: false,
  crossOrgChannels: [],
  proposals: [],
  local: { slice: 0, rows: {}, injects: {} },
  ...over,
})

const msel = (id: string, owner?: string, extra: object = {}): MselRow =>
  MselRow.parse({
    id,
    phaseId: 'p1',
    time: '0:10',
    from: 'SimCell',
    event: 'e',
    expectedAction: 'a',
    purposeTag: 'DECISION_POINT',
    ...(owner ? { owner } : {}),
    ...extra,
  })

describe('pinning', () => {
  const signer = { orgId: 'air', prefix: 'AIR', publicKey: keyA.publicKey }
  it('pins on first use only with the right fingerprint', () => {
    const s = state()
    expect(pinStatus(s, signer)).toBe('new')
    expect(() => pinKey(s, { ...signer, confirmFingerprint: 'abcd' })).toThrow(/does not match/)
    const orgs = pinKey(s, { ...signer, confirmFingerprint: fingerprintOf(keyA.publicKey) })
    expect(pinStatus({ orgs }, signer)).toBe('pinned')
  })
  it('refuses a different key until the user says they verified it', () => {
    const pinned = pinKey(state(), {
      ...{ orgId: 'air', prefix: 'AIR', publicKey: keyA.publicKey },
      confirmFingerprint: fingerprintOf(keyA.publicKey),
    })
    const other = { orgId: 'air', prefix: 'AIR', publicKey: keyB.publicKey }
    expect(pinStatus({ orgs: pinned }, other)).toBe('changed')
    const req = { ...other, confirmFingerprint: fingerprintOf(keyB.publicKey) }
    expect(() => pinKey({ orgs: pinned }, req)).toThrow(/different key/)
    const replaced = pinKey({ orgs: pinned }, { ...req, replace: true })
    expect(pinStatus({ orgs: replaced }, other)).toBe('pinned')
  })
  it('knows no organization outside the exercise', () => {
    expect(pinStatus(state(), { orgId: 'zzz', prefix: 'ZZZ', publicKey: keyA.publicKey })).toBe(
      'unknown_org',
    )
  })
})

describe('proposals', () => {
  const scenario = {
    msel: [
      msel('AIR-I-01', 'air'),
      msel('CITY-I-01', 'city'),
      msel('AIR-I-02', 'air', { visibility: 'owner_controllers' }),
    ],
  }
  it('records a proposal only for another organization’s visible row', () => {
    const s = createProposal(state(), scenario, {
      rowId: 'AIR-I-01',
      field: 'event',
      suggested: 'New',
      reason: 'clearer',
    })
    expect(s.proposals[0]).toMatchObject({ fromOrg: 'city', toOrg: 'air', status: 'open' })
    expect(() =>
      createProposal(state(), scenario, {
        rowId: 'CITY-I-01',
        field: 'event',
        suggested: 'x',
        reason: 'r',
      }),
    ).toThrow(/own rows/)
    expect(() =>
      createProposal(state(), scenario, {
        rowId: 'AIR-I-02',
        field: 'event',
        suggested: 'x',
        reason: 'r',
      }),
    ).toThrow(/private/)
  })
  it('only the owner answers; accepting changes the owner’s row, declining changes nothing', () => {
    const proposed = createProposal(state(), scenario, {
      rowId: 'AIR-I-01',
      field: 'event',
      suggested: 'New',
      reason: 'clearer',
    })
    const mine = { ...proposed, thisOrg: 'air', role: 'participant' as const }
    const sc = { ...scenario, msel: scenario.msel } as never
    expect(() => resolveProposal(proposed, sc, proposed.proposals[0]!.id, true)).toThrow(
      /Only the organization/,
    )
    const accepted = resolveProposal(mine, sc, mine.proposals[0]!.id, true)
    expect(accepted.scenario.msel.find((r) => r.id === 'AIR-I-01')?.event).toBe('New')
    const declined = resolveProposal(mine, sc, mine.proposals[0]!.id, false, 'no')
    expect(declined.scenario.msel.find((r) => r.id === 'AIR-I-01')?.event).toBe('e')
    expect(declined.state.proposals[0]).toMatchObject({ status: 'declined', note: 'no' })
  })
  it('takes a new proposal only from its proposer and an answer only from its owner', () => {
    const p = createProposal(state(), scenario, {
      rowId: 'AIR-I-01',
      field: 'event',
      suggested: 'x',
      reason: 'r',
    }).proposals[0]!
    const base = state()
    expect(mergeProposals(base, [p], 'hosp').proposals).toEqual([])
    const added = mergeProposals(base, [p], 'city')
    const spoof = mergeProposals(added, [{ ...p, status: 'accepted' }], 'hosp')
    expect(spoof.proposals[0]?.status).toBe('open')
    expect(mergeProposals(added, [{ ...p, status: 'accepted' }], 'air').proposals[0]?.status).toBe(
      'accepted',
    )
  })
})

describe('live roster and log slices', () => {
  const live = generateBundleKeys() // any base64url point will do for shape tests below
  void live
  const point = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url')
  const s = state({
    orgs: [
      { orgId: 'city', name: 'City', prefix: 'CITY' },
      { orgId: 'air', name: 'Airport', prefix: 'AIR', liveKey: point },
      { orgId: 'hosp', name: 'Hospital', prefix: 'HOSP' },
    ],
  })
  const roles = [
    { id: 'air-ops', owner: 'air' },
    { id: 'hosp-ops', owner: 'hosp' },
    { id: 'city-ops', owner: 'city' },
  ]
  it('lists each pinned partner with its row prefix and roles, never the host', () => {
    const roster = buildRoster(s, roles, 3)
    expect(ControllerRosterPayload.safeParse(roster).success).toBe(true)
    expect(roster.controllers).toEqual([
      {
        id: 'air',
        name: 'Airport',
        publicKey: point,
        scope: {
          rowPrefixes: ['AIR'],
          roleIds: ['air-ops'],
          // Explicit and narrow: no surveys, calls or notices.
          permissions: ['inject', 'message', 'vote'],
        },
      },
    ])
    expect(orgsWithoutLiveKey(s)).toEqual(['hosp'])
  })
  it('the prefix scope matches that organization’s rows and no one else’s', () => {
    expect(rowMatchesPrefix('AIR-I-07', 'AIR')).toBe(true)
    expect(rowMatchesPrefix('AIRPORT-I-07', 'AIR')).toBe(false)
    expect(rowMatchesPrefix('CITY-I-01', 'AIR')).toBe(false)
  })
  const entry = (
    i: number,
    kind: SessionLogEntry['kind'],
    extra: Partial<SessionLogEntry> = {},
  ): SessionLogEntry => ({
    i,
    at: '2026-01-01T00:00:00.000Z',
    kind,
    actor: { kind: 'controller' },
    data: {},
    ...extra,
  })
  const log = [
    entry(1, 'session.start'),
    entry(2, 'inject.release', { ref: { rowId: 'AIR-I-01' } }),
    entry(3, 'inject.release', { ref: { rowId: 'HOSP-I-01' } }),
    entry(4, 'message', { actor: { kind: 'client', seat: { kind: 'player', roleId: 'air-ops' } } }),
    entry(5, 'message', { ref: { channel: 'unified-command' } }),
    entry(6, 'message', { ref: { channel: 'private-hosp' } }),
    entry(7, 'clock.state'),
  ]
  it('gives each organization exercise-wide events, its own rows and roles, and its channels', () => {
    const slices = sliceLogsFor(
      log,
      {
        ...s,
        crossOrgChannels: [
          { id: 'unified-command', label: 'Unified command', roleIds: ['air-ops', 'hosp-ops'] },
        ],
      },
      roles,
    )
    expect(slices.get('air')!.map((e) => e.i)).toEqual([1, 2, 4, 5, 7])
    expect(slices.get('hosp')!.map((e) => e.i)).toEqual([1, 3, 5, 7])
  })
  it('gives everyone the full log only when the frame says so', () => {
    const slices = sliceLogsFor(log, { ...s, shareFullLog: true }, roles)
    expect(slices.get('hosp')).toHaveLength(log.length)
  })
})

describe('ownership in the scenario', () => {
  it('claims unowned rows with the prefix and keeps shared rows with the host', () => {
    const scenario = Scenario.parse({
      id: 's1',
      projectId: 'p',
      title: 't',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      brief: {},
      msel: [msel('I-01'), msel('START'), msel('AIR-I-02', 'air')],
    })
    const out = claimRows(scenario, [], 'air', 'AIR', isSharedRow)
    expect(out.scenario.msel.map((r) => [r.id, r.owner])).toEqual([
      ['AIR-I-01', 'air'],
      ['START', undefined],
      ['AIR-I-02', 'air'],
    ])
  })
  it('raises a revision only when the content changed', () => {
    const first = nextRevisions(
      [
        { id: 'a', content: { x: 1 } },
        { id: 'b', content: { x: 1 } },
      ],
      {},
    )
    const second = nextRevisions(
      [
        { id: 'a', content: { x: 1 } },
        { id: 'b', content: { x: 2 } },
      ],
      first.record,
    )
    expect([...second.revisions]).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })
  it('a single-organization scenario parses and saves unchanged', () => {
    const plain = Scenario.parse({
      id: 's1',
      projectId: 'p',
      title: 't',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      brief: {},
      msel: [msel('I-01')],
    })
    expect(plain.msel[0]).not.toHaveProperty('owner')
    expect(plain.regional).toBeUndefined()
    expect(JSON.parse(JSON.stringify(plain)).msel[0]).not.toHaveProperty('revision')
  })
})
