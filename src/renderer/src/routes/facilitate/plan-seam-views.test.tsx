// @vitest-environment happy-dom
// Plan seams on controller screens (#427, FR-7, FR-10): the Seam tag in the MSEL grid, the
// generated block under the inject editor's note (kept when the note is edited), the "Plan
// seam" tag and passages in the facilitator panel, and nothing of it on the presented screen.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Inject } from '@shared/schemas/inject'
import type { FacilitatorState } from '@shared/ipc'
import { MselRow, Scenario, type ScenarioSeam } from '@shared/schemas/scenario'
import { controllerBlock } from '@shared/seams'
import { viewFor } from '../../editors/msel/cell-content'
import { InjectForm } from '../../editors/inject/InjectForm'
import { draftOf, type InjectDraft } from '../../editors/inject/draft'
import { PROJECT, mockTtx, renderAt } from '../documents/test-utils'
import { projectKey } from '../../state/project'
import PresentPage from '../present/PresentPage'
import { InjectPanel } from './InjectPanel'

const seam: ScenarioSeam = {
  id: '00000000000000a1',
  slot: 'release_approver',
  slotLabel: 'Who approves public releases',
  kind: 'contradiction',
  confirmed: true,
  a: {
    documentId: 'erp',
    documentTitle: 'Emergency Response Plan',
    headingPath: 'ERP › 4.2 Releases',
    page: 3,
    chunkId: 4,
    span: 'Releases are approved by the General Manager.',
  },
  b: {
    documentId: 'cca',
    documentTitle: 'Crisis Communications Annex',
    headingPath: 'CCA › C.1 Approval',
    chunkId: 9,
    span: 'All public releases must be approved by the Public Information Officer.',
  },
}

const row = MselRow.parse({
  id: 'I-07',
  phaseId: 'P2',
  time: '1:15',
  from: 'Reporter',
  toRoleIds: ['pio'],
  event: 'Phone Call: "We run the boil notice at 6. Who signs off on your statement?"',
  expectedAction: 'PIO drafts the statement and gets it approved.',
  purposeTag: 'PRESSURE',
  seamId: seam.id,
})

const prov = { provider: 'template', createdAt: '2026-10-21T14:00:00.000Z' }
const inject = Inject.parse({
  id: 'INJ07',
  mselRowId: 'I-07',
  type: 'phone_call',
  title: 'Reporter deadline',
  deliveryMode: 'display_main_screen',
  instructorNote: `Pressure on the PIO.\n\n${controllerBlock(seam)}`,
  assets: [
    { id: 'PAGE', kind: 'image', path: 'scenarios/S/media/INJ07/PAGE.png', provenance: prov },
  ],
})

afterEach(() => cleanup())

describe('MSEL grid', () => {
  it('tags a seam row with "Seam" and both passages as its description', () => {
    render(<div>{viewFor(row, 'tag', { roles: [], phases: [], warnings: undefined, seam })}</div>)
    const tag = screen.getByText('Seam', { exact: false, selector: '.msel-editor__seam' })
    expect(tag.textContent).toContain('Plan seam: Who approves public releases')
    expect(tag.textContent).toContain('approved by the General Manager')
    expect(tag.textContent).toContain('Crisis Communications Annex › C.1 Approval')
  })

  it('shows no tag on an ordinary row', () => {
    const { container } = render(
      <div>{viewFor(row, 'tag', { roles: [], phases: [], warnings: undefined })}</div>,
    )
    expect(container.querySelector('.msel-editor__seam')).toBeNull()
  })
})

describe('inject editor note', () => {
  function Form() {
    const [draft, setDraft] = useState<InjectDraft>(draftOf(inject))
    return (
      <>
        <InjectForm
          draft={draft}
          onChange={setDraft}
          templates={[]}
          template={undefined}
          variant=""
          onVariant={() => undefined}
          issues={new Map()}
        />
        <output data-testid="stored">{draft.instructorNote}</output>
      </>
    )
  }

  it('edits only the written note and keeps the generated block', () => {
    render(<Form />)
    const note = screen.getByLabelText('Note for the controller') as HTMLTextAreaElement
    expect(note.value).toBe('Pressure on the PIO.')
    expect(screen.getByRole('group', { name: 'Plan seam note' }).textContent).toContain(
      'Generated from the plans; rebuilt when the inject is regenerated.',
    )
    fireEvent.change(note, { target: { value: 'Push for a decision within 10 minutes.' } })
    expect(screen.getByTestId('stored').textContent).toBe(
      `Push for a decision within 10 minutes.\n\n${controllerBlock(seam)}`,
    )
    fireEvent.change(note, { target: { value: '' } })
    expect(screen.getByTestId('stored').textContent).toBe(controllerBlock(seam))
  })
})

describe('facilitator panel', () => {
  const scenario = Scenario.parse({
    id: 'S1',
    projectId: 'P1',
    title: 'Seams',
    createdAt: '2026-10-28T12:00:00.000Z',
    updatedAt: '2026-10-28T12:00:00.000Z',
    brief: {},
    msel: [row],
    seams: [seam],
  })
  const state: FacilitatorState = {
    elapsedMin: 0,
    delivered: {},
    notes: {},
    generalNotes: '',
    hotwash: [],
    decisions: [],
  }
  const entry = {
    row,
    inject,
    target: 'PIO',
    thumbUrl: undefined,
    hasAudio: false,
    due: false,
    deliveredAt: undefined,
    hasNote: false,
  }
  const panel = (withSeam: boolean) =>
    render(
      <InjectPanel
        projectPath={PROJECT}
        scenario={scenario}
        state={state}
        update={() => undefined}
        exerciseTime="0:30"
        entry={entry}
        note=""
        onNote={() => undefined}
        onDeliver={() => undefined}
        onUndo={() => undefined}
        onShow={() => undefined}
        {...(withSeam ? { seam } : {})}
      />,
    )

  it('tags the inject and shows both passages to the controller', () => {
    panel(true)
    expect(screen.getByText('Plan seam')).toBeTruthy()
    const section = screen.getByRole('region', { name: 'Plan seam' })
    expect(section.textContent).toContain('Emergency Response Plan › 4.2 Releases, p. 3')
    expect(section.textContent).toContain('approved by the Public Information Officer')
    // The written note is shown once, without the block repeated as raw text.
    expect(screen.getByText('Pressure on the PIO.')).toBeTruthy()
  })

  it('shows no seam tag on an ordinary inject', () => {
    panel(false)
    expect(screen.queryByText('Plan seam')).toBeNull()
  })
})

describe('presented screen', () => {
  it('never shows the instructor note or the seam passages', async () => {
    mockTtx({
      'injects:get': () => inject,
      'facilitator:close-present': () => undefined,
    })
    renderAt(
      `/present/${projectKey(PROJECT)}/S/INJ07?asset=PAGE&title=1`,
      '/present/:projectKey/:scenarioId/:injectId',
      PresentPage,
    )
    await screen.findByRole('img')
    const text = screen.getByTestId('present').textContent ?? ''
    expect(text).toContain('Reporter deadline')
    expect(text).not.toMatch(/Plan seam|Pressure on the PIO|General Manager|Annex/)
  })
})
