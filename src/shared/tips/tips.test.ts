// The bundled tips (#443): every tip parses, has a unique id, and links to a guide heading that
// exists, using the same slug rule as the local CI doc-link check (scripts/check-doc-links.mjs).
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { headingSlugs } from '../../../scripts/check-doc-links.mjs'
import { TIPS, TipList, guideParts, guideUrl, tipsFor } from './index'
import raw from './tips.json'

const ROOT = resolve(__dirname, '../../..')

describe('the bundled tips file', () => {
  it('parses against the Tip schema', () => {
    expect(TipList.safeParse(raw).success).toBe(true)
  })

  it('ships at least 20 tips (the spec asks for 15 at the very least)', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(20)
  })

  it('never repeats an id', () => {
    const ids = TIPS.map((t) => t.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it('links every tip to a guide file that exists', () => {
    const missing = TIPS.filter((t) => {
      const file = resolve(ROOT, guideParts(t).path)
      return !existsSync(file) || !statSync(file).isFile()
    }).map((t) => `${t.id}: ${t.guide}`)
    expect(missing).toEqual([])
  })

  it('links every tip to a heading that exists in its guide', () => {
    const broken: string[] = []
    for (const tip of TIPS) {
      const { path, anchor } = guideParts(tip)
      const file = resolve(ROOT, path)
      if (!existsSync(file)) continue
      const slugs = headingSlugs(readFileSync(file, 'utf8'))
      if (!slugs.has(anchor))
        broken.push(`${tip.id}: no heading #${anchor} in ${path} (has ${[...slugs].join(', ')})`)
    }
    expect(broken).toEqual([])
  })

  it('keeps tip text plain: no Markdown or HTML', () => {
    const markup = /[<>`*_[\]#]|\]\(|https?:/
    expect(TIPS.filter((t) => markup.test(t.text)).map((t) => t.id)).toEqual([])
  })

  it('stays under 20 KB', () => {
    expect(statSync(resolve(__dirname, 'tips.json')).size).toBeLessThan(20 * 1024)
  })
})

describe('the Tip schema', () => {
  const tip = { id: 'a', text: 'Some text.', guide: 'docs/guides/x.md#y', linkLabel: 'X' }

  it('requires an anchor and a path under docs/guides', () => {
    expect(TipList.safeParse([tip]).success).toBe(true)
    expect(TipList.safeParse([{ ...tip, guide: 'docs/guides/x.md' }]).success).toBe(false)
    expect(TipList.safeParse([{ ...tip, guide: 'docs/../x.md#y' }]).success).toBe(false)
    expect(TipList.safeParse([{ ...tip, guide: 'https://x.test/a.md#y' }]).success).toBe(false)
  })

  it('refuses long text, odd ids and unknown fields', () => {
    expect(TipList.safeParse([{ ...tip, text: 'x'.repeat(221) }]).success).toBe(false)
    expect(TipList.safeParse([{ ...tip, id: 'Bad Id' }]).success).toBe(false)
    expect(TipList.safeParse([{ ...tip, url: 'https://x.test' }]).success).toBe(false)
  })
})

describe('tipsFor', () => {
  const base = { text: 't', guide: 'docs/guides/x.md#y', linkLabel: 'X' }
  const tips = [
    { ...base, id: 'old' },
    { ...base, id: 'now', since: '0.6.0' },
    { ...base, id: 'later', since: '0.7.0' },
  ]

  it('skips tips for features newer than the running app', () => {
    expect(tipsFor('0.6.0', tips).map((t) => t.id)).toEqual(['old', 'now'])
    expect(tipsFor('0.5.1', tips).map((t) => t.id)).toEqual(['old'])
    expect(tipsFor('1.0.0', tips).map((t) => t.id)).toEqual(['old', 'now', 'later'])
  })

  it('shows every tip when the app version is not semver', () => {
    expect(tipsFor('dev', tips)).toHaveLength(3)
  })
})

describe('guideUrl', () => {
  const tip = { guide: 'docs/guides/packs.md#install-a-pack' }

  it('points a packaged app at the guide as of its own release tag', () => {
    expect(guideUrl(tip, '0.6.0', true)).toBe(
      'https://github.com/actionstations-ai/actionstations/blob/v0.6.0/docs/guides/packs.md#install-a-pack',
    )
  })

  it('points an unpackaged build at main', () => {
    expect(guideUrl(tip, '0.6.0', false)).toBe(
      'https://github.com/actionstations-ai/actionstations/blob/main/docs/guides/packs.md#install-a-pack',
    )
  })
})
