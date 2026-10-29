// @vitest-environment happy-dom
// The Redlines and Drills screens (#431): the diff names deleted and inserted words in text,
// a proposal is accepted from its card, the drill dialog preselects the rows that failed, and
// the runs table carries the same facts as its trend line.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Redline } from '@shared/schemas'
import { mockTtx, renderAt, PROJECT } from '../documents/test-utils'
import { CreateDrillDialog } from '../drills/CreateDrillDialog'
import { RunsTable } from '../drills/RunsTable'
import { runScore, trendText } from '../drills/drill-table'
import { DiffView } from './DiffView'
import { RedlineCard } from './RedlineCard'

afterEach(cleanup)

const redline = Redline.parse({
  id: 'r1',
  projectId: 'p1',
  source: { scenarioId: 's1', scenarioTitle: 'Flight to Nowhere' },
  target: {
    documentId: 'eop',
    documentTitle: 'EOP',
    headingPath: '6.4 Public Information',
    page: 41,
    sourceKind: 'docx',
  },
  originalExcerpt: 'The PIO may release information after consulting the IC.',
  proposedText: 'The PIO releases information after written approval from the IC.',
  rationale: 'The PIO waited 40 minutes.',
  grounding: 'review',
  by: 'ai',
  createdAt: '2026-04-13T10:00:00.000Z',
  updatedAt: '2026-04-13T10:00:00.000Z',
})

describe('DiffView', () => {
  it('marks deleted and inserted words with text a screen reader reads, not colour alone', () => {
    renderAt('/x', '/x', () => (
      <DiffView original="The PIO may release it." proposed="The PIO releases it." />
    ))
    const del = document.querySelector('del')!
    const ins = document.querySelector('ins')!
    expect(del.textContent).toContain('deleted:')
    expect(del.textContent).toContain('may')
    expect(ins.textContent).toContain('inserted:')
    expect(ins.textContent).toContain('releases')
  })
})

