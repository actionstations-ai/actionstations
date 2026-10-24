// Integration: prompt library layering through the IPC dispatcher against real folders.
// Defaults come from tests/fixtures/prompts/resources (TTX_RESOURCES).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./prompts')).default
const { createProject, loadProject } = await import('../../project/store')
const { resetSettingsCache } = await import('../../settings/store')
const { onEmit } = await import('../../lib/events')
const { loadPrompt, renderPrompt } = await import('../../prompts')

const NAME = 'fixture_overview'
const FIXTURES = resolve('tests/fixtures/prompts/resources')
const DEFAULT_RAW = readFileSync(join(FIXTURES, 'prompts', `${NAME}.md`), 'utf8')
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** The fixture with its @system line changed, still valid. */
const variant = (label: string) =>
  DEFAULT_RAW.replace('You are an exercise designer', `You are the ${label} exercise designer`)

async function newProject(): Promise<string> {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-proj-'))
  return (await createProject({ parentDir: parent, name: 'Rivergate' })).path
}

async function ok<T = unknown>(channel: string, req: unknown): Promise<T> {
  const res = await dispatch(handlers, channel, req)
  if (!res.ok) throw new Error(`${channel}: ${res.error.code} ${res.error.message}`)
  return res.data as T
}

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  process.env.TTX_USER_DATA = userData
  process.env.TTX_RESOURCES = FIXTURES
  resetSettingsCache()
})
afterEach(() => {
  delete process.env.TTX_RESOURCES
})

describe('prompt layering', () => {
  it('lists shipped defaults with override flags', async () => {
    expect(await ok('prompts:list', {})).toEqual([
      {
        name: NAME,
        stage: 'scenario_overview',
        description: 'Test fixture for the prompt library (not a shipped prompt).',
        effectiveSource: 'default',
        hasGlobalOverride: false,
        hasProjectOverride: false,
        hasPackLayer: false,
      },
    ])
  })

  it('project override > global override > default', async () => {
    const project = await newProject()
    expect((await loadPrompt(NAME, project)).source).toBe('default')

    await ok('prompts:save', { name: NAME, scope: 'global', raw: variant('global') })
    expect(existsSync(join(userData, 'prompts', `${NAME}.md`))).toBe(true)
    expect((await loadPrompt(NAME)).source).toBe('global')
    expect((await loadPrompt(NAME, project)).source).toBe('global')

    await ok('prompts:save', {
      name: NAME,
      scope: 'project',
      projectPath: project,
      raw: variant('project'),
    })
    expect(readFileSync(join(project, 'prompts', `${NAME}.md`), 'utf8')).toBe(variant('project'))
    const effective = await loadPrompt(NAME, project)
    expect(effective.source).toBe('project')
    expect(effective.body).toContain('the project exercise designer')
    expect((await loadPrompt(NAME)).source).toBe('global')

    const [entry] = await ok<{ effectiveSource: string }[]>('prompts:list', {
      projectPath: project,
    })
    expect(entry).toMatchObject({
      effectiveSource: 'project',
      hasGlobalOverride: true,
      hasProjectOverride: true,
    })

    const layers = await ok<Record<string, unknown>>('prompts:get', {
      name: NAME,
      projectPath: project,
    })
    expect(layers).toMatchObject({
      default: { source: 'default' },
      global: { source: 'global' },
      project: { source: 'project' },
      effective: { source: 'project' },
      raw: { default: DEFAULT_RAW, global: variant('global'), project: variant('project') },
    })

    await ok('prompts:reset', { name: NAME, scope: 'project', projectPath: project })
    expect((await loadPrompt(NAME, project)).source).toBe('global')
    await ok('prompts:reset', { name: NAME, scope: 'global' })
    expect((await loadPrompt(NAME, project)).source).toBe('default')
    // Resetting again is a no-op.
    await ok('prompts:reset', { name: NAME, scope: 'global' })
  })

  it('keeps project.json promptOverrides in sync and emits project:changed prompts', async () => {
    const project = await newProject()
    const events: unknown[] = []
    const off = onEmit((name, payload) => name === 'project:changed' && events.push(payload))
    await ok('prompts:save', {
      name: NAME,
      scope: 'project',
      projectPath: project,
      raw: DEFAULT_RAW,
    })
    expect((await loadProject(project)).promptOverrides).toEqual([`${NAME}.md`])
    await ok('prompts:save', {
      name: NAME,
      scope: 'project',
      projectPath: project,
      raw: DEFAULT_RAW,
    })
    expect((await loadProject(project)).promptOverrides).toEqual([`${NAME}.md`])
    await ok('prompts:reset', { name: NAME, scope: 'project', projectPath: project })
    expect((await loadProject(project)).promptOverrides).toEqual([])
    off()
    expect(events).toContainEqual({ path: project, what: 'prompts' })
  })
})

