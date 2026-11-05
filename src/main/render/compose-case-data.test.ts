// A document that shows case data says where it came from (spec 0448 FR-8, NFR-5).
import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { composeDocument } = await import('./compose')
const { loadTemplate } = await import('./templates')

const fields = () => loadTemplate('time_jump_card').preview.fields as Record<string, unknown>

describe('case data labels on a rendered document', () => {
  it('prints no label when the inject uses no case data', () => {
    const doc = composeDocument({ type: 'time_jump_card', fields: fields() })
    expect(doc.html).not.toContain('case-data-label')
  })

  it('prints each origin label, escaped, on the document', () => {
    const doc = composeDocument({
      type: 'time_jump_card',
      fields: fields(),
      caseLabels: [
        'Historical data (NOAA Storm Events, retrieved 2026-03-02)',
        'Simulated data (Storm <track>)',
      ],
    })
    expect(doc.html).toContain('case-data-label')
    expect(doc.html).toContain('Historical data (NOAA Storm Events, retrieved 2026-03-02)')
    expect(doc.html).toContain('Simulated data (Storm &lt;track&gt;)')
  })
})
