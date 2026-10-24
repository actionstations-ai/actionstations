// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { TemplateInfo } from '@shared/ipc'
import { builtinProfile, registerPackProfiles } from '@shared/domains'
import TemplatesPage from './TemplatesPage'
import { categoriesPresent, filterTemplates, fitsDomain, schemaFields } from './gallery'
import { mockTtx, PROJECT, renderAt } from '../documents/test-utils'
import { useProjectUi } from '../../state/project'

const TIME_JUMP: TemplateInfo = {
  type: 'time_jump_card',
  label: 'Time jump card',
  version: '1',
  schema: {
    type: 'object',
    required: ['newTime'],
    properties: {
      exerciseTime: { type: 'string', description: 'Exercise clock' },
      newTime: { type: 'string', description: 'Wall-clock time players jump to' },
      worldState: { type: 'array', items: { type: 'string' } },
    },
  },
  preview: { newTime: '10:00 AM' },
  paper: true,
  variants: ['default'],
  width: 816,
  height: 1056,
  source: 'builtin',
}

const TWEET: TemplateInfo = {
  type: 'tweet',
  label: 'Tweet / X post',
  version: '2',
  schema: { type: 'object', properties: { theme: { enum: ['light', 'dark'] } } },
  preview: { text: 'hi' },
  paper: false,
  variants: ['light', 'dark'],
  width: 600,
  source: 'builtin',
}

const FIDS: TemplateInfo = { ...TWEET, type: 'fids_board', label: 'FIDS board', variants: [] }

afterEach(() => {
  cleanup()
  useProjectUi.setState({ projectPath: null })
})

const setup = () =>
  mockTtx({
    'templates:list': () => [TIME_JUMP, TWEET],
    'render:preview': (req: { type: string; variant?: string }) => ({
      dataUrl: `data:image/png;base64,${req.type}-${req.variant ?? 'none'}`,
      width: 100,
      height: 100,
    }),
  })