describe('override validation', () => {
  it('rejects an invalid override with line-specific issues and writes nothing', async () => {
    const raw = DEFAULT_RAW.replace('{{bullets objectives}}', '{{shout objectives}}').replace(
      '<!-- @system -->',
      '<!-- @sys -->',
    )
    const res = await dispatch(handlers, 'prompts:save', { name: NAME, scope: 'global', raw })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('VALIDATION')
    expect(res.error.message).toContain(`global override ${NAME}.md`)
    expect(res.error.details).toEqual([
      { line: 9, message: 'missing required section marker <!-- @system -->' },
      { line: 12, message: 'unknown section marker "@sys"' },
      { line: 26, message: 'unknown helper "shout"' },
    ])
    expect(existsSync(join(userData, 'prompts', `${NAME}.md`))).toBe(false)
  })

  it('rejects an override whose name does not match the file', async () => {
    const res = await dispatch(handlers, 'prompts:save', {
      name: NAME,
      scope: 'global',
      raw: DEFAULT_RAW.replace(`name: ${NAME}`, 'name: other'),
    })
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: [{ line: 2 }] } })
  })

  it('refuses overrides for prompts that have no shipped default', async () => {
    const res = await dispatch(handlers, 'prompts:save', {
      name: 'ghost',
      scope: 'global',
      raw: DEFAULT_RAW.replace(`name: ${NAME}`, 'name: ghost'),
    })
    expect(res).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('rejects names that could escape the prompts folder', async () => {
    const res = await dispatch(handlers, 'prompts:get', { name: '../settings' })
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    await expect(loadPrompt('../../etc/passwd')).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('requires a projectPath for project scope', async () => {
    const res = await dispatch(handlers, 'prompts:save', {
      name: NAME,
      scope: 'project',
      raw: DEFAULT_RAW,
    })
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })
})

describe('project path guard', () => {
  it('refuses folders the user has not opened, on every channel', async () => {
    const stranger = mkdtempSync(join(tmpdir(), 'ttx-x-'))
    for (const [channel, req] of [
      ['prompts:list', { projectPath: stranger }],
      ['prompts:get', { name: NAME, projectPath: stranger }],
      ['prompts:save', { name: NAME, scope: 'project', projectPath: stranger, raw: DEFAULT_RAW }],
      ['prompts:reset', { name: NAME, scope: 'project', projectPath: stranger }],
    ] as const) {
      const res = await dispatch(handlers, channel, req)
      expect(res, channel).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    }
    await expect(loadPrompt(NAME, stranger)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(existsSync(join(stranger, 'prompts'))).toBe(false)
  })
})

describe('renderPrompt', () => {
  const vars = {
    project: { orgName: 'Rivergate Airport Authority' },
    scenario: { title: 'Baggage system ransomware' },
    objectives: ['Activate the EOC', 'Coordinate with TSA'],
    retrieved: [{ documentTitle: 'TIRP', page: 41, text: 'Switch to manual tagging.' }],
  }

  it('renders system, cacheable context and user sections', async () => {
    const r = renderPrompt(await loadPrompt(NAME), vars)
    expect(r.name).toBe(NAME)
    expect(r.system).toBe(
      'You are an exercise designer for Rivergate Airport Authority following HSEEP.\nReturn JSON only.',
    )
    expect(r.cacheableContext).toBe('[TIRP p.41] Switch to manual tagging.')
    expect(r.user).toBe(
      'Write the overview for "BAGGAGE SYSTEM RANSOMWARE".\nObjectives:\n- Activate the EOC\n- Coordinate with TSA\nThreat: unspecified',
    )
    expect(r.frontmatter.variables).toEqual(['project', 'scenario', 'retrieved', 'objectives'])
    expect(r.system + r.user).not.toContain('Human notes')
  })

  it('hash is the sha256 of the effective raw file, stable across loads', async () => {
    const a = renderPrompt(await loadPrompt(NAME), vars)
    const b = renderPrompt(await loadPrompt(NAME), {})
    expect(a.hash).toBe(sha256(DEFAULT_RAW))
    expect(b.hash).toBe(a.hash)
    await ok('prompts:save', { name: NAME, scope: 'global', raw: variant('global') })
    const c = renderPrompt(await loadPrompt(NAME), vars)
    expect(c.hash).toBe(sha256(variant('global')))
    expect(c.system).toContain('the global exercise designer')
  })

  it('omits cacheableContext when the section is absent or renders empty', async () => {
    const r = renderPrompt(await loadPrompt(NAME), { ...vars, retrieved: [] })
    expect(r.cacheableContext).toBeUndefined()
  })

  it('renders a PromptFile built outside the loader with a deterministic hash', () => {
    const file = {
      name: 'adhoc',
      source: 'default' as const,
      frontmatter: {
        name: 'adhoc',
        stage: 'critique' as const,
        version: 1,
        task: 'critique' as const,
        modelHints: {},
        retrieval: { queries: [], k: 8 },
        variables: [],
      },
      body: '<!-- @system -->\nS\n<!-- @user -->\n{{join xs "+"}}',
    }
    const r1 = renderPrompt(file, { xs: [1, 2] })
    expect(r1.user).toBe('1+2')
    expect(renderPrompt(structuredClone(file), {}).hash).toBe(r1.hash)
  })
})
