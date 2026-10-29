// A fictional three-organization exercise for the tests (spec 0440, naming rule): a fictional
// airport authority, a city emergency management office in a real city and a fictional regional
// hospital. Names and people are made up.
import type { Frame, SharedInject, SharedRow, Slice } from '@shared/schemas/regional'

export const EXERCISE_ID = '01J8ZQ4F7M3N5P6R7S8T9V0W1X'
export const ORGS = {
  air: { orgId: 'air', name: 'Harborview Airport Authority', prefix: 'AIR' },
  city: { orgId: 'city', name: 'Cleveland Office of Emergency Management', prefix: 'CITY' },
  hosp: { orgId: 'hosp', name: 'Lakeshore Regional Hospital', prefix: 'HOSP' },
} as const

export const PHASES = [
  { id: 'p1', index: 0, title: 'Onset', goal: 'Detect', startTime: '0:00', endTime: '1:00' },
  {
    id: 'p2',
    index: 1,
    title: 'Escalation',
    goal: 'Coordinate',
    startTime: '1:00',
    endTime: '2:00',
  },
]

export function row(org: keyof typeof ORGS, n: number, over: Partial<SharedRow> = {}): SharedRow {
  const prefix = ORGS[org].prefix
  return {
    id: `${prefix}-I-${String(n).padStart(2, '0')}`,
    phaseId: 'p1',
    time: `0:${String(n * 10).padStart(2, '0')}`,
    from: 'SimCell',
    toRoleIds: [`${org}-ops`],
    event: `${prefix} event ${n}`,
    expectedAction: `${prefix} action ${n}`,
    purposeTag: 'DECISION_POINT',
    citations: [],
    owner: org,
    revision: 1,
    visibility: 'exercise',
    ...over,
  } as SharedRow
}

export function inject(
  org: keyof typeof ORGS,
  n: number,
  over: Partial<SharedInject> = {},
): SharedInject {
  const r = row(org, n)
  return {
    id: `inj-${org}-${n}`,
    mselRowId: r.id,
    type: 'email',
    title: `${ORGS[org].prefix} notice ${n}`,
    deliveryMode: 'hand_to_role',
    fields: { subject: 'Notice', body: 'Please acknowledge.' },
    citations: [],
    assets: [],
    includeInDeck: true,
    owner: org,
    revision: 1,
    ...over,
  }
}

export function frame(over: Partial<Frame> = {}): Frame {
  return {
    title: 'Lakefront Regional Tabletop',
    hostOrg: 'city',
    orgs: Object.values(ORGS),
    overview: { theme: 'Power loss', threat: 'Grid failure', operationalImpact: 'Terminal dark' },
    objectives: [{ id: 'o1', name: 'Coordination', text: 'Coordinate across agencies' }],
    phases: PHASES,
    roles: (Object.keys(ORGS) as (keyof typeof ORGS)[]).map((org) => ({
      id: `${org}-ops`,
      name: `${ORGS[org].prefix} Operations`,
      abbreviation: '',
      team: '',
      description: '',
      standingOrders: [],
      owner: org,
    })),
    sharedRows: [],
    crossOrgChannels: [],
    shareFullLog: false,
    ...over,
  }
}

export function slice(
  org: keyof typeof ORGS,
  revision = 1,
  rows: SharedRow[] = [row(org, 1)],
): Slice {
  return {
    orgId: org,
    revision,
    frameVersion: 1,
    roles: [],
    rows,
    injects: rows
      .filter((r) => r.visibility === 'exercise')
      .map((r) => inject(org, Number(r.id.slice(-2)))),
    proposals: [],
  }
}
