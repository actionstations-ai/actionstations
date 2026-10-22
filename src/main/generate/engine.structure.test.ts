// The pipeline catches and repairs structural MSEL problems (#164, #167, #174): the mix pass
// stays within the phase's max row count, rows past the last phase and after ENDEX are
// re-timed, exact repeats are dropped, injects in a player's voice go through the revision
// pass (twice at most, then become facilitator prompts) and roles are capped at the audience.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { MselPhaseOutput, Scenario } from '@shared/schemas'
import type { ChatRequest } from '../providers/types'
import { FakeNciaIndex } from '../../../tests/fixtures/generate/fakes'
import { MSEL_PHASES, RUBRIC, mselResponder } from '../../../tests/fixtures/generate/stage-fixtures'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { dispatch } = await import('../ipc/registry')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: generateHandlers } = await import('../ipc/handlers/generate')
const { default: jobHandlers } = await import('../ipc/handlers/jobs')
const { jobs } = await import('../jobs/manager')
const { resetSettingsCache } = await import('../settings/store')
const { resetResolveState } = await import('../providers/resolve')
const { clearMockResponses, setMockResponse } = await import('../providers/mock/adapter')
const { MOCK_FIXTURES } = await import('../providers/mock/fixtures')
const { setPipelineDeps } = await import('./deps')
const { getScenario } = await import('../scenario/store')
const { lintScenario } = await import('./lint')

const handlers = { ...projectHandlers, ...generateHandlers, ...jobHandlers }

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

let projectPath: string

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-gen-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' }))
    .path
  const index = new FakeNciaIndex()
  setPipelineDeps({ openIndex: async () => index })
  setMockResponse('MselPhaseOutput', mselResponder)
  setMockResponse('RubricOutput', () => RUBRIC)
})
afterEach(() => {
  clearMockResponses()
  setPipelineDeps(undefined)
})

const brief = {
  userPrompt: 'AODB tampering misleads FIDS, BHS and PA',
  audience: ['Airport Operations', 'IT', 'PIO', 'Security'],
  durationHours: 4,
  phaseCount: 4,
  learningObjectives: [],
  constraints: [],
  startWallClock: '09:00',
}

async function generate() {
  const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
  const job = await jobs.wait(jobId)
  return { job, scenario: await getScenario(projectPath, scenarioId), log: jobs.logOf(jobId) }
}

type Row = MselPhaseOutput['rows'][number]
const row = (r: Partial<Row> & Pick<Row, 'id' | 'time' | 'event' | 'purposeTag'>): Row => ({
  from: 'Airline Rep',
  to: ['ops'],
  expectedAction: 'Ops responds.',
  format: 'phone_call',
  citations: [],
  ...r,
})
const userOf = (req: ChatRequest): string => req.messages[0]!.content
const phaseRows = (s: Scenario, i: number) => s.msel.filter((r) => r.phaseId === s.phases[i]!.id)
const codesOf = (s: Scenario): string[] => s.warnings.map((w) => w.code)

/** Phase 1 written at its 8-row limit, with no NOISE and nothing for the ASC. */
const FULL_PHASE_1: Row[] = [
  MSEL_PHASES[0]!.rows[0]!,
  row({
    id: 'I-01',
    time: '0:10',
    event: 'Phone Call: "B4 says Miami, the flight goes to Minneapolis."',
    purposeTag: 'CORE_NARRATIVE',
  }),
  row({
    id: 'I-02',
    time: '0:15',
    from: 'IT Helpdesk',
    to: ['it'],
    event: 'Ticket update: the AODB stream itself sends "Miami".',
    purposeTag: 'CLUE',
    format: 'helpdesk_ticket',
  }),
  row({
    id: 'I-03',
    time: '0:20',
    from: 'Social Media',
    to: ['pio'],
    event: 'Post (@gatewatcher): "B4 and the app disagree. Again."',
    purposeTag: 'PRESSURE',
    format: 'tweet',
  }),
  row({
    id: 'I-03b',
    time: '0:25',
    from: 'Local Media',
    to: ['pio'],
    event: 'Media Inquiry: Channel 3 asks why gate screens are wrong.',
    purposeTag: 'PRESSURE',
    format: 'media_inquiry',
  }),
  row({
    id: 'I-04',
    time: '0:35',
    from: 'Social Media',
    to: ['pio'],
    event: 'Post (@flyerfran): "Heard the airport got hacked??"',
    purposeTag: 'MISINFORMATION',
    format: 'tweet',
  }),
  row({
    id: 'I-04b',
    time: '0:45',
    from: 'Concessions',
    to: ['ops'],
    event: 'Phone Call: "The coffee line at A3 is blocking the walkway."',
    purposeTag: 'DISTRACTION',
  }),
  row({
    id: 'I-05a',
    time: '0:55',
    event: 'Phone Call: "Gate A7 now shows the wrong departure time too."',
    purposeTag: 'CORE_NARRATIVE',
  }),
]

