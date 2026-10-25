import { describe, expect, it } from 'vitest'
import { bundledProfiles, FactCategory, factCategoryProblems, regexSourceProblem } from './index'

const category = (over: Partial<FactCategory>): FactCategory =>
  FactCategory.parse({ id: 'gates', label: 'Gates', noun: 'Gates?', ...over })

describe('regexSourceProblem', () => {
  it('accepts the shapes the bundled profiles use', () => {
    for (const src of [
      'Gates?',
      'Bus(?:es)?|Coach(?:es)?',
      'Laborator(?:y|ies)',
      String.raw`generat|turbine|\d ?MW\b|gate (?:position|opening)`,
      String.raw`\bseat|fans?\b|start-?up|w\.c\.`,
      '[A-Z]-?Lines?',
    ])
      expect(regexSourceProblem(src, 'context'), src).toBeUndefined()
  })

  it('accepts every noun, generic noun and context in the bundled profiles', () => {
    const problems = bundledProfiles().flatMap((p) =>
      p.factCategories.flatMap((c) =>
        factCategoryProblems(c).map((x) => `${p.id}/${c.id}: ${x.message}`),
      ),
    )
    expect(problems).toEqual([])
  })

  it('refuses invalid patterns and capturing groups', () => {
    expect(regexSourceProblem('Gates(', 'noun')).toMatch(/not a valid pattern/)
    expect(regexSourceProblem('a)|(b', 'noun')).toMatch(/not a valid pattern/)
    expect(regexSourceProblem('Bus(es)?', 'noun')).toMatch(/use \(\?:…\) instead/)
    expect(regexSourceProblem('(?<n>Gate)', 'noun')).toMatch(/named groups/)
    expect(regexSourceProblem('Gate(?= \\d)', 'noun')).toMatch(/look-arounds/)
    expect(regexSourceProblem('(?:a)\\1', 'noun')).toMatch(/back-references/)
  })

  it('refuses nested quantifiers and other patterns that can backtrack without end', () => {
    expect(regexSourceProblem('(?:a+)+', 'noun')).toMatch(/nested quantifiers/)
    expect(regexSourceProblem('(?:a|aa)*', 'noun')).toMatch(/nested quantifiers/)
    expect(regexSourceProblem('(?:(?:ab)?c)*x', 'noun')).toMatch(/nested quantifiers/)
    expect(regexSourceProblem('(?:\\w+\\s?){2,5}', 'context')).toMatch(/nested quantifiers/)
    expect(regexSourceProblem('a.*b.*c.*d', 'context')).toMatch(/open-ended repeats/)
    expect(regexSourceProblem('a{1,500}', 'noun')).toMatch(/above 100/)
  })

  it('refuses empty, empty-matching and over-long sources', () => {
    expect(regexSourceProblem('  ', 'noun')).toBe('it is empty')
    expect(regexSourceProblem('Gates?|', 'noun')).toMatch(/matches empty text/)
    expect(regexSourceProblem('x?', 'noun')).toMatch(/matches empty text/)
    expect(regexSourceProblem('a'.repeat(201), 'noun')).toMatch(/longer than 200/)
    expect(regexSourceProblem('a'.repeat(300), 'context')).toBeUndefined()
  })
})

describe('factCategoryProblems', () => {
  it('needs a noun unless the category has a pattern', () => {
    expect(factCategoryProblems(category({ noun: '' }))).toEqual([
      { field: 'noun', message: expect.stringMatching(/Give a noun/) },
    ])
    expect(factCategoryProblems(category({ noun: undefined, pattern: '\\b(X)\\b' }))).toEqual([])
  })

  it('needs a context with a generic noun, and checks each field', () => {
    expect(factCategoryProblems(category({ genericNoun: 'Units?' }))).toEqual([
      { field: 'context', message: expect.stringMatching(/needs a context/) },
    ])
    expect(
      factCategoryProblems(category({ noun: 'Gate(s)', genericNoun: '(?:a+)+', context: 'x' })),
    ).toEqual([
      { field: 'noun', message: expect.stringMatching(/^The noun cannot be used: use/) },
      { field: 'genericNoun', message: expect.stringMatching(/nested quantifiers/) },
    ])
  })
})
