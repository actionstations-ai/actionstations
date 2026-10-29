// @vitest-environment happy-dom
// Transcript editor (#425): segments with times, keyboard-only quote marking and linking,
// editing with the model text kept visible, redaction through main, conflicts on save.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { HotwashListing } from '@shared/ipc'
import { HotwashSettings, Transcript, type HotwashRecording } from '@shared/schemas/hotwash'
import { FakeIpcError, mockTtx, projectUrl, renderAt } from '../documents/test-utils'
import TranscriptPage from './TranscriptPage'

const AT = '2026-10-28T14:05:00.000Z'
const recording: HotwashRecording = {
  id: 'R1',
  title: 'Hot wash',
  source: 'microphone',
  startedAt: AT,
  durationSec: 120,
  sampleRate: 16000,
  channels: 1,
  pauses: [],
  status: 'transcribed',
}
const seg = (id: string, start: number, text: string) => ({
  id,
  startSec: start,
  endSec: start + 5,
  text,
  originalText: text,
  redacted: false,
  lowConfidence: false,
})
const transcript = (revision = 4) =>
  Transcript.parse({
    id: 'T1',
    recordingId: 'R1',
    model: 'whisper-small',
    providerId: 'local-whisper',
    language: 'en',
    createdAt: AT,
    updatedAt: AT,
    complete: true,
    revision,
    segments: [
      seg('s1', 72, 'We lost twenty minutes because nobody knew who calls CISA.'),
      seg('s2', 100, 'The SimCell call helped.'),
    ],
  })

function setup(over: { save?: (req: never) => Transcript } = {}) {
  const listing = (): HotwashListing => ({
    recordings: [recording],
    transcripts: [transcript()],
    settings: HotwashSettings.parse({}),
  })
  const ttx = mockTtx({
    'hotwash:list': listing,
    'scenarios:get': () =>
      ({
        id: 'S1',
        objectives: [{ id: 'OBJ2', name: 'Communication', text: 'Notify partners.' }],
        roles: [{ id: 'ops', name: 'Ops Director' }],
      }) as never,
    'hotwash:transcript-save':
      over.save ?? ((req: { transcript: Transcript }) => ({ ...req.transcript, revision: 5 })),
    'hotwash:redact': () => {
      const t = transcript(6)
      t.segments[1] = {
        ...t.segments[1]!,
        text: '[redacted]',
        originalText: '[redacted]',
        redacted: true,
      }
      return t
    },
  } as never)
  renderAt(
    projectUrl('scenarios/S1/hotwash/R1'),
    '/p/:projectKey/scenarios/:scenarioId/hotwash/:recordingId',
    TranscriptPage,
  )
  return ttx
}

afterEach(() => cleanup())

describe('TranscriptPage', () => {
  it('lists segments with recording time and wall clock', async () => {
    setup()
    const list = await screen.findByRole('list', { name: 'Transcript segments' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('0:01:12')).toBeTruthy()
    expect(items[0]!.textContent).toMatch(/\d\d:\d\d/)
    expect(screen.getByRole('heading', { level: 1, name: 'Hot wash' })).toBeTruthy()
  })

  it('marks a quote and links an objective with the keyboard only, then saves', async () => {
    const ttx = setup()
    await screen.findByRole('list', { name: 'Transcript segments' })
    const user = userEvent.setup()
    const quote = screen.getAllByRole('checkbox', { name: 'Quote for the AAR' })[0]!
    quote.focus()
    await user.keyboard(' ')
    expect((quote as HTMLInputElement).checked).toBe(true)
    const objective = await screen.findByLabelText('Objective')
    await user.selectOptions(objective, 'OBJ2')
    await waitFor(() => expect(ttx.calls('hotwash:transcript-save').length).toBeGreaterThan(0), {
      timeout: 3000,
    })
    const saved = ttx.calls('hotwash:transcript-save').at(-1) as {
      transcript: Transcript
      revision: number
    }
    expect(saved.revision).toBe(4)
    expect(saved.transcript.segments[0]!.quote).toEqual({ objectiveIds: ['OBJ2'], rowIds: [] })
    expect(await screen.findByText('Saved')).toBeTruthy()
  })

  it('edits text and shows what the model wrote', async () => {
    setup()
    await screen.findByRole('list', { name: 'Transcript segments' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Edit text at 0:01:12' }))
    const box = screen.getByLabelText('Text at 0:01:12')
    await user.clear(box)
    await user.type(box, 'We lost 20 minutes.')
    expect(screen.getByText(/Model wrote:/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('We lost 20 minutes.')).toBeTruthy()
    expect(screen.getByText('Edited')).toBeTruthy()
  })

  it('redacts through main after a confirmation', async () => {
    const ttx = setup()
    await screen.findByRole('list', { name: 'Transcript segments' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Redact 0:01:40' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Redact' }))
    await waitFor(() => expect(ttx.calls('hotwash:redact')).toHaveLength(1))
    expect(await screen.findByText('Redacted')).toBeTruthy()
    expect(screen.queryByText('The SimCell call helped.')).toBeNull()
  })

  it('offers Reload when the transcript changed since it was opened', async () => {
    setup({
      save: () => {
        throw new FakeIpcError('CONFLICT', 'The transcript changed since you opened it.')
      },
    })
    await screen.findByRole('list', { name: 'Transcript segments' })
    const user = userEvent.setup()
    await user.click(screen.getAllByRole('checkbox', { name: 'Quote for the AAR' })[0]!)
    expect(await screen.findByRole('button', { name: 'Reload' }, { timeout: 3000 })).toBeTruthy()
  })
})
