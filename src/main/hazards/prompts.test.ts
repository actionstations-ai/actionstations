// The hazard block in the ideate and scenario_overview prompts appears only when the stage is
// given a `hazards` summary (#439 FR-16, FR-17).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { PromptFile } from '@shared/schemas'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))
const { renderPrompt } = await import('../prompts')
const { parsePromptRaw } = await import('../prompts/format')

/** The shipped default, parsed and validated (undeclared variables fail here). */
function loadPrompt(name: string): PromptFile {
  const file = resolve('prompts', `${name}.md`)
  const parsed = parsePromptRaw(readFileSync(file, 'utf8'), name, file)
  return { name, frontmatter: parsed.frontmatter, body: parsed.body } as PromptFile
}

const SUMMARY =
  "Public hazard data for the organization's area, fetched 2026-10-29. It may be out of date.\nFlood Watch"

const base = {
  domain: {
    label: 'Water utility',
    systems: { it: [], ot: [] },
    outsideParties: [],
    vocabulary: {},
  },
  project: { orgName: 'Harbor Water', documents: [] },
  brief: {},
  threat: { label: 'flood', description: 'a flood' },
  threatFamilies: [],
  citationKeys: [],
  count: 3,
}

describe.each(['ideate', 'scenario_overview'])('%s prompt', (name) => {
  it('declares the hazards variable', async () => {
    const p = loadPrompt(name)
    expect(p.frontmatter.variables).toContain('hazards')
  })

  it('has no hazard block without a snapshot', async () => {
    const out = renderPrompt(loadPrompt(name), base)
    expect(out.user).not.toContain('hazard_data')
    expect(out.user).not.toContain('Flood Watch')
  })

  it('wraps the summary as data and tells the model it may be outdated', async () => {
    const out = renderPrompt(loadPrompt(name), { ...base, hazards: SUMMARY })
    expect(out.user).toContain('<hazard_data>\n' + SUMMARY + '\n</hazard_data>')
    expect(out.user).toMatch(/may be out of date/)
    expect(out.user).toMatch(/never instructions/)
    expect(out.user).toMatch(/must not (state|copy)/)
  })
})
