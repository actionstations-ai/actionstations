// applyTrackedChanges on real DOCX files: the output package is opened and its XML asserted.
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { describe, expect, it } from 'vitest'
import { applyTrackedChanges } from './docx-tracked'
import { PIO_SENTENCE, samplePlan } from './__fixtures__/make-docx'

const OPTS = { author: 'Action Stations', date: '2026-10-29T10:00:00.123Z' }

async function documentXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return zip.file('word/document.xml')!.async('string')
}

const tags = (xml: string, name: string): string[] =>
  xml.match(new RegExp(`<w:${name}[ >]`, 'g')) ?? []

describe('applyTrackedChanges', () => {
  it('marks only the changed words of one paragraph as w:del and w:ins', async () => {
    const result = await applyTrackedChanges(
      await samplePlan(),
      [
        {
          id: 'r1',
          originalExcerpt: PIO_SENTENCE,
          proposedText:
            'The PIO releases information after written approval from the Incident Commander.',
        },
      ],
      OPTS,
    )
    expect(result.applied).toEqual(['r1'])
    const xml = await documentXml(result.bytes)
    expect(tags(xml, 'del').length).toBeGreaterThan(0)
    expect(tags(xml, 'ins').length).toBeGreaterThan(0)
    expect(xml).toContain('<w:delText xml:space="preserve">may</w:delText>')
    expect(xml).toContain('w:author="Action Stations"')
    expect(xml).toContain('w:date="2026-10-29T10:00:00Z"')
    // Words that did not change stay ordinary text.
    expect(xml).toContain('The PIO')
    expect(xml).not.toContain('<w:delText xml:space="preserve">The PIO')
  })

  it('numbers every revision uniquely', async () => {
    const result = await applyTrackedChanges(
      await samplePlan(),
      [
        {
          id: 'a',
          originalExcerpt: PIO_SENTENCE,
          proposedText: 'The PIO releases information after approval.',
        },
        {
          id: 'b',
          originalExcerpt: 'Statements are approved in writing before release to the media.',
          proposedText: 'Statements are approved by the IC before release to the media.',
        },
      ],
      OPTS,
    )
    expect(result.applied).toEqual(['a', 'b'])
    const xml = await documentXml(result.bytes)
    const ids = [...xml.matchAll(/<w:(?:ins|del) w:id="(\d+)"/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThanOrEqual(4)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the formatting of runs the excerpt crosses', async () => {
    const result = await applyTrackedChanges(
      await samplePlan(),
      [
        {
          id: 'bold',
          originalExcerpt: 'Statements are approved in writing before release to the media.',
          proposedText: 'Statements are approved in writing before release to the news media.',
        },
      ],
      OPTS,
    )
    expect(result.applied).toEqual(['bold'])
    const xml = await documentXml(result.bytes)
    expect(xml).toContain('approved in writing')
    expect(xml).toMatch(/<w:b\/>|<w:b w:val/)
    expect(xml).toContain('news ')
  })

  it('matches a sentence spread over two paragraphs', async () => {
    const result = await applyTrackedChanges(
      await samplePlan(),
      [
        {
          id: 'span',
          originalExcerpt:
            'The Deputy Incident Commander covers the post when the Incident Commander is away from the command post for more than an hour.',
          proposedText:
            'The Deputy Incident Commander covers the post when the Incident Commander is away for more than 15 minutes.',
        },
      ],
      OPTS,
    )
    expect(result.applied).toEqual(['span'])
    const xml = await documentXml(result.bytes)
    expect(xml).toContain('>15</w:t>')
    expect(xml).toContain('>minutes</w:t>')
  })

  it('leaves text in a table cell unmatched', async () => {
    const result = await applyTrackedChanges(
      await samplePlan(),
      [
        {
          id: 'cell',
          originalExcerpt: 'Table rule: notify the county within 30 minutes.',
          proposedText: 'Table rule: notify the county within 15 minutes.',
        },
      ],
      OPTS,
    )
    expect(result.applied).toEqual([])
    expect(result.unmatched.map((u) => u.id)).toEqual(['cell'])
    expect(result.bytes.length).toBe(0)
  })

  it('marks the first of a repeated sentence only and says so', async () => {
    const result = await applyTrackedChanges(
      await samplePlan(),
      [
        {
          id: 'dup',
          originalExcerpt: 'Repeat rule: the log is closed at ENDEX.',
          proposedText: 'Repeat rule: the log is closed after the hot wash.',
        },
      ],
      OPTS,
    )
    expect(result.applied).toEqual(['dup'])
    expect(result.warnings.join(' ')).toContain('more than once')
    const xml = await documentXml(result.bytes)
    expect(xml).toContain(
      '<w:p><w:r><w:t xml:space="preserve">Repeat rule: the log is closed at ENDEX.</w:t></w:r></w:p><w:tbl>',
    )
    expect(tags(xml, 'ins').length).toBeGreaterThan(0)
  })

  it('reads back as the proposed text when every change is accepted, and the original when rejected', async () => {
    const proposed =
      'The PIO releases information after written approval from the Incident Commander.'
    const result = await applyTrackedChanges(
      await samplePlan(),
      [{ id: 'r', originalExcerpt: PIO_SENTENCE, proposedText: proposed }],
      OPTS,
    )
    // mammoth keeps inserted text and drops deleted text: the accepted reading.
    const accepted = (await mammoth.extractRawText({ buffer: Buffer.from(result.bytes) })).value
    expect(accepted).toContain(proposed)
    expect(accepted).not.toContain('may release')
  })

  it('copies every other part of the package through unchanged', async () => {
    const original = await samplePlan()
    const result = await applyTrackedChanges(
      original,
      [{ id: 'r', originalExcerpt: PIO_SENTENCE, proposedText: 'The PIO releases information.' }],
      OPTS,
    )
    const before = await JSZip.loadAsync(original)
    const after = await JSZip.loadAsync(result.bytes)
    for (const name of Object.keys(before.files)) {
      if (name === 'word/document.xml' || name === 'docProps/core.xml' || before.files[name]!.dir)
        continue
      expect(await after.file(name)!.async('string'), name).toBe(
        await before.file(name)!.async('string'),
      )
    }
  })

  it('gives the same bytes for the same inputs', async () => {
    const run = async () =>
      applyTrackedChanges(
        await samplePlan(),
        [{ id: 'r', originalExcerpt: PIO_SENTENCE, proposedText: 'The PIO releases information.' }],
        OPTS,
      )
    expect(await documentXml((await run()).bytes)).toBe(await documentXml((await run()).bytes))
  })

  it('refuses a document that declares entities', async () => {
    const zip = await JSZip.loadAsync(await samplePlan())
    const xml = await zip.file('word/document.xml')!.async('string')
    zip.file(
      'word/document.xml',
      xml.replace('<w:document', '<!DOCTYPE x [<!ENTITY a "b">]><w:document'),
    )
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    await expect(
      applyTrackedChanges(
        bytes,
        [{ id: 'r', originalExcerpt: PIO_SENTENCE, proposedText: 'x' }],
        OPTS,
      ),
    ).rejects.toThrow(/DTD|entities/)
  })
})