describe('mix completion within the max row count (#167)', () => {
  it('rewrites spare PRESSURE rows instead of adding when the phase is full', async () => {
    const mixPrompts: string[] = []
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      const user = userOf(req)
      if (user.includes('NOW WRITE PHASE 1:')) return { rows: FULL_PHASE_1 }
      if (!user.includes('MIX COMPLETION PASS for phase 1')) return mselResponder(req)
      mixPrompts.push(user)
      return {
        rows: [
          row({
            id: 'I-03',
            time: '0:20',
            from: 'Helpdesk',
            to: ['it'],
            event: 'Ticket #5501: the break-room printer is out of toner.',
            purposeTag: 'NOISE',
            format: 'helpdesk_ticket',
          }),
          row({
            id: 'I-03b',
            time: '0:25',
            from: 'TSA',
            to: ['asc'],
            event: 'Radio Call: the checkpoint queue at B is backing into the lobby.',
            purposeTag: 'CONFUSION',
            format: 'radio_call',
          }),
          // Rows beyond what the plan asked for: the phase has no room for them.
          ...[1, 2, 3, 4, 5].map((n) =>
            row({
              id: `I-0${5 + n}`,
              time: '0:50',
              event: `Phone Call: extra row ${n} about something else entirely.`,
              purposeTag: 'NOISE',
            }),
          ),
        ],
      }
    })
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(mixPrompts).toHaveLength(1)
    expect(mixPrompts[0]).toMatch(/REWRITE these existing rows/)
    expect(mixPrompts[0]).toMatch(/Add no new rows: the phase is full/)
    const p1 = phaseRows(s, 0)
    // 60 minutes: target 5, max 8 rows; the first call already wrote 8.
    expect(p1).toHaveLength(8)
    expect(p1.find((r) => r.id === 'I-03')?.purposeTag).toBe('NOISE')
    expect(p1.find((r) => r.id === 'I-03b')?.toRoleIds).toEqual(['asc'])
    expect(p1.some((r) => /extra row/.test(r.event))).toBe(false)
    const phase1Warnings = s.warnings.filter((w) => /phase 1 /.test(w.message))
    expect(phase1Warnings.map((w) => w.code)).not.toContain('MIX_NO_NOISE')
    expect(phase1Warnings.map((w) => w.code)).not.toContain('DENSITY_HIGH')
  })
})

describe('a first call that overfills its phase (#167)', () => {
  it('is trimmed to the max row count with every role and tag still covered', async () => {
    const extra: Row[] = [
      row({
        id: 'I-04c',
        time: '0:47',
        from: 'Helpdesk',
        to: ['it'],
        event: 'Ticket #5502: the lobby kiosk printer is out of paper.',
        purposeTag: 'NOISE',
        format: 'helpdesk_ticket',
      }),
      row({
        id: 'I-04d',
        time: '0:50',
        from: 'TSA',
        to: ['asc'],
        event: 'Radio Call: the checkpoint queue at B reaches the lobby doors.',
        purposeTag: 'CONFUSION',
        format: 'radio_call',
      }),
      row({
        id: 'I-05b',
        time: '0:58',
        from: 'Social Media',
        to: ['pio'],
        event: 'Post (@runwayrick): "Third gate change in ten minutes. Anyone in charge?"',
        purposeTag: 'PRESSURE',
        format: 'tweet',
      }),
    ]
    setMockResponse('MselPhaseOutput', (req: ChatRequest) =>
      userOf(req).includes('NOW WRITE PHASE 1:')
        ? { rows: [...FULL_PHASE_1, ...extra] }
        : mselResponder(req),
    )
    const { job, scenario: s, log } = await generate()
    expect(job.status, job.error).toBe('done')
    const p1 = phaseRows(s, 0)
    expect(p1).toHaveLength(8)
    expect(p1.map((r) => r.id)).not.toEqual(expect.arrayContaining(['I-05b', 'I-03b', 'I-05a']))
    for (const id of ['ops', 'it', 'pio', 'asc'])
      expect(
        p1.some((r) => r.purposeTag !== 'STARTEX' && r.toRoleIds.includes(id)),
        id,
      ).toBe(true)
    expect(p1.some((r) => r.purposeTag === 'NOISE')).toBe(true)
    expect(log.entries.some((e) => /3 row\(s\) over the 8-row limit dropped/.test(e.message))).toBe(
      true,
    )
    expect(s.warnings.filter((w) => /phase 1 /i.test(w.message)).map((w) => w.code)).not.toContain(
      'MIX_NO_NOISE',
    )
  })
})

