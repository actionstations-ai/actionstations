// The bundled lab safety toolkit and research_labs domain (#868, #870): both parse, the
// knowledge fits the prompt cap uncut, neither carries a denied category, and the domain and
// toolkit agree.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'
import { guardrailIssuesIn } from './guardrails'
import { toolkitGuardrailCategories } from './load-check'
import { LAB_OWN_INJECT_TYPES } from './inject-types'

const ROOT = join(__dirname, '../../../..')
const json = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
const toolkit = ToolkitSchema.parse(json('packs/toolkits/lab_safety.json'))
const domain = DomainProfile.parse(json('packs/domains/research_labs.json'))

describe('lab safety toolkit file', () => {
  it('has the stable id other fields reuse and names the guardrail rule', () => {
    expect(toolkit.id).toBe('lab_safety')
    expect(toolkit.lintRules).toContain('lab.guardrails')
  })

  it('fits the knowledge cap without cutting a line', () => {
    const out = toolkitKnowledge([toolkit])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('7 calendar days')
  })

  it('states the Form 3 deadline as 7 calendar days, not 3', () => {
    const text = JSON.stringify(toolkit.knowledge)
    expect(text).toMatch(/7 calendar days/)
    expect(text).not.toMatch(/within 3 days/)
  })

  it('carries no denied category in any text, so it loads', () => {
    expect(guardrailIssuesIn(toolkit, 'toolkit')).toEqual([])
    expect(toolkitGuardrailCategories(toolkit)).toEqual([])
  })

  it('marks the NIH draft policy as a draft with its notice number', () => {
    const text = JSON.stringify(toolkit.knowledge)
    expect(text).toMatch(/NOT-OD-26-112/)
    expect(text).toMatch(/draft/i)
  })

  it('has a template folder with a taxonomy block for each inject type it adds', () => {
    for (const type of toolkit.injectTypes) {
      const meta = join(ROOT, 'templates/injects', type, 'meta.json')
      expect(existsSync(meta), type).toBe(true)
      expect(json(`templates/injects/${type}/meta.json`).taxonomy, type).toBeDefined()
      expect(LAB_OWN_INJECT_TYPES as readonly string[], type).toContain(type)
    }
  })
})

describe('research_labs domain file', () => {
  it('suggests the lab safety and epidemiology toolkits and media environment', () => {
    expect(domain.suggestedToolkits).toEqual(['lab_safety', 'epidemiology', 'media_environment'])
  })

  it('carries no denied category in any text', () => {
    expect(guardrailIssuesIn(domain, 'domain')).toEqual([])
  })

  it('is listed by the toolkit as a domain it suits', () => {
    expect(toolkit.appliesTo.domains).toContain('research_labs')
  })
})
