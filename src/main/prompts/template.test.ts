import { describe, expect, it } from 'vitest'
import { compileTemplate, PROMPT_HELPERS, validateTemplate } from './template'

const render = (tpl: string, vars: Record<string, unknown> = {}) => compileTemplate(tpl)(vars)

describe('prompt helpers', () => {
  it('json pretty-prints values', () => {
    expect(render('{{json v}}', { v: { a: [1] } })).toBe('{\n  "a": [\n    1\n  ]\n}')
    expect(render('{{json missing}}')).toBe('null')
  })

  it('join uses the separator and stringifies objects', () => {
    expect(render('{{join xs " | "}}', { xs: ['a', 'b'] })).toBe('a | b')
    expect(render('{{join xs}}', { xs: ['a', 'b'] })).toBe('a, b')
    expect(render('{{join xs}}', {})).toBe('')
  })

  it('comparison and boolean helpers work as subexpressions', () => {
    const tpl = '{{#if (eq a 1)}}eq{{/if}} {{#if (ne a 2)}}ne{{/if}} {{#if (and a b)}}and{{/if}}'
    expect(render(tpl, { a: 1, b: true })).toBe('eq ne and')
    expect(render('{{#if (or a b)}}or{{/if}}{{#if (not a)}}not{{/if}}', { a: 0, b: '' })).toBe(
      'not',
    )
  })

  it('inc, upper, lower', () => {
    expect(render('{{#each xs}}{{inc @index}}.{{upper this}} {{/each}}', { xs: ['a', 'b'] })).toBe(
      '1.A 2.B ',
    )
    expect(render('{{lower s}}', { s: 'FIDS' })).toBe('fids')
  })

  it('default falls back for missing, empty strings and empty lists', () => {
    expect(render('{{default x "none"}}')).toBe('none')
    expect(render('{{default x "none"}}', { x: '' })).toBe('none')
    expect(render('{{default x "none"}}', { x: [] })).toBe('none')
    expect(render('{{default x "none"}}', { x: 0 })).toBe('0')
  })

  it('bullets renders a markdown list', () => {
    expect(render('{{bullets xs}}', { xs: ['Notify TSA', 'Activate EOC'] })).toBe(
      '- Notify TSA\n- Activate EOC',
    )
    expect(render('{{bullets xs}}')).toBe('')
  })

  it('indent pads every non-empty line', () => {
    expect(render('{{indent t 4}}', { t: 'a\n\nb' })).toBe('    a\n\n    b')
  })

  it('does not HTML-escape output', () => {
    expect(render('{{t}}', { t: '<b> & "q"' })).toBe('<b> & "q"')
  })

  it('renders missing variables as empty (strict: false)', () => {
    expect(render('[{{a.b.c}}]')).toBe('[]')
  })

  it('registers exactly the documented helpers', () => {
    expect(Object.keys(PROMPT_HELPERS).sort()).toEqual(
      [
        'and',
        'bullets',
        'default',
        'eq',
        'indent',
        'inc',
        'join',
        'json',
        'lower',
        'ne',
        'not',
        'or',
        'upper',
      ].sort(),
    )
  })
})

describe('validateTemplate', () => {
  it('accepts built-in block helpers and plain variables', () => {
    expect(
      validateTemplate('{{#each xs}}{{this}}{{/each}}{{#with a}}{{b}}{{/with}}{{name}}'),
    ).toBeUndefined()
  })

  it('rejects unknown helpers, including in subexpressions', () => {
    expect(validateTemplate('a\n{{shout x}}')).toEqual({
      line: 2,
      message: 'unknown helper "shout"',
    })
    expect(validateTemplate('{{#if (bogus a)}}x{{/if}}')).toMatchObject({
      message: 'unknown helper "bogus"',
    })
  })

  it('reports parse errors with a line', () => {
    const p = validateTemplate('one\ntwo {{#if x}}')
    expect(p?.line).toBe(2)
  })
})

describe('editor help panel', () => {
  it('documents every registered helper and nothing else', async () => {
    const { readFile } = await import('node:fs/promises')
    const help = await readFile('src/renderer/src/routes/prompts/help.ts', 'utf8')
    const section = help.slice(help.indexOf('PROMPT_HELPER_HELP'))
    const documented = [...section.matchAll(/name: '([a-z]+)'/g)].map((m) => m[1]).sort()
    expect(documented).toEqual(Object.keys(PROMPT_HELPERS).sort())
  })
})
