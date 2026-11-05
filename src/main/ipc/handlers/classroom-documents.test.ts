// Classroom PDFs (#722, #724, #727): the HTML that gets printed is escaped, quotes the evidence and
// marks practice runs; the channels return PDF bytes. Printing itself is stubbed (it needs Electron).
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
// The "PDF" is the HTML itself, so the tests can read what would have been printed.
vi.mock('../../export/pdf', () => ({ htmlToPdf: async (html: string) => Buffer.from(html) }))
vi.mock('../../export/page', () => ({ embeddedFontsCss: () => '' }))
vi.mock('../../export/templates', () => ({ printCss: () => '' }))

const { dispatch } = await import('../registry')
const handlers = {
  ...(await import('./classroom')).default,
  ...(await import('./classroom-curriculum')).default,
  ...(await import('./classroom-scoring')).default,
  ...(await import('./classroom-dashboard')).default,
}
const { createProject } = await import('../../project/store')

const call = (channel: string, req: object) => dispatch(handlers as never, channel as never, req)
const data = <T>(r: unknown): T => {
  const x = r as { ok: boolean; data: T; error?: unknown }
  if (!x.ok) throw new Error(JSON.stringify(x.error))
  return x.data
}
const html = (r: unknown) => Buffer.from(data<{ base64: string }>(r).base64, 'base64').toString()

async function ready() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const { path: projectPath } = await createProject({
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-doc-')),
    name: 'Course',
  })
  await call('classroom:set-enabled', { projectPath, enabled: true })
  await call('classroom:set-course', {
    projectPath,
    name: 'EM 301',
    term: 'Fall',
    sections: [{ name: 'A' }],
  })
  const sectionId = data<{ course: { sections: { id: string }[] } }>(
    await call('classroom:get', { projectPath }),
  ).course.sections[0]!.id
  await call('classroom:roster-import', {
    projectPath,
    sectionId,
    csv: 'name,id\n"Ada <b>Lovelace</b>",1001\nBo Peep,1002\n',
  })
  await call('classroom:add-starter-rubrics', { projectPath })
  const ada = data<{ course: { students: { id: string }[] } }>(
    await call('classroom:get', { projectPath }),
  ).course.students[0]!.id
  return { projectPath, sectionId, ada }
}

describe('rubric handout', () => {
  it('prints every criterion with its levels, points and weight', async () => {
    const { projectPath } = await ready()
    const out = html(await call('classroom:rubric-pdf', { projectPath, rubricId: 'starter-team' }))
    expect(out).toContain('Coordination')
    expect(out).toContain('weight 2')
    expect(out).toContain('Exemplary')
    expect(out).not.toContain('<script')
    expect(out).toContain("default-src 'none'")
  })

  it('refuses an unknown rubric', async () => {
    const { projectPath } = await ready()
    const r = await call('classroom:rubric-pdf', { projectPath, rubricId: 'nope' })
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })
})

describe('student report', () => {
  it('quotes the evidence, shows the instructor comment and escapes names', async () => {
    const { projectPath, ada, sectionId } = await ready()
    const scenarioId = 'run1'
    await call('classroom:set-session', {
      projectPath,
      session: {
        scenarioId,
        sectionId,
        practice: false,
        seats: {},
        rubricIds: ['starter-player-role'],
      },
    })
    await call('classroom:evidence-add', {
      projectPath,
      evidence: {
        kind: 'observation',
        scenarioId,
        studentId: ada,
        rubricId: 'starter-player-role',
        criterionId: 'communication',
        levelIndex: 3,
        note: 'Notified the county at 1:12',
        exerciseTime: '1:12',
        count: 1,
      },
    })
    await call('classroom:set-score', {
      projectPath,
      scenarioId,
      studentId: ada,
      rubricId: 'starter-player-role',
      criterionId: 'communication',
      levelIndex: 3,
      comment: 'Clear and confirmed.',
    })
    const out = html(
      await call('classroom:student-report-pdf', { projectPath, scenarioId, studentId: ada }),
    )
    expect(out).toContain('Notified the county at 1:12')
    expect(out).toContain('Clear and confirmed.')
    expect(out).toContain('EM 301')
    expect(out).toContain('Ada &lt;b&gt;Lovelace&lt;/b&gt;')
    expect(out).not.toContain('<b>Lovelace')
    expect(out).not.toContain('Practice run')
  })

  it('says a practice run does not count', async () => {
    const { projectPath, ada, sectionId } = await ready()
    await call('classroom:set-session', {
      projectPath,
      session: { scenarioId: 'warm', sectionId, practice: true, seats: {}, rubricIds: [] },
    })
    const out = html(
      await call('classroom:student-report-pdf', {
        projectPath,
        scenarioId: 'warm',
        studentId: ada,
      }),
    )
    expect(out).toContain('does not count toward a grade')
  })
})

describe('reflection sheets', () => {
  it('prints one page per student with the prompts', async () => {
    const { projectPath, sectionId } = await ready()
    await call('classroom:set-reflection-prompts', {
      projectPath,
      prompts: ['What changed?', 'What next?'],
    })
    const out = html(
      await call('classroom:reflection-sheets-pdf', { projectPath, sectionId, scenarioId: 'run1' }),
    )
    expect(out.match(/class="sheet"/g)).toHaveLength(2)
    expect(out).toContain('1. What changed?')
    expect(out).toContain('Bo Peep')
    expect(out).toContain('go to your instructor with your name')
  })
})
