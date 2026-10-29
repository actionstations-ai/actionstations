import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Inject } from './inject'
import { Project } from './project'
import { PROVIDER_TASKS } from './provider'
import { Scenario } from './scenario'
import {
  DEFAULT_GLOSSARY,
  InjectTranslation,
  MAX_GLOSSARY_ENTRIES,
  ProjectGlossary,
  ScenarioLanguages,
  SupportedLanguage,
} from './translation'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
)

describe('translation schemas (spec 0435)', () => {
  it('Spanish is the only language in this release, left to right', () => {
    expect(SupportedLanguage.options).toEqual(['es'])
  })

  it('a scenario written before translation still parses, with no languages', () => {
    const s = Scenario.parse(FIXTURE)
    expect(s.languages).toBeUndefined()
    expect(s.translations).toBeUndefined()
  })

  it('allows one extra player language at most', () => {
    expect(ScenarioLanguages.parse({}).player).toEqual([])
    expect(ScenarioLanguages.parse({ player: ['es'] })).toEqual({
      player: ['es'],
      controller: false,
    })
    expect(() => ScenarioLanguages.parse({ player: ['es', 'es'] })).toThrow()
    expect(() => ScenarioLanguages.parse({ player: ['fr'] })).toThrow()
  })

  it('keeps document translations and their review state on the scenario', () => {
    const s = Scenario.parse({
      ...FIXTURE,
      languages: { player: ['es'] },
      translations: {
        es: {
          documents: {
            briefing: {
              path: 'scenarios/s/documents/briefing.es.md',
              sourceHash: 'abc',
              status: 'machine',
              updatedAt: '2027-03-04T10:00:00.000Z',
            },
          },
        },
      },
    })
    expect(s.translations?.es?.documents.briefing?.status).toBe('machine')
    expect(() =>
      Scenario.parse({
        ...FIXTURE,
        translations: {
          es: {
            documents: { briefing: { path: 'x', sourceHash: 'a', status: 'done', updatedAt: 'x' } },
          },
        },
      }),
    ).toThrow()
  })

  it('an inject carries translations beside its English fields, and old files have none', () => {
    const base = {
      id: 'i1',
      mselRowId: 'I-01',
      type: 'tweet',
      title: 'Post',
      fields: { text: 'Hi' },
    }
    expect(Inject.parse(base).translations).toBeUndefined()
    const t = InjectTranslation.parse({
      title: 'Publicación',
      fields: { text: 'Hola' },
      sourceHash: 'h',
      status: 'reviewed',
      updatedAt: '2027-03-04T10:00:00.000Z',
    })
    expect(t.assets).toEqual([])
    expect(Inject.parse({ ...base, translations: { es: t } }).translations?.es?.status).toBe(
      'reviewed',
    )
  })

  it('caps the glossary at 500 entries and 200 characters a term', () => {
    const entry = (i: number) => ({ term: `t${i}`, translation: 'x' })
    expect(
      ProjectGlossary.parse({
        es: Array.from({ length: MAX_GLOSSARY_ENTRIES }, (_, i) => entry(i)),
      }),
    ).toBeTruthy()
    expect(() =>
      ProjectGlossary.parse({ es: Array.from({ length: 501 }, (_, i) => entry(i)) }),
    ).toThrow()
    expect(() =>
      ProjectGlossary.parse({ es: [{ term: 'x'.repeat(201), translation: 'y' }] }),
    ).toThrow()
    expect(DEFAULT_GLOSSARY.es).toEqual([{ term: 'EXERCISE', translation: 'EJERCICIO' }])
  })

  it('a project without a glossary parses', () => {
    const p = Project.parse({
      id: 'p1',
      name: 'N',
      createdAt: '2027-03-04T10:00:00.000Z',
      updatedAt: '2027-03-04T10:00:00.000Z',
      appVersion: '1',
    })
    expect(p.glossary).toBeUndefined()
  })

  it('translate is a provider task', () => {
    expect(PROVIDER_TASKS).toContain('translate')
  })
})
