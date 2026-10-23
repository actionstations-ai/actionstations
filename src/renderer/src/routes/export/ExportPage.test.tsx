// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { PROJECT, mockTtx, projectUrl, renderAt } from '../documents/test-utils'
import ExportPage from './ExportPage'
import { defaultOutDir } from './targets'

const scenario = Scenario.parse(fixture)

function setup() {
  const ttx = mockTtx({
    'scenarios:get': () => scenario,
    'injects:list': () => [],
    'scenarios:lint': () => [],
    'export:preview-html': () => ({ html: '<p>preview</p>' }),
    'export:run': () => ({ jobId: 'EXP1' }),
    'dialog:open-directory': () => '/Users/test/Desktop',
  })
  renderAt(
    projectUrl('scenarios/scenario-3/export'),
    '/p/:projectKey/scenarios/:scenarioId/export',
    ExportPage,
  )
  return ttx
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('ExportPage (#238)', () => {
  it('defaults the output folder to <project>/exports so Export works straight away', async () => {
    const ttx = setup()
    const folder = (await screen.findByLabelText('Output folder')) as HTMLInputElement
    expect(folder.value).toBe(`${PROJECT}/exports`)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await waitFor(() =>
      expect(ttx.calls('export:run')[0]).toMatchObject({ outDir: `${PROJECT}/exports` }),
    )
  })

  it('remembers the folder chosen for this project', async () => {
    setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Choose…' }))
    await waitFor(() =>
      expect((screen.getByLabelText('Output folder') as HTMLInputElement).value).toBe(
        '/Users/test/Desktop',
      ),
    )
    cleanup()
    setup()
    expect(((await screen.findByLabelText('Output folder')) as HTMLInputElement).value).toBe(
      '/Users/test/Desktop',
    )
  })

  it('summarizes missing and unrendered injects before exporting', async () => {
    setup()
    const bar = await screen.findByRole('group', { name: 'Export' })
    expect(await within(bar).findByText(/24 of 24 events have no inject yet/)).toBeTruthy()
    expect(within(bar).getByRole('link', { name: 'Write the missing injects' })).toBeTruthy()
  })

  it('builds the default folder with the platform separator', () => {
    expect(defaultOutDir('/a/b/')).toBe('/a/b/exports')
    expect(defaultOutDir('C:\\Projects\\Dam')).toBe('C:\\Projects\\Dam\\exports')
  })
})
