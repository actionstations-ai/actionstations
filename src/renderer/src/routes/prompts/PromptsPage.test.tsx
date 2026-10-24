// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PromptEntry, PromptFile } from '@shared/schemas/prompt'
import PromptsPage from './PromptsPage'
import { PROJECT, projectUrl, renderAt } from '../documents/test-utils'

const NAME = 'msel_phase'
const DEFAULT_RAW = [
  '---',
  `name: ${NAME}`,
  'stage: msel_phase',
  'variables: [scenario, phase]',
  '---',
  '<!-- @system -->',
  'You are an exercise designer.',
  '<!-- @user -->',
  'Write the MSEL for {{phase.name}}.',
].join('\n')

const file = (source: PromptFile['source']): PromptFile => ({
  name: NAME,
  source,
  body: '',
  frontmatter: {
    name: NAME,
    stage: 'msel_phase',
    version: 1,
    task: 'draft',
    modelHints: {},
    retrieval: { queries: [], k: 8 },
    variables: ['scenario', 'phase'],
  },
})

interface Store {
  /** An enabled pack's version of the prompt (read-only layer under the overrides). */
  pack?: string
  global?: string
  project?: string
}

const PACK = {
  packId: 'ai.actionstations.heritage-rail',
  packVersion: '1.0.0',
  packName: 'Freight Rail',
}

type Reply = { ok: true; data: unknown } | { ok: false; error: Record<string, unknown> }

/** Fake bridge over an in-memory layer store; save fails with `saveError` when set. */
function mockPrompts(store: Store, saveError?: Record<string, unknown>) {
  const entry = (projectPath?: string): PromptEntry => ({
    name: NAME,
    stage: 'msel_phase',
    description: 'One MSEL phase',
    effectiveSource:
      projectPath && store.project
        ? 'project'
        : store.global
          ? 'global'
          : store.pack
            ? 'pack'
            : 'default',
    hasGlobalOverride: store.global !== undefined,
    hasProjectOverride: !!projectPath && store.project !== undefined,
    hasPackLayer: store.pack !== undefined,
    ...(store.pack !== undefined ? PACK : {}),
  })
  const handlers: Record<string, (req: never) => unknown> = {
    'prompts:list': (req: { projectPath?: string }) => [entry(req.projectPath)],
    'prompts:get': (req: { projectPath?: string }) => ({
      default: file('default'),
      ...(store.pack !== undefined ? { pack: { ...file('pack'), ...PACK } } : {}),
      effective: file(entry(req.projectPath).effectiveSource),
      raw: {
        default: DEFAULT_RAW,
        ...(store.pack !== undefined ? { pack: store.pack } : {}),
        ...(store.global !== undefined ? { global: store.global } : {}),
        ...(req.projectPath && store.project !== undefined ? { project: store.project } : {}),
      },
    }),
    'prompts:save': (req: { scope: 'global' | 'project'; raw: string }) => {
      store[req.scope] = req.raw
      return file(req.scope)
    },
    'prompts:reset': (req: { scope: 'global' | 'project' }) => {
      delete store[req.scope]
    },
  }
  const invoke = vi.fn(async (channel: string, payload: unknown): Promise<Reply> => {
    if (channel === 'prompts:save' && saveError) return { ok: false, error: saveError }
    const h = handlers[channel]
    if (!h) return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: channel } }
    return { ok: true, data: await h(payload as never) }
  })
  ;(window as unknown as { ttx: unknown }).ttx = { invoke, on: () => () => {}, platform: 'darwin' }
  return (channel: string) => invoke.mock.calls.filter(([c]) => c === channel).map(([, p]) => p)
}

const editor = () => screen.findByRole('textbox', { name: /msel_phase/ })

afterEach(() => cleanup())