describe('deterministic structural repair (#174)', () => {
  it('re-times rows past the last phase, keeps ENDEX last and drops a repeated call', async () => {
    const last = MSEL_PHASES[3]!.rows
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      if (!userOf(req).includes('NOW WRITE PHASE 4:')) return mselResponder(req)
      return {
        rows: [
          ...last.filter((r) => r.id !== 'I-14' && r.id !== 'I-15'),
          row({
            id: 'I-16',
            time: '4:10',
            event: 'Email: the airline consortium wants a written root-cause summary by Friday.',
            purposeTag: 'CORE_NARRATIVE',
            format: 'email',
          }),
          row({
            id: 'I-16b',
            time: '3:50',
            event: 'Phone Call: "All gates verified. We are back to normal boarding."',
            purposeTag: 'END_GAME',
          }),
          row({
            id: 'I-15d',
            time: '3:40',
            event:
              'Phone Call from the station manager of the airline at gate B4 (angry): "If the screens show bad info again I pull my staff."',
            purposeTag: 'OPERATIONAL_FRICTION',
          }),
        ],
      }
    })
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(s.status).toBe('ready')
    expect(s.msel.at(-1)?.purposeTag).toBe('ENDEX')
    expect(s.msel.some((r) => r.id === 'I-15d')).toBe(false)
    const i16 = s.msel.find((r) => r.id === 'I-16')!
    expect(i16.time > '3:45' && i16.time <= '4:00').toBe(true)
    const codes = lintScenario(s).map((w) => w.code)
    for (const c of ['ROW_OUTSIDE_PHASE', 'ENDEX_LAST', 'DUPLICATE_EVENT', 'TIME_ORDER'])
      expect(codes, c).not.toContain(c)
    expect(codesOf(s)).not.toContain('ROW_OUTSIDE_PHASE')
  })

  it('caps the player roles at the audience list size', async () => {
    const base = MOCK_FIXTURES.ObjectivesRolesOutput as { roles: object[] }
    setMockResponse('ObjectivesRolesOutput', () => ({
      ...base,
      roles: [
        ...base.roles,
        {
          key: 'legal',
          name: 'General Counsel',
          abbreviation: 'GC',
          team: 'Team E',
          description: 'Owns legal review.',
          standingOrders: [],
        },
        {
          key: 'hr',
          name: 'Human Resources',
          abbreviation: 'HR',
          team: 'Team F',
          description: 'Owns staff welfare.',
          standingOrders: [],
        },
      ],
    }))
    const { job, scenario: s, log } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(s.roles.map((r) => r.id)).toEqual(['ops', 'it', 'pio', 'asc'])
    expect(log.entries.some((e) => /6 roles for a 4-entry audience/.test(e.message))).toBe(true)
  })
})

const VOICE = row({
  id: 'I-12d',
  time: '2:58',
  from: 'Frontline Staff',
  to: ['ops'],
  event:
    'Radio Call: "This is the Ops Director. I have made the decision to clear Concourse B now."',
  purposeTag: 'CORE_NARRATIVE',
  format: 'radio_call',
})

function withVoiceRow(revise: (req: ChatRequest) => MselPhaseOutput, seen: string[]) {
  setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
    const user = userOf(req)
    if (user.includes('REVISION PASS for phase 3')) {
      seen.push(user)
      return revise(req)
    }
    if (user.includes('NOW WRITE PHASE 3:')) return { rows: [...MSEL_PHASES[2]!.rows, VOICE] }
    return mselResponder(req)
  })
}

describe('injects in a player voice go through the revision pass (#164)', () => {
  it('sends the row with its structural note and keeps the re-sourced rewrite', async () => {
    const seen: string[] = []
    withVoiceRow(
      () => ({
        rows: [
          {
            ...VOICE,
            from: 'Airline Station Manager',
            event:
              'Phone Call: "Concourse B is packed and nobody is moving. Are you clearing it or not? I need an answer in five minutes."',
            expectedAction: 'Ops decides whether to clear Concourse B and tells ASC.',
          },
        ],
      }),
      seen,
    )
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/I-12d: Row I-12d is written in the voice of Ops Director/)
    const fixed = s.msel.find((r) => r.id === 'I-12d')!
    expect(fixed.from).toBe('Airline Station Manager')
    expect(codesOf(s)).not.toContain('INJECT_PLAYER_VOICE')
  })

  it('revises once more, then turns a row that stays in a player voice into a facilitator prompt', async () => {
    const seen: string[] = []
    withVoiceRow(() => ({ rows: [VOICE] }), seen)
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(seen).toHaveLength(2)
    const fixed = s.msel.find((r) => r.id === 'I-12d')!
    expect(fixed.event).toMatch(/^Facilitator prompt to Ops:/)
    expect(fixed.expectedAction).toMatch(/I have made the decision to clear Concourse B/)
    expect(codesOf(s)).not.toContain('INJECT_PLAYER_VOICE')
  })
})
