// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Survey } from '@shared/schemas/survey'
import { mockTtx } from '../documents/test-utils'
import { PaperEntryForm } from './PaperEntryForm'
import { SurveyPreview } from './SurveyPreview'

const NOW = '2026-10-28T14:00:00.000Z'
const survey = Survey.parse({
  id: 'FEEDBACK',
  title: 'Participant Feedback Form',
  askRoleGroup: true,
  roleGroups: ['Operations', 'Communications'],
  createdAt: NOW,
  updatedAt: NOW,
  sections: [
    {
      id: 's',
      title: 'Part I',
      questions: [
        {
          id: 'structure',
          type: 'rating',
          text: 'The exercise was well structured.',
          required: true,
          pointLabels: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        },
        { id: 'change', type: 'text', text: 'What would you change?', long: true },
      ],
    },
  ],
})

afterEach(() => cleanup())

function renderEntry() {
  const ttx = mockTtx({
    'surveys:add-response': () => ({ responseId: 'R1', count: 1 }),
  })
  render(<PaperEntryForm projectPath="/p" scenarioId="SC" survey={survey} />)
  return ttx
}

describe('PaperEntryForm', () => {
  it('shows each scale point as a labelled radio button', () => {
    renderEntry()
    const group = screen.getByRole('group', { name: /1\. The exercise was well structured/ })
    expect(group).toBeTruthy()
    expect(screen.getByRole('radio', { name: /4\s*Agree/ })).toBeTruthy()
  })

  it('will not save until the required questions are answered', async () => {
    const ttx = renderEntry()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save response' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/required questions/)
    expect(ttx.calls('surveys:add-response')).toHaveLength(0)
    const group = screen.getByRole('group', { name: /well structured/ })
    expect(group.getAttribute('aria-invalid')).toBe('true')
  })

  it('can be completed and saved from the keyboard alone, the team left optional', async () => {
    const ttx = renderEntry()
    const user = userEvent.setup()
    await user.tab() // team select
    await user.tab() // first scale point
    await user.keyboard('[ArrowRight][ArrowRight][ArrowRight]') // to 4
    await user.tab()
    await user.keyboard('More time for the PIO inject')
    await user.tab() // Save response
    await user.keyboard('[Enter]')
    await waitFor(() => expect(ttx.calls('surveys:add-response')).toHaveLength(1))
    expect(ttx.calls('surveys:add-response')[0]).toEqual({
      projectPath: '/p',
      scenarioId: 'SC',
      surveyId: 'FEEDBACK',
      response: {
        channel: 'paper',
        answers: { structure: 4, change: 'More time for the PIO inject' },
        otherText: {},
      },
    })
    expect((await screen.findByRole('status')).textContent).toMatch(/1 response so far/)
    expect((screen.getByRole('radio', { name: /4\s*Agree/ }) as HTMLInputElement).checked).toBe(
      false,
    )
  })

  it('sends the chosen team when one is picked', async () => {
    const ttx = renderEntry()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText(/Which team were you on/), 'Operations')
    await user.click(screen.getByRole('radio', { name: /5\s*Strongly agree/ }))
    await user.click(screen.getByRole('button', { name: 'Save response' }))
    await waitFor(() => expect(ttx.calls('surveys:add-response')).toHaveLength(1))
    const req = ttx.calls('surveys:add-response')[0] as { response: { roleGroup?: string } }
    expect(req.response.roleGroup).toBe('Operations')
  })
})

describe('SurveyPreview', () => {
  it('shows the survey as participants see it and checks required answers', async () => {
    render(<SurveyPreview survey={survey} />)
    expect(screen.getByRole('heading', { name: 'Participant Feedback Form' })).toBeTruthy()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(screen.getByText('1 required question has no answer.')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: /3\s*Neutral/ }))
    await user.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(screen.getByText('All required questions are answered.')).toBeTruthy()
  })
})
