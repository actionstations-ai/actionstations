// fids_board airport-name fallbacks (#104): field → brand alias → neutral generic text.
import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { composeDocument } = await import('./compose')
const { loadTemplate } = await import('./templates')

const airportHeader = (html: string): string =>
  /<span class="airport">([^<]*)<\/span>/.exec(html)?.[1]?.trim() ?? ''

describe('fids_board airport name', () => {
  const { fields } = loadTemplate('fids_board').preview

  it('previews the Scenario 3 airport, never an invented one', () => {
    const html = composeDocument({ type: 'fids_board', fields }).html
    expect(airportHeader(html)).toBe('North Coast International Airport')
    expect(html).not.toContain('Northeast Central')
  })

  it('falls back to the brand alias, then to neutral text', () => {
    const rest = { ...fields }
    delete rest.airportName
    const branded = composeDocument({
      type: 'fids_board',
      fields: rest,
      brand: { aliases: { airport: 'Lakeside Regional Airport' } },
    }).html
    expect(airportHeader(branded)).toBe('Lakeside Regional Airport')
    const bare = composeDocument({ type: 'fids_board', fields: rest }).html
    expect(airportHeader(bare)).toBe('International Airport')
  })
})