describe('TemplatesPage', () => {
  it('shows every template rendered from its preview data and filters by category', async () => {
    const ttx = setup()
    renderAt('/templates', '/templates', TemplatesPage)
    const grid = await screen.findByRole('list', { name: '2 templates' })
    expect(within(grid).getAllByRole('listitem')).toHaveLength(2)
    await waitFor(() =>
      expect(ttx.calls('render:preview')).toEqual(
        expect.arrayContaining([
          { type: 'time_jump_card', fields: { newTime: '10:00 AM' }, scale: 0.5 },
          { type: 'tweet', fields: { text: 'hi' }, scale: 0.5 },
        ]),
      ),
    )
    const user = userEvent.setup()
    const filter = screen.getByRole('group', { name: 'Category' })
    await user.click(within(filter).getByRole('button', { name: 'Facilitator control' }))
    const filtered = await screen.findByRole('list', { name: '1 templates' })
    expect(within(filtered).getByText('Time jump card')).toBeTruthy()
  })

  it('opens a detail view with schema fields and a variant switcher', async () => {
    const ttx = setup()
    renderAt('/templates', '/templates', TemplatesPage)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Tweet \/ X post/ }))
    const detail = await screen.findByRole('region', { name: 'Tweet / X post' })
    expect(within(detail).getByRole('rowheader', { name: /theme/ })).toBeTruthy()
    expect(within(detail).getByText('one of light, dark')).toBeTruthy()
    const variants = within(detail).getByRole('group', { name: 'Variant' })
    await user.click(within(variants).getByRole('button', { name: 'dark' }))
    await waitFor(() =>
      expect(ttx.calls('render:preview')).toContainEqual({
        type: 'tweet',
        fields: { text: 'hi' },
        scale: 1,
        variant: 'dark',
      }),
    )
    const img = await within(detail).findByRole('img', { name: 'Tweet / X post preview (dark)' })
    expect(img.getAttribute('src')).toContain('tweet-dark')
    await user.click(within(detail).getByRole('button', { name: /All templates/ }))
    expect(await screen.findByRole('list', { name: '2 templates' })).toBeTruthy()
  })

  it('badges pack templates and project copies with their provenance (#261, #269)', async () => {
    useProjectUi.setState({ projectPath: PROJECT })
    const PACK_TWEET: TemplateInfo = {
      ...TWEET,
      source: 'pack',
      packId: 'org.example.social',
      packVersion: '1.0.0',
      packName: 'Social Extras',
      replaces: 'builtin',
    }
    const BOARD: TemplateInfo = {
      ...TWEET,
      type: 'rail_dispatch_board',
      label: 'Rail dispatch board',
      variants: [],
      source: 'project',
      packId: 'ai.actionstations.freight-rail',
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
      copy: { edited: true, packMissing: true, updateAvailable: false },
    }
    const ttx = mockTtx({
      'templates:list': () => [PACK_TWEET, BOARD],
      'render:preview': () => ({ dataUrl: 'data:image/png;base64,x', width: 1, height: 1 }),
      'project:get': () => ({ path: PROJECT, project: { orgType: 'airport' } }) as never,
    })
    renderAt('/templates', '/templates', TemplatesPage)
    const grid = await screen.findByRole('list', { name: '2 templates' })
    const pack = within(grid).getByRole('img', { name: /Social Extras/ })
    expect(pack.getAttribute('aria-label')).toBe('From pack Social Extras 1.0.0')
    expect(pack.textContent).toBe('Pack: Social Extras 1.0.0')
    expect(within(grid).getByText('replaces built-in')).toBeTruthy()
    const copy = within(grid).getByRole('img', { name: /Freight Rail Operations/ })
    expect(copy.getAttribute('aria-label')).toBe(
      'Project copy from pack Freight Rail Operations 1.0.0, edited, pack not installed',
    )
    expect(copy.textContent).toBe('From Freight Rail Operations 1.0.0editednot installed')
    expect(ttx.calls('templates:list')).toContainEqual({ projectPath: PROJECT })
    // The project's template previews through the project's layer.
    await waitFor(() =>
      expect(ttx.calls('render:preview')).toContainEqual(
        expect.objectContaining({ type: 'rail_dispatch_board', projectPath: PROJECT }),
      ),
    )
  })

  it('updates a project copy from its pack, confirming first when it is edited (#310)', async () => {
    useProjectUi.setState({ projectPath: PROJECT })
    const BOARD: TemplateInfo = {
      ...TWEET,
      type: 'rail_dispatch_board',
      label: 'Rail dispatch board',
      variants: [],
      source: 'project',
      packId: 'ai.actionstations.freight-rail',
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
      copy: { edited: true, packMissing: false, updateAvailable: true, installedVersion: '1.1.0' },
    }
    const ttx = mockTtx({
      'templates:list': () => [BOARD, TWEET],
      'render:preview': () => ({ dataUrl: 'data:image/png;base64,x', width: 1, height: 1 }),
      'project:get': () => ({ path: PROJECT, project: { orgType: 'airport' } }) as never,
      'templates:updateFromPack': () => ({
        ...BOARD,
        packVersion: '1.1.0',
        copy: { edited: false, packMissing: false, updateAvailable: false },
      }),
    })
    renderAt('/templates?type=tweet', '/templates', TemplatesPage)
    await screen.findByRole('region', { name: 'Tweet / X post' })
    expect(screen.queryByRole('button', { name: 'Update from pack' })).toBeNull()
    cleanup()

    renderAt('/templates?type=rail_dispatch_board', '/templates', TemplatesPage)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Update from pack' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard your edits?' })
    expect(dialog.textContent).toMatch(
      /copy of “Rail dispatch board” has been edited.*Freight Rail Operations 1\.1\.0.*edits are discarded/,
    )
    expect(ttx.calls('templates:updateFromPack')).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'Discard edits and update' }))
    await waitFor(() =>
      expect(ttx.calls('templates:updateFromPack')).toEqual([
        { projectPath: PROJECT, type: 'rail_dispatch_board', confirmEdited: true },
      ]),
    )
  })

  it('offers the domain profiles of installed packs as domain filters (#273)', async () => {
    const transit = builtinProfile('transit')
    registerPackProfiles([
      {
        profile: { ...transit, id: 'freight_rail', label: 'Freight rail', aliases: [] },
        packId: 'ai.actionstations.freight-rail',
        packVersion: '1.0.0',
        packName: 'Freight Rail Operations',
      },
    ])
    try {
      setup()
      renderAt('/templates', '/templates', TemplatesPage)
      const domains = await screen.findByRole('group', { name: 'Domain' })
      expect(within(domains).getByRole('button', { name: 'Freight rail' })).toBeTruthy()
      expect(within(domains).getByRole('button', { name: 'Airport' })).toBeTruthy()
    } finally {
      registerPackProfiles([])
    }
  })

  it('shows render errors in place of the preview', async () => {
    mockTtx({
      'templates:list': () => [TIME_JUMP],
      'render:preview': () => {
        throw new Error('Render timed out after 15000 ms')
      },
    })
    renderAt('/templates', '/templates', TemplatesPage)
    expect((await screen.findByRole('alert')).textContent).toMatch(/timed out/)
  })
})

