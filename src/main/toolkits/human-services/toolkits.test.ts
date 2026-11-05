// The crisis line, mass care and reunification toolkits (spec 0464 FR-3 to FR-6): they parse,
// fit the prompt caps together, own templates that exist and validate, and their format checks
// catch the mistakes the knowledge warns about.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { toolkitKnowledge, ToolkitSchema, type Toolkit } from '@shared/toolkits'
import { TemplateMeta } from '../../render/templates'
import { unknownCapabilityWarnings } from '../capabilities'
import { fieldLintIssues } from '../lint-rules'
import {
  lint988Routing,
  lintCrisisCounselingDurations,
  lintFnssIntegration,
  lintReleaseIdentity,
} from './lint'

const ROOT = join(__dirname, '../../../..')
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const load = (id: string): Toolkit => ToolkitSchema.parse(read(`packs/toolkits/${id}.json`))
const IDS = ['behavioral_safeguards', 'crisis_line', 'mass_care', 'reunification_child_welfare']
const toolkits = IDS.map(load)

describe('human services toolkits', () => {
  it.each(IDS)('%s has the right id, no unknown capability and knowledge under the cap', (id) => {
    const t = load(id)
    expect(t.id).toBe(id)
    expect(unknownCapabilityWarnings(t)).toEqual([])
    expect(toolkitKnowledge([t]).truncated).toEqual([])
  })

  it('fits all four toolkits in one prompt without cutting a line', () => {
    const out = toolkitKnowledge(toolkits)
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('Spanish-language contacts cannot be rerouted')
    expect(out.text).toContain('support them in place')
    expect(out.text).toContain('44 CFR 206.171')
  })

  it('states the source and date of every dated rule', () => {
    const text = toolkitKnowledge(toolkits).text
    expect(text).toMatch(/GAO-26-108114, status as of March 2026/)
    expect(text).toMatch(/November 2010/)
    expect(text).toMatch(/42 U\.S\.C\. 622\(b\)\(16\)/)
  })

  it('every toolkit inject type has a template folder, and every hs template belongs to one', () => {
    const owned = new Set(toolkits.flatMap((t) => t.injectTypes))
    for (const id of owned) expect(existsSync(join(ROOT, 'templates/injects', id)), id).toBe(true)
    const hs = readdirSync(join(ROOT, 'templates/injects')).filter((d) => d.startsWith('hs_'))
    expect(hs.length).toBeGreaterThan(0)
    for (const d of hs) expect(owned.has(d), d).toBe(true)
  })
})

describe('human services templates', () => {
  const hs = readdirSync(join(ROOT, 'templates/injects')).filter((d) => d.startsWith('hs_'))

  it.each(hs)('%s has valid meta, a preview its schema accepts and an EXERCISE marking', (id) => {
    const dir = join(ROOT, 'templates/injects', id)
    for (const f of ['template.html', 'style.css', 'schema.json', 'preview.json', 'meta.json'])
      expect(existsSync(join(dir, f)), `${id}/${f}`).toBe(true)
    const meta = TemplateMeta.parse(read(`templates/injects/${id}/meta.json`))
    expect(meta.type).toBe(id)
    expect(meta.taxonomy).toBeDefined()
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(
      read(`templates/injects/${id}/schema.json`),
    )
    const preview = read(`templates/injects/${id}/preview.json`)
    expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
    expect(existsSync(join(dir, '__golden__/default.png')), `${id} golden`).toBe(true)
    const html = readFileSync(join(dir, 'template.html'), 'utf8')
    expect(html).toContain('EXERCISE')
    // Operational reports name the 988 service; only public-facing products must show no real number.
    if (id === 'hs_parent_notification_text')
      expect(JSON.stringify(preview)).not.toMatch(/(?<![\d,.$])988(?![\d,])/)
  })
})

describe('988 routing check', () => {
  it('flags the wrong timers and Spanish rerouting, and accepts the right statements', () => {
    expect(lint988Routing('Texts reroute to a backup center after about 2 minutes.').length).toBe(1)
    expect(lint988Routing('Calls reroute to backup after five minutes.').length).toBe(1)
    expect(lint988Routing('Spanish contacts are rerouted to backup after 5 minutes.').length).toBe(
      1,
    )
    expect(
      lint988Routing(
        'Calls reroute after about 2 minutes, texts and chats after about 5 minutes. Spanish-language contacts cannot be rerouted.',
      ),
    ).toEqual([])
  })
})

describe('FNSS integration check', () => {
  it('flags separate-tier wording only', () => {
    expect(lintFnssIntegration('Move residents to the special needs shelter.').length).toBe(1)
    expect(
      lintFnssIntegration('A general population shelter with functional needs support.'),
    ).toEqual([])
  })
})

describe('crisis counseling durations', () => {
  it('accepts 60 days and nine months and flags others', () => {
    expect(
      lintCrisisCounselingDurations(
        'The immediate services program runs up to 60 days. The regular services program runs up to nine months.',
      ),
    ).toEqual([])
    expect(
      lintCrisisCounselingDurations('The immediate services program lasts 90 days.').length,
    ).toBe(1)
    expect(
      lintCrisisCounselingDurations('The regular services program lasts 12 months.').length,
    ).toBe(1)
  })
})

describe('release identity check', () => {
  it('sends a release with no identification check back', () => {
    expect(lintReleaseIdentity([{ idChecked: 'Yes, state ID' }])).toEqual([])
    expect(lintReleaseIdentity([{ idChecked: 'Yes' }, { idChecked: 'No' }]).length).toBe(1)
    expect(lintReleaseIdentity(undefined)).toEqual([])
  })

  it('runs through the registered rule on a release log', () => {
    const issues = fieldLintIssues('hs_release_log', { entries: [{ idChecked: 'none' }] })
    expect(issues.map((i) => i.path)).toEqual(['fields.entries'])
  })
})
