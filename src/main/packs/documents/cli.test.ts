import { describe, expect, it } from 'vitest'
import { documentHostHeaders } from './cli'

describe('documentHostHeaders', () => {
  it('declares a contact to sec.gov', () => {
    const h = documentHostHeaders('0.8.0', 'ops@example.org')
    expect(h['www.sec.gov']).toEqual({ 'User-Agent': 'AS documents fetcher ops@example.org' })
  })

  it('sends the app User-Agent to dfs.ny.gov, which refuses the browser-like one with 403', () => {
    const h = documentHostHeaders('0.8.0', 'ops@example.org')
    expect(h['www.dfs.ny.gov']).toEqual({ 'User-Agent': 'AS/0.8.0 (+https://actionstations.ai)' })
  })
})
