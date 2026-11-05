// The governance domain and toolkit content (spec 0459 FR-1..FR-4): valid against the schemas,
// consistent with each other, within the generator's knowledge budget, and every template preview
// passes the toolkit's own format rules.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { KNOWLEDGE_PER_TOOLKIT_CAP, ToolkitSchema, toolkitKnowledge } from '@shared/toolkits'
import { fieldLintIssues } from '../lint-rules'
import { GOVERNANCE_LINT_RULES } from './lint'
import { GOVERNANCE_INJECT_TYPES } from './register-lint'

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(p), 'utf8'))
const domain = DomainProfile.parse(read('packs/domains/governance.json'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/governance.json'))

interface Preview {
  fields: Record<string, unknown>
  variant?: string
  variants?: Record<string, { fields: Record<string, unknown> }>
}
interface Meta {
  type: string
  variants: string[]
  taxonomy?: unknown
}

describe('governance toolkit', () => {
  it('adds the eleven governance templates and reuses the press release and report form', () => {
    for (const t of GOVERNANCE_INJECT_TYPES) expect(toolkit.injectTypes).toContain(t)
    expect(toolkit.injectTypes).toContain('press_release')
    expect(toolkit.injectTypes).toContain('regulatory_report_form')
  })
  it('ships a template folder with a taxonomy block for every governance type', () => {
    for (const t of GOVERNANCE_INJECT_TYPES) {
      expect(existsSync(resolve(`templates/injects/${t}/template.html`)), t).toBe(true)
      const meta = read(`templates/injects/${t}/meta.json`) as Meta
      expect(meta.type).toBe(t)
      expect(meta.taxonomy, `${t} needs a taxonomy block`).toBeTruthy()
    }
  })
  it('fits the knowledge budget without cutting a line', () => {
    const { text, truncated } = toolkitKnowledge([toolkit])
    expect(truncated).toEqual([])
    expect(text.length).toBeLessThan(KNOWLEDGE_PER_TOOLKIT_CAP)
  })
  it('states the disclosure rules in plain words', () => {
    const rules = [...toolkit.knowledge.realismRules, ...toolkit.knowledge.productConventions]
      .join(' ')
      .toLowerCase()
    expect(rules).toMatch(/unreasonable delay/)
    expect(rules).toMatch(/delaying a meeting/)
    expect(rules).toMatch(/does not remove the duty/)
    expect(rules).toMatch(/item 8\.01 drafts do not claim materiality/)
    expect(rules).toMatch(/not legal advice/)
  })
  it('names the format rules the app implements', () => {
    expect([...toolkit.lintRules].sort()).toEqual([...GOVERNANCE_LINT_RULES].sort())
  })
})

describe('governance domain and toolkit agree', () => {
  it('the domain suggests the toolkit and its default family is the disclosure decision', () => {
    expect(domain.suggestedToolkits).toContain('governance')
    expect(domain.suggestedToolkits).toContain('media_environment')
    expect(domain.threatFamilies[0]).toBe('gov_cyber_disclosure')
  })
  it('the toolkit applies to the governance domain', () => {
    expect(toolkit.appliesTo.domains).toContain('governance')
  })
})

describe('template previews', () => {
  const previews = GOVERNANCE_INJECT_TYPES.flatMap((type) => {
    const meta = read(`templates/injects/${type}/meta.json`) as Meta
    const preview = read(`templates/injects/${type}/preview.json`) as Preview
    const variants = meta.variants.length ? meta.variants : ['default']
    return variants.map((variant) => ({
      type,
      variant,
      fields: { ...preview.fields, ...(preview.variants?.[variant]?.fields ?? {}) },
    }))
  })

  it('covers every variant of every governance template', () => {
    expect(previews.length).toBeGreaterThanOrEqual(GOVERNANCE_INJECT_TYPES.length + 5)
  })
  it('passes the format rules, so the goldens show correct documents', () => {
    for (const p of previews)
      expect(fieldLintIssues(p.type, p.fields), `${p.type} ${p.variant}`).toEqual([])
  })
  it('puts the exercise-aid line and the fictional company on every document', () => {
    for (const p of previews) {
      expect(String(p.fields.exerciseAid), `${p.type} ${p.variant}`).toMatch(/not legal advice/)
      expect(String(p.fields.company)).toMatch(/Ardent Ridge/)
    }
  })
})
