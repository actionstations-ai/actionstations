// The humanitarian domain and toolkit content (spec 0469): valid against the schemas,
// consistent with each other, reused by the domains the spec names, and within the generator's
// knowledge budget.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { TemplateMeta } from '../../render/templates'
import { fieldLintIssues } from '../lint-rules'
import { HUMANITARIAN_LINT_RULES } from './lint'
import { suggestToolkits, toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(p), 'utf8'))
const domain = DomainProfile.parse(read('packs/domains/humanitarian.json'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/humanitarian.json'))

describe('humanitarian toolkit file', () => {
  it('has the stable id other fields reuse', () => {
    expect(toolkit.id).toBe('humanitarian')
  })

  it('fits the knowledge cap without cutting a line', () => {
    const out = toolkitKnowledge([toolkit])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('Saving Lives Together')
  })

  it('states the cluster activation and refugee model rules with their source', () => {
    const rules = toolkit.knowledge.realismRules.join(' ')
    expect(rules).toMatch(/requested by the Humanitarian Coordinator/)
    expect(rules).toMatch(/Emergency Relief Coordinator/)
    expect(rules).toMatch(/refugee coordination model, not clusters/)
    expect(rules).toMatch(/checked 2026-11-11/)
  })

  it('keeps security content at the level of decisions and communications', () => {
    expect(toolkit.knowledge.realismRules.join(' ')).toMatch(
      /no negotiation tactics, ransom mechanics or detention-resistance technique/,
    )
  })
})

describe('humanitarian domain and toolkit agree', () => {
  it('lists the toolkit and defaults to the sudden-onset family', () => {
    expect(domain.suggestedToolkits).toContain('humanitarian')
    expect(domain.threatFamilies[0]).toBe('humanitarian_sudden_onset')
  })

  it('is suggested to the domains the spec names for community and domestic voluntary exercises', () => {
    for (const id of [
      'public_health',
      'municipal',
      'port_maritime',
      'food_agriculture',
      'emergency_communications',
    ]) {
      const profile = DomainProfile.parse(read(`packs/domains/${id}.json`))
      expect(profile.suggestedToolkits, id).toContain('humanitarian')
      expect(toolkit.appliesTo.domains, id).toContain(id)
    }
  })

  it('is proposed from a brief that mentions a cluster and a camp', () => {
    const suggestions = suggestToolkits({
      available: [toolkit],
      active: [],
      text: 'A cholera outbreak in a camp with cluster coordination',
      domainId: 'generic',
    })
    expect(suggestions.map((s) => s.toolkitId)).toContain('humanitarian')
  })

  it('is listed by the media environment toolkit', () => {
    const media = ToolkitSchema.parse(read('packs/toolkits/media_environment.json'))
    expect(media.appliesTo.domains).toContain('humanitarian')
    expect(domain.suggestedToolkits).toContain('media_environment')
  })
})

describe('humanitarian templates', () => {
  it('names the lint rules the app ships', () => {
    expect([...toolkit.lintRules].sort()).toEqual([...HUMANITARIAN_LINT_RULES].sort())
  })

  it.each(toolkit.injectTypes)(
    '%s has a valid meta, a schema its preview satisfies, and a preview that lints clean',
    (id) => {
      const dir = resolve('templates/injects', id)
      for (const f of ['template.html', 'style.css', 'schema.json', 'preview.json', 'meta.json'])
        expect(existsSync(resolve(dir, f)), `${id}/${f}`).toBe(true)
      const meta = TemplateMeta.parse(read(`templates/injects/${id}/meta.json`))
      expect(meta.type).toBe(id)
      expect(meta.taxonomy).toBeDefined()
      const preview = read(`templates/injects/${id}/preview.json`) as {
        fields: Record<string, unknown>
      }
      const validate = new Ajv2020({ strict: false, allErrors: true }).compile(
        read(`templates/injects/${id}/schema.json`) as object,
      )
      expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
      expect(fieldLintIssues(id, preview.fields)).toEqual([])
    },
  )
})