describe('PromptsPage (global)', () => {
  it('lists prompts by stage with source badges and shows the help panel', async () => {
    mockPrompts({ global: DEFAULT_RAW + '\nExtra.' })
    renderAt('/prompts', '/prompts', PromptsPage)
    const list = await screen.findByRole('navigation', { name: 'Prompts by stage' })
    expect(within(list).getByRole('heading', { name: 'Msel phase' })).toBeTruthy()
    const item = within(list).getByRole('button', { name: /msel_phase/ })
    expect(within(item).getByText('Global override')).toBeTruthy()
    expect(within(item).queryByText('Project override')).toBeNull()

    const help = await screen.findByRole('complementary', { name: 'Prompt reference' })
    expect(within(help).getByText('{{phase}}')).toBeTruthy()
    expect(within(help).getByText('{{bullets list}}')).toBeTruthy()
    expect(within(help).getByText('<!-- @context -->')).toBeTruthy()
  })

  it('edits, shows the diff against the default and saves with Cmd+S', async () => {
    const calls = mockPrompts({})
    renderAt('/prompts', '/prompts', PromptsPage)
    const area = (await editor()) as HTMLTextAreaElement
    expect(area.value).toBe(DEFAULT_RAW)
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)

    const user = userEvent.setup()
    await user.click(area)
    await user.keyboard('{Control>}{End}{/Control}')
    await user.type(area, '\nCite every claim.')
    await user.click(screen.getByRole('button', { name: 'Show diff' }))
    const diff = screen.getByRole('region', { name: 'Changes vs default' })
    expect(diff.textContent).toContain('1 added, 0 removed')
    const added = diff.querySelectorAll('.prompt-diff__line--add')
    expect(Array.from(added).map((l) => l.textContent)).toEqual(['added: + Cite every claim.\n'])

    fireEvent.keyDown(area, { key: 's', metaKey: true })
    await waitFor(() =>
      expect(calls('prompts:save')).toEqual([
        { name: NAME, scope: 'global', raw: DEFAULT_RAW + '\nCite every claim.' },
      ]),
    )
    expect(await screen.findByText('Override saved')).toBeTruthy()
  })

  it('Tab inserts two spaces instead of moving focus', async () => {
    mockPrompts({})
    renderAt('/prompts', '/prompts', PromptsPage)
    const area = (await editor()) as HTMLTextAreaElement
    area.focus()
    area.setSelectionRange(0, 0)
    fireEvent.keyDown(area, { key: 'Tab' })
    expect(area.value.startsWith('  ---')).toBe(true)
    expect(document.activeElement).toBe(area)
  })

  it('shows validation errors inline with line numbers', async () => {
    mockPrompts(
      {},
      {
        code: 'VALIDATION',
        message: 'Invalid prompt',
        details: [{ line: 9, message: 'unknown helper "shout"' }],
      },
    )
    renderAt('/prompts', '/prompts', PromptsPage)
    const area = await editor()
    const user = userEvent.setup()
    await user.type(area, 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Line 9 unknown helper "shout"')
    expect(area.getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('.code-editor__gutter .is-error')?.textContent).toBe('9')
  })

  it('resets a global override after confirmation', async () => {
    const calls = mockPrompts({ global: DEFAULT_RAW + '\nExtra.' })
    renderAt('/prompts', '/prompts', PromptsPage)
    const area = (await editor()) as HTMLTextAreaElement
    expect(area.value).toContain('Extra.')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Reset to default' }))
    const dialog = await screen.findByRole('dialog', { name: `Reset ${NAME}?` })
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(calls('prompts:reset')).toEqual([{ name: NAME, scope: 'global' }]))
    await waitFor(async () =>
      expect(((await editor()) as HTMLTextAreaElement).value).toBe(DEFAULT_RAW),
    )
    expect(screen.getByRole('button', { name: 'Reset to default' }).hasAttribute('disabled')).toBe(
      true,
    )
  })
})

describe('PromptsPage (pack layer, #262)', () => {
  const packRaw = DEFAULT_RAW + '\nRail rule.'

  it('starts from the pack version and labels the list entry with the pack', async () => {
    mockPrompts({ pack: packRaw })
    renderAt('/prompts', '/prompts', PromptsPage)
    const area = (await editor()) as HTMLTextAreaElement
    expect(area.value).toBe(packRaw)
    const list = screen.getByRole('navigation', { name: 'Prompts by stage' })
    const item = within(list).getByRole('button', { name: /msel_phase/ })
    // The ProvenanceBadge (#269) names the pack and its version.
    const badge = within(item).getByRole('img', { name: 'From pack Freight Rail 1.0.0' })
    expect(badge.textContent).toBe('Pack: Freight Rail 1.0.0')
    expect(within(item).queryByText('Default')).toBeNull()
    expect(screen.getByText('Using Freight Rail pack')).toBeTruthy()
  })

  it('resets a global override to the pack layer, not the default', async () => {
    const calls = mockPrompts({ pack: packRaw, global: DEFAULT_RAW + '\nExtra.' })
    renderAt('/prompts', '/prompts', PromptsPage)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Reset to Freight Rail pack' }))
    const dialog = await screen.findByRole('dialog', { name: `Reset ${NAME}?` })
    expect(dialog.textContent).toContain('The Freight Rail pack takes effect again')
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(calls('prompts:reset')).toEqual([{ name: NAME, scope: 'global' }]))
    await waitFor(async () => expect(((await editor()) as HTMLTextAreaElement).value).toBe(packRaw))
  })
})

describe('PromptsPage (project)', () => {
  it('edits the project scope on top of the global override', async () => {
    const globalRaw = DEFAULT_RAW + '\nGlobal rule.'
    const calls = mockPrompts({ global: globalRaw })
    renderAt(projectUrl('prompts'), '/p/:projectKey/prompts', PromptsPage)
    const area = (await editor()) as HTMLTextAreaElement
    expect(area.value).toBe(globalRaw)
    expect(screen.getByRole('button', { name: 'Reset to global override' })).toBeTruthy()

    const user = userEvent.setup()
    await user.type(area, ' Project rule.')
    await user.click(screen.getByRole('button', { name: 'Show diff' }))
    expect(screen.getByRole('region', { name: 'Changes vs global override' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(calls('prompts:save')).toEqual([
        { name: NAME, scope: 'project', projectPath: PROJECT, raw: globalRaw + ' Project rule.' },
      ]),
    )
    const list = screen.getByRole('navigation', { name: 'Prompts by stage' })
    expect(await within(list).findByText('Project override')).toBeTruthy()
  })
})
