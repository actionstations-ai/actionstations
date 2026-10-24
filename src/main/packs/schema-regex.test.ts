import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { patternRefusal, schemaRegexProblems } from './schema-regex'

const BUILTIN = resolve('templates/injects')
const builtinSchemas = readdirSync(BUILTIN)
  .filter((t) => existsSync(join(BUILTIN, t, 'schema.json')))
  .map((t) => [t, JSON.parse(readFileSync(join(BUILTIN, t, 'schema.json'), 'utf8'))] as const)

const messages = (schema: unknown) => schemaRegexProblems(schema).map((p) => p.message)

describe('patternRefusal', () => {
  it('accepts every pattern shape the built-ins use', () => {
    for (const p of [
      '^#[0-9a-fA-F]{6}$',
      '^[A-Za-z0-9._]{1,30}$',
      '^[A-Za-z0-9_]+$',
      '^[A-Za-z0-9_]{2,21}$',
      '^\\d{1,2}:\\d{2}$',
      '^a.*?',
    ])
      expect(patternRefusal(p), p).toBeUndefined()
  })

  it('refuses the reported ReDoS and other backtracking shapes', () => {
    expect(patternRefusal('^(\\w+\\s?)*$')).toMatch(/groups/)
    expect(patternRefusal('^\\w+\\s?\\w+$')).toMatch(/more than one repeat/)
    expect(patternRefusal('^a*a*a*b')).toMatch(/more than one repeat/)
    expect(patternRefusal('^(a|aa)+$')).toMatch(/groups/)
    expect(patternRefusal('^a|b$')).toMatch(/alternation/)
    expect(patternRefusal('\\w+x')).toMatch(/not anchored/)
    expect(patternRefusal('^(a)\\1$')).toMatch(/groups/)
    expect(patternRefusal('^a\\1$')).toMatch(/escape \\1/)
    expect(patternRefusal('^a{1,5000}$')).toMatch(/above 1000/)
    expect(patternRefusal('^a**$')).toMatch(/"\*" in this position/)
    expect(patternRefusal('^[a-z$')).toMatch(/unclosed/)
    expect(patternRefusal('^' + 'a'.repeat(200))).toMatch(/longer than 200/)
  })

  it('an accepted pattern stays fast on adversarial input', () => {
    const v = new Ajv2020({ strict: false }).compile({ type: 'string', pattern: '^[\\w ]+$' })
    const t = Date.now()
    expect(v('word '.repeat(20_000) + '!')).toBe(false)
    expect(Date.now() - t).toBeLessThan(200)
  })
})

describe('schemaRegexProblems', () => {
  it.each(builtinSchemas)('accepts the built-in %s schema (a copy keeps working)', (_t, s) => {
    expect(messages(s)).toEqual([])
  })

  it('refuses the reported pattern with a pointer to it', () => {
    const out = messages({
      type: 'object',
      properties: { headline: { type: 'string', pattern: '^(\\w+\\s?)*$' } },
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/^\/properties\/headline\/pattern: pattern .* uses groups/)
  })

  it('refuses patternProperties and format anywhere in the schema', () => {
    const out = messages({
      $defs: { when: { type: 'string', format: 'date-time' } },
      properties: {
        list: { type: 'array', items: { patternProperties: { '^a': { type: 'string' } } } },
      },
      propertyNames: { pattern: '^(x+)+$' },
    })
    expect(out).toEqual([
      expect.stringMatching(/^\/\$defs\/when\/format: format "date-time" is not allowed/),
      expect.stringMatching(/^\/properties\/list\/items\/patternProperties: patternProperties/),
      expect.stringMatching(/^\/propertyNames\/pattern: /),
    ])
  })

  it('leaves fields named pattern or format and instance data alone', () => {
    expect(
      messages({
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          format: { type: 'string', enum: ['A4', 'Letter'] },
          patternProperties: { type: 'string' },
        },
        examples: [{ pattern: '^(a+)+$', format: 'email' }],
        default: { format: 'x' },
      }),
    ).toEqual([])
  })
})
