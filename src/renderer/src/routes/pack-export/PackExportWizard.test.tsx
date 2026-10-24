// @vitest-environment happy-dom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PACK_CONTRIBUTION_URL } from '@shared/ipc'
import { mockTtx, renderAt } from '../documents/test-utils'
import PackExportPage from './PackExportPage'
import type { PackExportSources } from './types'

const PROJECT = '/Users/test/Projects/Metro.asproj'
const SHA = 'ab'.repeat(32)

const sources: PackExportSources = {
  templates: [{ id: 'rail_board', label: 'Rail board' }],
  prompts: [{ id: 'inject_text', label: 'inject_text' }],
  workflows: [],
  project: {
    path: PROJECT,
    name: 'Metro Line',
    domain: { id: 'transit', label: 'Transit', builtin: true },
    documents: [{ id: 'd1', title: 'Metro Plan', filename: 'plan.md' }],
    exampleSlug: 'metro-line',
  },
  appVersion: '0.3.0',
  suggestedUser: 'jdoe',
}

const built = {
  ok: true as const,
  fileName: 'io.github.jdoe.metro-kit-1.0.0.aspack',
  sha256: SHA,
  size: 2048,
  fileCount: 3,
  items: [
    {
      kind: 'templates' as const,
      id: 'rail_board',
      title: 'Rail board',
      replacesBuiltin: false,
      license: 'MIT',
      size: 1000,
    },
  ],
  skipped: [],
}

function setup() {
  return mockTtx({
    'packs:exportSources': () => sources,
    'project:list-recent': () => [
      {
        path: PROJECT,
        name: 'Metro Line',
        orgName: '',
        openedAt: '2026-01-01T00:00:00Z',
        archived: false,
      },
    ],
    'packs:exportCheck': () => built,
    'packs:exportSave': () => ({
      ...built,
      canceled: false as const,
      path: `/Users/test/${built.fileName}`,
    }),
    'packs:openContribution': () => undefined,
  })
}

afterEach(cleanup)

const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }))

describe('Export as pack wizard', () => {
  it('walks from items to share, saving through main and opening the contribution page on click', async () => {
    const ipc = setup()
    renderAt(
      `/packs/export?project=${encodeURIComponent(PROJECT)}`,
      '/packs/export',
      PackExportPage,
    )

    // 1. Items: Next stays disabled until something is chosen.
    await userEvent.click(await screen.findByRole('checkbox', { name: /Rail board/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Metro Plan/ }))
    await next()

    // 2. Metadata: the id follows the name.
    await userEvent.type(screen.getByLabelText('Name'), 'Metro Kit')
    expect(screen.getByLabelText('Pack id')).toHaveProperty('value', 'io.github.jdoe.metro-kit')
    await userEvent.type(screen.getByLabelText('Summary'), 'A kit.')
    await userEvent.type(screen.getByLabelText('Author'), 'J. Doe')
    expect(screen.getByText('0.3.0')).toBeTruthy()
    await next()

    // 3. Licenses: no default; the document needs its own; the statement is required.
    expect(screen.getByText('Choose the pack license.')).toBeTruthy()
    expect(screen.getByText('Document "Metro Plan" has no license.')).toBeTruthy()
    expect(screen.getByText(/PolyForm Internal Use/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true)
    await userEvent.click(screen.getByRole('radio', { name: /^MIT/ }))
    await userEvent.type(screen.getByLabelText('Metro Plan'), 'CC0-1.0')
    await userEvent.click(screen.getByRole('checkbox', { name: /right to redistribute/ }))
    await next()

    // 4. Review: main built and checked it.
    expect(await screen.findByText(SHA)).toBeTruthy()
    expect(ipc.calls('packs:exportCheck')[0]).toMatchObject({
      metadata: { id: 'io.github.jdoe.metro-kit', license: 'MIT', author: { name: 'J. Doe' } },
      templates: ['rail_board'],
      projectPath: PROJECT,
      documents: [{ documentId: 'd1', license: 'CC0-1.0' }],
      redistributeConfirmed: true,
    })
    await next()

    // 5. Save, 6. Share.
    await userEvent.click(screen.getByRole('button', { name: 'Save pack…' }))
    expect(await screen.findByText(`packs/files/${built.fileName}`)).toBeTruthy()
    expect(ipc.calls('packs:openContribution')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Open the contribution page' }))
    await waitFor(() => expect(ipc.calls('packs:openContribution')).toHaveLength(1))
    expect(PACK_CONTRIBUTION_URL).toBe('https://github.com/mdcrowley/actionstations-site')
  })

  it("shows the reader's problems and does not let the author continue", async () => {
    const ipc = setup()
    ipc.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'packs:exportCheck')
        return {
          ok: true,
          data: {
            ok: false,
            problems: [
              { path: 'templates/rail_board/template.html', message: '<script> is not allowed' },
            ],
          },
        }
      if (channel === 'packs:exportSources') return { ok: true, data: sources }
      return { ok: true, data: [] }
    })
    renderAt('/packs/export', '/packs/export', PackExportPage)
    await userEvent.click(await screen.findByRole('checkbox', { name: /Rail board/ }))
    await next()
    await userEvent.type(screen.getByLabelText('Name'), 'Kit')
    await userEvent.type(screen.getByLabelText('Summary'), 'A kit.')
    await userEvent.type(screen.getByLabelText('Author'), 'Me')
    await next()
    await userEvent.click(screen.getByRole('radio', { name: /CC0 1.0/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /right to redistribute/ }))
    await next()
    expect(await screen.findByText('<script> is not allowed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true)
  })
})