describe('TemplatesPage domain filter', () => {
  const setupDomains = (orgType?: string) => {
    if (orgType) useProjectUi.setState({ projectPath: PROJECT })
    return mockTtx({
      'templates:list': () => [TIME_JUMP, TWEET, FIDS],
      'render:preview': () => ({ dataUrl: 'data:image/png;base64,x', width: 1, height: 1 }),
      'project:get': () => ({ path: PROJECT, project: { orgType } }) as never,
    })
  }

  it('shows every domain with no project open and marks domain-only templates', async () => {
    setupDomains()
    renderAt('/templates', '/templates', TemplatesPage)
    const grid = await screen.findByRole('list', { name: '3 templates' })
    expect(within(grid).getByText('Airport only')).toBeTruthy()
    const domains = screen.getByRole('group', { name: 'Domain' })
    const all = within(domains).getByRole('button', { name: 'All domains' })
    expect(all.getAttribute('aria-pressed')).toBe('true')
    const user = userEvent.setup()
    await user.click(within(domains).getByRole('button', { name: 'Dam / water authority' }))
    expect(await screen.findByRole('list', { name: '2 templates' })).toBeTruthy()
    expect(screen.queryByText('FIDS board')).toBeNull()
  })

  it("defaults to the open project's domain; All domains shows the rest", async () => {
    setupDomains('bus')
    renderAt('/templates', '/templates', TemplatesPage)
    const domains = await screen.findByRole('group', { name: 'Domain' })
    const transit = await within(domains).findByRole('button', { name: /Transit/ })
    await waitFor(() => expect(transit.getAttribute('aria-pressed')).toBe('true'))
    expect(transit.textContent).toMatch(/this project/)
    expect(await screen.findByRole('list', { name: '2 templates' })).toBeTruthy()
    const user = userEvent.setup()
    await user.click(within(domains).getByRole('button', { name: 'All domains' }))
    expect(await screen.findByRole('list', { name: '3 templates' })).toBeTruthy()
  })
})

describe('gallery helpers', () => {
  it('offers untagged templates to every domain and tagged ones to theirs', () => {
    expect(fitsDomain('tweet', 'water_dam')).toBe(true)
    expect(fitsDomain('fids_board', 'airport')).toBe(true)
    expect(fitsDomain('fids_board', 'transit')).toBe(false)
    expect(fitsDomain('fids_board', 'all')).toBe(true)
    expect(filterTemplates([TWEET, FIDS], 'all', 'healthcare').map((t) => t.type)).toEqual([
      'tweet',
    ])
  })

  it('lists required fields first with readable types', () => {
    expect(schemaFields(TIME_JUMP.schema)).toEqual([
      { name: 'newTime', type: 'string', required: true, description: expect.any(String) },
      { name: 'exerciseTime', type: 'string', required: false, description: 'Exercise clock' },
      { name: 'worldState', type: 'list of string', required: false },
    ])
  })

  it('derives categories from the taxonomy in taxonomy order', () => {
    expect(categoriesPresent([TIME_JUMP, TWEET])).toEqual(['social', 'control'])
    expect(categoriesPresent([{ ...TWEET, type: 'custom_thing' }])).toEqual(['other'])
    expect(filterTemplates([TIME_JUMP, TWEET], 'social').map((t) => t.type)).toEqual(['tweet'])
  })
})
