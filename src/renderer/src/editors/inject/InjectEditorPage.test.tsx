// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TemplateInfo } from '@shared/ipc'
import { Inject } from '@shared/schemas/inject'
import { Scenario } from '@shared/schemas/scenario'
import { registerInjectTypes } from '@shared/taxonomy'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import ticketSchema from '../../../../../templates/injects/helpdesk_ticket/schema.json'
import tweetSchema from '../../../../../templates/injects/tweet/schema.json'
import {
  FakeIpcError,
  PROJECT,
  mockTtx,
  projectUrl,
  renderAt,
  type Handlers,
} from '../../routes/documents/test-utils'
import { useDrafts } from './draft'
import InjectEditorPage from './InjectEditorPage'

const scenario: Scenario = {
  ...Scenario.parse(fixture),
  id: 'scen1',
  msel: Scenario.parse(fixture).msel.map((r) => (r.id === 'I-04' ? { ...r, injectId: 'inj4' } : r)),
}
const template = (type: string, label: string, schema: unknown): TemplateInfo => ({
  type,
  label,
  source: 'builtin',
  version: '1',
  schema: schema as Record<string, unknown>,
  preview: {},
  paper: false,
  variants: ['default'],
  width: 600,
})
const TEMPLATES = [
  template('helpdesk_ticket', 'Helpdesk ticket', ticketSchema),
  template('tweet', 'Social post (X-style)', tweetSchema),
]
const AT = '2026-10-21T10:00:00.000Z'

function makeInject(over: Partial<Inject> = {}): Inject {
  return Inject.parse({
    id: 'inj4',
    mselRowId: 'I-04',
    type: 'helpdesk_ticket',
    title: 'Vending machines',
    fields: {
      ticketNo: '4492',
      subject: 'Vending machines',
      description: 'The Coke machines spit out all their cans.',
      status: 'Open',
    },
    versions: [
      {
        at: AT,
        by: 'ai',
        note: 'generated',
        snapshot: {
          title: 'Old title',
          type: 'helpdesk_ticket',
          fields: {},
          deliveryMode: 'hand_to_role',
        },
      },
    ],
    ...over,
  })
}

function setup(extra: Handlers = {}, inject = makeInject()) {
  let stored = inject
  const ttx = mockTtx({
    'injects:get': () => stored,
    'scenarios:get': () => scenario,
    'templates:list': () => TEMPLATES,
    'jobs:list': () => [],
    'render:preview': () => ({ dataUrl: 'data:image/png;base64,AA==', width: 600, height: 400 }),
    'injects:save': (req: { inject: Inject; note?: string }) => {
      stored = {
        ...req.inject,
        versions: [...req.inject.versions, { at: AT, by: 'user', snapshot: req.inject }],
      } as Inject
      return stored
    },
    ...extra,
  })
  renderAt(
    projectUrl('scenarios/scen1/injects/inj4'),
    '/p/:projectKey/scenarios/:scenarioId/injects/:injectId',
    InjectEditorPage,
  )
  return ttx
}

beforeEach(() => useDrafts.setState({ drafts: {} }))
afterEach(() => cleanup())

