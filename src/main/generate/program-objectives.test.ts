// A program exercise tag's objectives in generation (spec 0457 FR-14) and the field critical
// tasks in the eeg prompt (spec 0457 FR-13): the merge after the objectives_roles stage and the
// two prompt blocks, rendered from the shipped prompts.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { PromptFile } from '@shared/schemas'
import type { Scenario } from '@shared/schemas/scenario'
import { ToolkitSchema, fieldTaskGroups, type ToolkitExerciseTag } from '@shared/toolkits'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

const epi = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/epidemiology.json'), 'utf8')),
)
vi.mock('../toolkits/exercise-tags', () => ({
  resolveExerciseTags: async (ids: string[]) =>
    epi.exerciseTags.filter((t: ToolkitExerciseTag) => ids.includes(t.id)),
}))

const { renderPrompt } = await import('../prompts')
const { parsePromptRaw } = await import('../prompts/format')
const { addProgramObjectives, objectiveTagsOf, programObjectiveVars } =
  await import('./program-objectives')

function loadPrompt(name: string): PromptFile {
  const file = resolve('prompts', `${name}.md`)
  const parsed = parsePromptRaw(readFileSync(file, 'utf8'), name, file)
  return { name, frontmatter: parsed.frontmatter, body: parsed.body } as PromptFile
}

const scenario = (exerciseTags: string[], fixed?: Scenario['objectives']) =>
  ({
    objectives: [{ id: 'o1', name: 'Coordination', text: 'Coordinate with the hospital.' }],
    brief: { ...(fixed ? { fixedObjectives: fixed } : {}) },
    conduct: { exerciseTags },
  }) as unknown as Scenario

describe('program exercise objectives in a generated scenario', () => {
  it('appends the tagged exercise’s objectives after the model’s, once', async () => {
    const s = scenario(['phep_biological_incident_200'])
    const tags = await objectiveTagsOf(s)
    expect(addProgramObjectives(s, tags)).toBe(2)
    expect(s.objectives.map((o) => o.name)).toEqual([
      'Coordination',
      'Capability 8',
      'Capability 9',
    ])
    expect(addProgramObjectives(s, tags)).toBe(0)
  })

  it('adds nothing without a tag or when a make-up version holds its objectives fixed', async () => {
    expect(await objectiveTagsOf(scenario([]))).toEqual([])
    const fixed = [{ id: 'f', name: 'Fixed', text: 'Kept as is.' }]
    expect(await objectiveTagsOf(scenario(['phep_biological_incident_200'], fixed))).toEqual([])
    expect(programObjectiveVars([])).toBeUndefined()
  })
})

const base = {
  domain: { label: 'Public health', systems: { it: [], ot: [] }, outsideParties: [] },
  project: { orgName: 'Lakeview County Health', documents: [] },
  brief: { audience: [] },
  threat: { label: 'outbreak' },
  scenario: { title: 'T', objectives: [{ name: 'A', text: 'a' }], msel: [] },
  roles: [],
  capabilities: [],
}

describe('the objectives_roles prompt', () => {
  const p = loadPrompt('objectives_roles')

  it('declares programObjectives and lists the program’s objectives as data when tagged', async () => {
    expect(p.frontmatter.variables).toContain('programObjectives')
    const tags = await objectiveTagsOf(scenario(['phep_critical_contacts']))
    const out = renderPrompt(p, { ...base, programObjectives: programObjectiveVars(tags) })
    expect(out.user).toContain('<program_objectives>')
    expect(out.user).toContain('PHEP Critical Contacts Drill:')
    expect(out.user).toContain('- Verify: verify and update on-call critical contact numbers.')
    expect(out.user).toMatch(/do not restate them/)
  })

  it('has no program block without a tag', () => {
    expect(renderPrompt(p, base).user).not.toContain('program_objectives')
  })
})

describe('the eeg prompt', () => {
  const p = loadPrompt('eeg')

  it('declares fieldTasks and shows the toolkit’s critical tasks per Core Capability', () => {
    expect(p.frontmatter.variables).toContain('fieldTasks')
    const out = renderPrompt(p, { ...base, fieldTasks: fieldTaskGroups([epi]) })
    expect(out.user).toContain('<field_tasks>')
    expect(out.user).toContain(
      '- public_health_healthcare_and_emergency_medical_services (Public Health, Healthcare, and Emergency Medical Services); also CDC PHEP capabilities (2018) 8, 9, 11, 12, 13:',
    )
    expect(out.user).toContain(
      ' - Request CDC Epi-Aid when local and state capacity is not enough.',
    )
    expect(out.system).toMatch(/never a source on their own/)
  })

  it('has no field task block without toolkits', () => {
    expect(renderPrompt(p, base).user).not.toContain('<field_tasks>')
  })
})
