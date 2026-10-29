import { describe, expect, it } from 'vitest'
import { isReleasePageUrl, toLatestRelease } from './release'
import { githubRelease } from './test-release'
import { inRange, notesFor } from './upgrade-notes'

describe('toLatestRelease', () => {
  it('keeps the version without its "v", the page, the notes and the asset names', () => {
    const r = toLatestRelease(githubRelease())
    expect(r).toMatchObject({
      version: '0.6.0',
      name: 'Action Stations 0.6.0',
      publishedAt: '2026-11-02T15:00:00Z',
      url: 'https://github.com/actionstations-ai/actionstations/releases/tag/v0.6.0',
      notes: expect.stringContaining('Tip of the day'),
    })
    expect(r.assets.map((a) => a.name)).toContain('actionstations-0.6.0-win-x64-setup.exe')
    expect(r).not.toHaveProperty('author')
  })

  it('refuses drafts and prereleases', () => {
    expect(() => toLatestRelease(githubRelease({ draft: true }))).toThrow(/draft/)
    expect(() => toLatestRelease(githubRelease({ prerelease: true }))).toThrow(/prerelease/)
  })

  it('refuses a tag that is not a version', () => {
    expect(() => toLatestRelease(githubRelease({ tag_name: 'latest' }))).toThrow(/tag latest/)
  })

  it('refuses a release page anywhere but this repository on github.com', () => {
    for (const html_url of [
      'https://evil.example/actionstations-ai/actionstations/releases/tag/v0.6.0',
      'http://github.com/actionstations-ai/actionstations/releases/tag/v0.6.0',
      'https://github.com/someone-else/actionstations/releases/tag/v0.6.0',
      'https://user:pw@github.com/actionstations-ai/actionstations/releases/tag/v0.6.0',
    ])
      expect(() => toLatestRelease(githubRelease({ html_url }))).toThrow(/github\.com/)
  })

  it('refuses answers with missing fields', () => {
    const { tag_name: _drop, ...noTag } = githubRelease()
    expect(() => toLatestRelease(noTag)).toThrow(/not a release/)
    expect(() => toLatestRelease(githubRelease({ published_at: null }))).toThrow(/date/)
    expect(() => toLatestRelease('<html>')).toThrow(/not a release/)
  })

  it('cuts oversized notes and asset lists', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `f${i}`, size: 1 }))
    const r = toLatestRelease(githubRelease({ body: 'x'.repeat(60_000), assets: many }))
    expect(r.notes).toHaveLength(50_000)
    expect(r.assets).toHaveLength(50)
  })
})

describe('isReleasePageUrl', () => {
  it('accepts only https release pages of actionstations-ai/actionstations', () => {
    expect(
      isReleasePageUrl('https://github.com/actionstations-ai/actionstations/releases/tag/v1.0.0'),
    ).toBe(true)
    expect(isReleasePageUrl('https://github.com/actionstations-ai/actionstations/releases/')).toBe(
      false,
    )
    expect(
      isReleasePageUrl('https://github.com:8443/actionstations-ai/actionstations/releases/x'),
    ).toBe(false)
    expect(isReleasePageUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('upgrade notes', () => {
  const WIN = 'The app id changed in 0.5.1'

  it('tells a Windows 0.5.0 user to uninstall first', () => {
    expect(notesFor('0.5.0', '0.6.0', 'win32')[0]).toMatch(WIN)
  })

  it('says nothing on macOS or Linux, or to users already on 0.5.1', () => {
    expect(notesFor('0.5.0', '0.6.0', 'darwin')).toEqual([])
    expect(notesFor('0.5.0', '0.6.0', 'linux')).toEqual([])
    expect(notesFor('0.5.1', '0.6.0', 'win32')).toEqual([])
  })

  it('matches ranges with both bounds', () => {
    expect(inRange('0.5.0', '>=0.5.0 <0.5.1')).toBe(true)
    expect(inRange('0.5.1', '>=0.5.0 <0.5.1')).toBe(false)
    expect(inRange('0.4.9', '>=0.5.0')).toBe(false)
    expect(inRange('not-a-version', '>=0.5.0')).toBe(false)
  })
})