describe('InjectEditorPage', () => {
  it('edits a field, updates the preview and saves merged onto the latest stored inject', async () => {
    const ttx = setup()
    const desc = await screen.findByLabelText(/^Description/)
    await userEvent.clear(desc)
    await userEvent.type(desc, 'All cans at once')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    await waitFor(() =>
      expect(
        ttx
          .calls('render:preview')
          .some(
            (r) =>
              (r as { fields: { description?: string } }).fields.description === 'All cans at once',
          ),
      ).toBe(true),
    )
    expect(screen.getByRole('img', { name: /^Vending machines — .*, live preview$/ })).toBeTruthy()
    await userEvent.keyboard('{Meta>}s{/Meta}')
    await waitFor(() => expect(ttx.calls('injects:save')).toHaveLength(1))
    const saved = (ttx.calls('injects:save')[0] as { inject: Inject }).inject
    expect(saved.fields.description).toBe('All cans at once')
    expect(saved.versions).toHaveLength(1)
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull())
  })

  it('keeps edits on CONFLICT and saves again when the scenario job finishes', async () => {
    let attempts = 0
    const ttx = setup({
      'injects:save': (req: { inject: Inject }) => {
        attempts++
        if (attempts === 1)
          throw new FakeIpcError('CONFLICT', 'Generation is running for this scenario')
        return req.inject
      },
      'jobs:get': () => ({ id: 'J1', scenarioId: 'scen1', projectPath: PROJECT }) as never,
    })
    const title = await screen.findByLabelText('Title *')
    await userEvent.type(title, ' (edited)')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const banner = await screen.findByRole('region', { name: 'Generation status' })
    expect(within(banner).getByText(/edits are kept and will be saved automatically/)).toBeTruthy()
    expect((screen.getByLabelText('Title *') as HTMLInputElement).value).toBe(
      'Vending machines (edited)',
    )
    ttx.emit('job:done', { jobId: 'J1', kind: 'generate-injects', status: 'done' })
    await waitFor(() => expect(attempts).toBe(2))
    const saved = (ttx.calls('injects:save')[1] as { inject: Inject }).inject
    expect(saved.title).toBe('Vending machines (edited)')
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Generation status' })).toBeNull(),
    )
  })

  it('switching type remaps matching fields and warns about dropped ones', async () => {
    setup()
    const type = await screen.findByLabelText('Type')
    await userEvent.selectOptions(type, 'tweet')
    const dialog = await screen.findByRole('dialog', { name: 'Switch to Social post (X-style)?' })
    const dropped = within(dialog).getByRole('list', { name: 'Fields that will be dropped' })
    expect(
      within(dropped)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
        .sort(),
    ).toEqual(['status', 'subject', 'ticketNo'])
    await userEvent.click(within(dialog).getByRole('button', { name: /Switch and drop 3 fields/ }))
    expect((screen.getByLabelText('Text *') as HTMLTextAreaElement).value).toBe(
      'The Coke machines spit out all their cans.',
    )
    expect(screen.getByText('2 field issue(s)')).toBeTruthy()
  })

  it('the type picker lists pack templates and registered pack types (#261)', async () => {
    registerInjectTypes([
      {
        id: 'yard_radio_log',
        label: 'Yard radio log',
        category: 'voice',
        render: ['tts'],
        paper: false,
        mvp: false,
        defaultDelivery: 'play_audio',
        source: 'pack',
        pack: { id: 'ai.actionstations.freight-rail', version: '1.0.0', name: 'Freight Rail' },
      },
    ])
    try {
      const ttx = setup({
        'templates:list': () => [
          ...TEMPLATES,
          {
            ...TEMPLATES[0]!,
            type: 'rail_dispatch_board',
            label: 'Rail dispatch board',
            source: 'pack',
            packId: 'ai.actionstations.freight-rail',
            packName: 'Freight Rail',
          },
        ],
      })
      const type = await screen.findByLabelText('Type')
      const labels = within(type)
        .getAllByRole('option')
        .map((o) => o.textContent)
      expect(labels).toContain('Rail dispatch board (Pack: Freight Rail)')
      expect(labels).toContain('Yard radio log (no template)')
      expect(ttx.calls('templates:list')).toContainEqual({ projectPath: PROJECT })
    } finally {
      registerInjectTypes([])
    }
  })

  it("shows the chosen type's provenance badge next to the type picker (#269)", async () => {
    const copy = {
      ...TEMPLATES[0]!,
      source: 'project' as const,
      packId: 'ai.actionstations.freight-rail',
      packVersion: '1.0.0',
      packName: 'Freight Rail',
      copy: { edited: false, packMissing: false, updateAvailable: true, installedVersion: '1.2.0' },
    }
    setup({ 'templates:list': () => [copy, TEMPLATES[1]!] })
    const type = await screen.findByLabelText('Type')
    const badge = await screen.findByRole('img', { name: /Freight Rail/ })
    expect(badge.getAttribute('aria-label')).toBe(
      'Project copy from pack Freight Rail 1.0.0, update available (1.2.0 installed)',
    )
    expect(type.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(type.getAttribute('aria-describedby')!)?.contains(badge)).toBe(
      true,
    )
  })

  it('restores a version from the versions panel', async () => {
    const ttx = setup({
      'injects:restore-version': (req: { versionIndex: number }) =>
        makeInject({ title: `restored ${req.versionIndex}` }),
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'Versions (1)' }))
    expect(screen.getByText('generated')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Compare with editor' }))
    expect(screen.getByRole('list', { name: 'Changes from version 1 to the editor' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Restore version 1' }))
    await waitFor(() =>
      expect(ttx.calls('injects:restore-version')).toEqual([
        { projectPath: PROJECT, scenarioId: 'scen1', injectId: 'inj4', versionIndex: 0 },
      ]),
    )
  })

  it('locked injects are read-only', async () => {
    setup({}, makeInject({ locked: true }))
    expect(await screen.findByText(/This inject is locked/)).toBeTruthy()
    expect(
      (screen.getByLabelText('Title *') as HTMLInputElement).closest('fieldset[disabled]'),
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Regenerate text…' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByRole('button', { name: /Unlock/ })).toBeTruthy()
  })

  it("saves the chosen variant on the inject and previews it with the inject's images", async () => {
    const ttx = setup({
      'templates:list': () => [
        { ...TEMPLATES[0]!, variants: ['default', 'urgent'] },
        TEMPLATES[1]!,
      ],
    })
    const select = await screen.findByLabelText('Variant')
    expect((select as HTMLSelectElement).value).toBe('default')
    await userEvent.selectOptions(select, 'urgent')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    await waitFor(() =>
      expect(ttx.calls('render:preview').at(-1)).toMatchObject({
        variant: 'urgent',
        projectPath: PROJECT,
        scenarioId: 'scen1',
        injectId: 'inj4',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ttx.calls('injects:save')).toHaveLength(1))
    expect((ttx.calls('injects:save')[0] as { inject: Inject }).inject.variant).toBe('urgent')
  })

  it('shows stored warnings as they are (main clears fixed-field warnings on save)', async () => {
    const warned: Scenario = {
      ...scenario,
      warnings: [
        {
          code: 'INJECT_FIELDS_INVALID',
          severity: 'warning',
          message: 'I-04: fields still do not match',
          injectId: 'inj4',
          source: 'lint',
        },
      ],
    }
    setup({ 'scenarios:get': () => warned })
    const list = await screen.findByRole('list', { name: 'Warnings for this inject' })
    expect(within(list).getByText('INJECT_FIELDS_INVALID')).toBeTruthy()
  })

  it("shows the media job's render warning with the fields and what to do (#175)", async () => {
    const warned: Scenario = {
      ...scenario,
      warnings: [
        {
          code: 'INJECT_RENDER_INVALID',
          severity: 'warning',
          message:
            'I-04: the tweet card was not rendered; 1 field(s) do not match the template:\n- fields/handle: must match pattern',
          injectId: 'inj4',
          source: 'lint',
          suggestion: 'Fix the flagged fields in the inject editor, then render again',
        },
      ],
    }
    setup({ 'scenarios:get': () => warned })
    const list = await screen.findByRole('list', { name: 'Warnings for this inject' })
    expect(within(list).getByText('INJECT_RENDER_INVALID')).toBeTruthy()
    expect(within(list).getByText(/fields\/handle: must match pattern/)).toBeTruthy()
    expect(within(list).getByText(/Fix the flagged fields in the inject editor/)).toBeTruthy()
  })
})
