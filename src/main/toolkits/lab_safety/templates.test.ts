// The lab safety templates (#869): each has a taxonomy block, a preview that validates against
// its schema, an exercise marking, a golden, and text that passes the content guardrails.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '@shared/toolkits'
import { TemplateMeta } from '../../render/templates'
import { guardrailIssuesIn } from './guardrails'
import { LAB_OWN_INJECT_TYPES } from './inject-types'

const ROOT = join(__dirname, '../../../..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const toolkit = ToolkitSchema.parse(JSON.parse(read('packs/toolkits/lab_safety.json')))

describe('lab safety templates', () => {
  it('lists every template the guardrail rule reads', () => {
    expect([...toolkit.injectTypes].sort()).toEqual([...LAB_OWN_INJECT_TYPES].sort())
  })

  describe.each([...LAB_OWN_INJECT_TYPES])('%s', (type) => {
    const dir = `templates/injects/${type}`
    const schema = JSON.parse(read(`${dir}/schema.json`))
    const preview = JSON.parse(read(`${dir}/preview.json`))

    it('has a valid meta block with a taxonomy and a golden', () => {
      const meta = TemplateMeta.parse(JSON.parse(read(`${dir}/meta.json`)))
      expect(meta.type).toBe(type)
      expect(meta.taxonomy).toBeDefined()
      for (const v of meta.variants.length ? meta.variants : ['default'])
        expect(existsSync(join(ROOT, dir, `__golden__/${v}.png`)), v).toBe(true)
    })

    it('has a preview that validates against the schema', () => {
      const validate = new Ajv2020({ strict: false }).compile(schema)
      expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
    })

    it.skipIf(type === 'lab_figure')(
      'marks the page as exercise material with fictional people and places',
      () => {
        const html = read(`${dir}/template.html`)
        expect(html).toContain('EXERCISE · EXERCISE · EXERCISE')
        expect(html).toContain('All people and places are fictional')
      },
    )

    it('carries no content the guardrails deny', () => {
      expect(guardrailIssuesIn(preview, 'preview')).toEqual([])
      expect(guardrailIssuesIn(schema, 'schema')).toEqual([])
    })
  })

  it('marks the theft, loss or release worksheet as not the official form', () => {
    expect(read('templates/injects/lab_theft_loss_worksheet/template.html')).toContain(
      'NOT THE OFFICIAL APHIS/CDC FORM 3',
    )
  })
})
