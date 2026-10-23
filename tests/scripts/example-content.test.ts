// The shipped examples (examples/<slug>/project) carry no lint warning but CRITIQUE notes, and
// every inject passes the content checks the generator and the repair run (#220): no template
// example left in an identity field, no facility identifier the documents do not have. The
// generated scenarios also pass the recomputed MSEL lints; a hand-authored (seed) MSEL is
// checked for facility identifiers only, since the generator's mix rules do not apply to it.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Inject, Project, Scenario } from '@shared/schemas'
import { domainContext } from '../../src/main/generate/domain'
import { lintFacilityIds } from '../../src/main/generate/facility'
import { loadFacilityFacts } from '../../src/main/generate/facility-file'
import { contentIssues } from '../../src/main/generate/injects/consistency'
import { storyTexts } from '../../src/main/generate/injects/facts'
import { lintScenario } from '../../src/main/generate/lint'
import { blockingWarnings } from '../../scripts/make-example.mjs'

const EXAMPLES = resolve(__dirname, '../../examples')
const TEMPLATES = resolve(__dirname, '../../templates/injects')
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))

/** Names that belong to the scenario (the generator's knownNames). */
const knownNames = (p: Project, s: Scenario): string =>
  [
    s.title,
    p.orgName,
    p.name,
    ...Object.values(p.brand.aliases),
    ...s.roles.flatMap((r) => [r.name, r.abbreviation, r.team]),
  ].join('\n')

interface SpecEntry {
  seed?: unknown
}

const slugs = readdirSync(EXAMPLES).filter((d) => existsSync(join(EXAMPLES, d, 'example.json')))

describe.each(slugs)('example %s', (slug) => {
  const root = join(EXAMPLES, slug, 'project')
  const project = Project.parse(readJson(join(root, 'project.json')))
  const spec = readJson(join(EXAMPLES, slug, 'build.json')) as { scenarios: SpecEntry[] }
  const manifest = readJson(join(EXAMPLES, slug, 'example.json')) as { scenarios: { id: string }[] }

  it.each(manifest.scenarios.map((s, i) => [s.id, i] as const))(
    'scenario %s ships without lint warnings',
    async (id, index) => {
      const dir = join(root, 'scenarios', id)
      const scenario = Scenario.parse(readJson(join(dir, 'scenario.json')))
      const facts = await loadFacilityFacts(root, project)
      const seeded = !!spec.scenarios[index]?.seed
      const fresh = [
        ...(seeded ? [] : lintScenario(scenario, domainContext(project, scenario))),
        ...lintFacilityIds(scenario, facts),
      ]
      const open = blockingWarnings(scenario.warnings, fresh)
      expect(open.map((w) => `${w.code} ${w.rowId ?? ''} ${w.message}`)).toEqual([])

      const injects = readdirSync(join(dir, 'injects')).map((f) =>
        Inject.parse(readJson(join(dir, 'injects', f))),
      )
      const issues: string[] = []
      for (const inject of injects) {
        const row = scenario.msel.find((r) => r.id === inject.mselRowId)
        const schemaFile = join(TEMPLATES, inject.type, 'schema.json')
        if (!row || !existsSync(schemaFile)) continue
        const others = injects.filter((i) => i.id !== inject.id)
        for (const issue of contentIssues({
          type: inject.type,
          fields: inject.fields,
          schema: readJson(schemaFile) as Record<string, unknown>,
          row,
          facility: facts,
          storyTexts: storyTexts(scenario.msel, row, others),
          knownText: knownNames(project, scenario),
        }))
          issues.push(`${row.id} ${issue.path}: ${issue.message}`)
      }
      expect(issues).toEqual([])
    },
  )
})
