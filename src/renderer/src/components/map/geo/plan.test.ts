// Attribution is plain text (GHSA-jrc7-96c5-q579): markup in map metadata never reaches the page.
import { describe, expect, it } from 'vitest'
import { plainAttribution } from './plan'

describe('plainAttribution', () => {
  it('removes tags and keeps the words', () => {
    expect(plainAttribution('© <a href="x">OpenStreetMap</a> contributors')).toBe(
      '© OpenStreetMap contributors',
    )
  })
  it('removes event-handler markup, including an unclosed tag', () => {
    expect(plainAttribution('Data <img src=x onerror=alert(1)> here')).toBe('Data here')
    expect(plainAttribution('Credit <img src=x onerror=alert(1)')).toBe('Credit')
  })
  it('leaves ordinary text alone', () => {
    expect(plainAttribution('OpenFreeMap © OpenMapTiles Data from OpenStreetMap')).toBe(
      'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
    )
  })
})
