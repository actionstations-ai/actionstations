import { describe, expect, it } from 'vitest'
import {
  bundledProfiles,
  domainProfileRegexProblems,
  FactCategory,
  factCategoryProblems,
  regexSourceProblem,
} from './index'
import { freightRailProfile } from './pack-fixtures'

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

describe('regexSourceProblem: custom patterns (#351)', () => {
  it('allows capturing groups and look-arounds, and needs a capturing group', () => {
    expect(regexSourceProblem(String.raw`\b([A-Z][a-z]+) Line\b`, 'pattern')).toBeUndefined()
    expect(
      regexSourceProblem(String.raw`\b(?!(?:The|A)\b)([A-Z][a-z]+ Yard)\b`, 'pattern'),
    ).toBeUndefined()
    expect(regexSourceProblem(String.raw`(?<=Train )([A-Z]\d{2,4})\b`, 'pattern')).toBeUndefined()
    expect(regexSourceProblem(String.raw`\bCP-\d{1,4}\b`, 'pattern')).toMatch(/no capturing group/)
    expect(regexSourceProblem('(?<id>X)', 'pattern')).toMatch(/named groups/)
    expect(regexSourceProblem('(?i:x)(y)', 'pattern')).toMatch(/group modifiers/)
  })

  it('applies the backtracking rules inside groups and look-arounds', () => {
    expect(regexSourceProblem(String.raw`\b((?:\w+\s?)+)\b`, 'pattern')).toMatch(
      /nested quantifiers/,
    )
    expect(regexSourceProblem(String.raw`(?!(?:a+)+)(x)`, 'pattern')).toMatch(/nested quantifiers/)
    expect(regexSourceProblem(String.raw`(x)\1`, 'pattern')).toMatch(/back-references/)
    expect(regexSourceProblem('(x?)', 'pattern')).toMatch(/matches empty text/)
    expect(regexSourceProblem(`(${'a'.repeat(400)})`, 'pattern')).toMatch(/longer than 400/)
  })
})

describe('domainProfileRegexProblems (#351)', () => {
  it('accepts every regex in the bundled profiles', () => {
    const problems = bundledProfiles().flatMap((p) =>
      domainProfileRegexProblems(p).map((x) => `${p.id} ${x.path}: ${x.message}`),
    )
    expect(problems).toEqual([])
  })

  it('names the field of each pattern it refuses', () => {
    const profile = freightRailProfile({
      factCategories: [
        category({ id: 'yards', noun: 'Yards?' }),
        category({ id: 'tracks', noun: 'Tracks?', genericNoun: 'Lines?', context: '(?:a|aa)*' }),
        category({ id: 'trains', noun: undefined, pattern: String.raw`\b(?:\w+\s?)+Train\b` }),
      ],
      rolePatterns: { security: 'railroad police', technical: '(?:sig+)+nal' },
      agencyPattern: 'FRA|',
    })
    expect(domainProfileRegexProblems(profile)).toEqual([
      {
        path: 'factCategories.1.context',
        message: expect.stringMatching(/^tracks: The context cannot be used: .*nested/),
      },
      {
        path: 'factCategories.2.pattern',
        message: expect.stringMatching(/^trains: The pattern cannot be used: .*nested/),
      },
      {
        path: 'rolePatterns.technical',
        message: expect.stringMatching(/^The technical role pattern cannot be used: .*nested/),
      },
      {
        path: 'agencyPattern',
        message: expect.stringMatching(/^The agency pattern cannot be used: .*matches empty/),
      },
    ])
  })
})
