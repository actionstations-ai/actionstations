// The handbook names the toolkits used and their data sources (spec 0448 FR-3).
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '@shared/toolkits'
import { toolkitsHandbookSection, upsertSection } from './docs'

const kit = ToolkitSchema.parse({
  id: 'test_field',
  name: 'Test field',
  description: 'A made-up field.',
  connectors: ['test_archive'],
  documents: [{ packId: 'org.example.library', documentId: 'guide', title: 'Field guide' }],
})

describe('toolkitsHandbookSection', () => {
  it('lists each toolkit with its data sources and reference documents', () => {
    const md = toolkitsHandbookSection([kit])
    expect(md).toContain('### Toolkits used')
    expect(md).toContain('- **Test field**: A made-up field.')
    expect(md).toContain('Data sources: test_archive')
    expect(md).toContain('Reference documents: Field guide')
  })

  it('is empty without toolkits and replaces itself on a re-run', () => {
    expect(toolkitsHandbookSection([])).toBe('')
    const once = upsertSection('# Handbook\n', 'toolkits', toolkitsHandbookSection([kit]))
    const twice = upsertSection(once, 'toolkits', toolkitsHandbookSection([kit]))
    expect(twice).toBe(once)
    expect(once.match(/Toolkits used/g)).toHaveLength(1)
  })
})