describe('RedlineCard', () => {
  it('shows where the change goes, why, and the grounding warning', async () => {
    mockTtx({ 'redlines:preview-tracked': () => ({ mode: 'tracked' }) })
    renderAt('/x', '/x', () => (
      <RedlineCard redline={redline} projectPath={PROJECT} selected={false} onSelect={() => {}} />
    ))
    expect(screen.getByText(/EOP › 6.4 Public Information/)).toBeTruthy()
    expect(screen.getByText(/page 41/)).toBeTruthy()
    expect(screen.getByText(/The PIO waited 40 minutes/)).toBeTruthy()
    expect(screen.getByText(/not stated in the current section/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Word: tracked changes')).toBeTruthy())
  })

  it('accepts a proposal through redlines:set-status', async () => {
    const t = mockTtx({
      'redlines:preview-tracked': () => ({ mode: 'tracked' }),
      'redlines:set-status': () => [redline],
    })
    renderAt('/x', '/x', () => (
      <RedlineCard redline={redline} projectPath={PROJECT} selected={false} onSelect={() => {}} />
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(t.calls('redlines:set-status')).toEqual([
        { projectPath: PROJECT, ids: ['r1'], to: 'accepted', note: '' },
      ]),
    )
  })

  it('only lets an accepted proposal be picked for export', () => {
    mockTtx({ 'redlines:preview-tracked': () => ({ mode: 'tracked' }) })
    renderAt('/x', '/x', () => (
      <RedlineCard redline={redline} projectPath={PROJECT} selected={false} onSelect={() => {}} />
    ))
    expect((screen.getByLabelText('Select for export') as HTMLInputElement).disabled).toBe(true)
  })
})

describe('CreateDrillDialog', () => {
  it('preselects the injects whose criteria were not met or partial', async () => {
    mockTtx({
      'drills:draft': () =>
        ({
          formatVersion: 1,
          title: 'Regression drill: Flight',
          sourceScenarioId: 's1',
          rowIds: ['I-06', 'I-09'],
          criterionIds: ['T-07'],
          correctiveActionIds: [],
          actionCriteria: {},
          redlineIds: [],
          expectedDocumentIds: [],
        }) as never,
      'scenarios:get': () =>
        ({
          msel: [
            { id: 'I-06', time: '1:15', purposeTag: 'CORE_NARRATIVE', event: 'PA goes silent' },
            { id: 'I-07', time: '1:30', purposeTag: 'CORE_NARRATIVE', event: 'Gate agents ask' },
            { id: 'I-09', time: '2:00', purposeTag: 'CORE_NARRATIVE', event: 'Go Dark' },
            { id: 'END', time: '3:45', purposeTag: 'ENDEX', event: 'ENDEX' },
          ],
        }) as never,
    })
    renderAt('/x', '/x', () => (
      <CreateDrillDialog
        projectPath={PROJECT}
        scenarios={[
          { id: 's1', title: 'Flight', status: 'draft', updatedAt: '2026-01-01T00:00:00.000Z' },
        ]}
        onClose={() => {}}
      />
    ))
    const box = async (id: string) =>
      (await screen.findByText(id, { selector: 'strong' }))
        .closest('label')!
        .querySelector('input')!
    await waitFor(async () => expect((await box('I-06')).checked).toBe(true))
    expect((await box('I-09')).checked).toBe(true)
    expect((await box('I-07')).checked).toBe(false)
    expect(screen.queryByText('ENDEX', { selector: 'strong' })).toBeNull()
  })
})

describe('RunsTable', () => {
  const runs = [
    {
      id: 'a',
      ranAt: '2026-06-10T10:00:00.000Z',
      documentHashes: {},
      criteria: [
        { rowId: 'I-06', criterionId: 'T-07', rating: 'partial' as const },
        { rowId: 'I-09', criterionId: 'T-14', rating: 'not_met' as const },
      ],
      correctiveActions: [{ id: 'CA1', verdict: 'fail' as const }],
      programRecorded: false,
    },
    {
      id: 'b',
      ranAt: '2026-09-03T10:00:00.000Z',
      documentHashes: {},
      criteria: [
        { rowId: 'I-06', criterionId: 'T-07', rating: 'met' as const },
        { rowId: 'I-09', criterionId: 'T-14', rating: 'met' as const },
      ],
      correctiveActions: [{ id: 'CA1', verdict: 'pass' as const }],
      programRecorded: false,
    },
  ]

  it('has a row per run and a column per criterion and corrective action', () => {
    renderAt('/x', '/x', () => (
      <RunsTable drill={{ runs }} actionLabel={() => 'Name an alternate approver'} />
    ))
    expect(screen.getByRole('columnheader', { name: 'I-06 T-07' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Name an alternate approver' })).toBeTruthy()
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[1]!.textContent).toContain('2026-06-10')
    expect(rows[1]!.textContent).toContain('Not met')
    expect(rows[2]!.textContent).toContain('Pass')
  })

  it('says the trend in words, the same as the line shows', () => {
    expect(runScore(runs[0]!)).toBe(0.25)
    expect(runScore(runs[1]!)).toBe(1)
    renderAt('/x', '/x', () => <RunsTable drill={{ runs }} />)
    expect(screen.getByText(trendText([0.25, 1]))).toBeTruthy()
    expect(trendText([0.25, 1])).toBe('Criteria met by run: 25%, 100%.')
  })

  it('offers to record only the runs not yet in the program', () => {
    const calls: string[] = []
    renderAt('/x', '/x', () => (
      <RunsTable
        drill={{ runs: [runs[0]!, { ...runs[1]!, programRecorded: true }] }}
        onRecordInProgram={(id) => calls.push(id)}
      />
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Record in program' }))
    expect(calls).toEqual(['a'])
    expect(screen.getByText('Recorded')).toBeTruthy()
  })
})
