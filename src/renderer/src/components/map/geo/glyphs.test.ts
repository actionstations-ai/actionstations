// @vitest-environment happy-dom
// Offline place-name fonts (#500): bundled Latin ranges load, anything else is an empty stack.
import { describe, expect, it, vi } from 'vitest'
import { mockTtx } from '../../../routes/documents/test-utils'
import { GLYPH_FONT, glyphUrl, loadGlyphs } from './glyphs'
import { loadAsmap } from './protocol'
import { archiveStyle } from './styles'

const bytes = new Uint8Array([1, 2, 3]).buffer

describe('bundled glyphs', () => {
  it('has the two Latin ranges of the font the styles name', () => {
    expect(glyphUrl(GLYPH_FONT, '0-255')).toBeTruthy()
    expect(glyphUrl(GLYPH_FONT, '256-511')).toBeTruthy()
  })

  it('finds the bundled font in a stack of several', () => {
    expect(glyphUrl(`Other Font, ${GLYPH_FONT}`, '0-255')).toBe(glyphUrl(GLYPH_FONT, '0-255'))
  })

  it('has nothing for a range or font that is not bundled', () => {
    expect(glyphUrl(GLYPH_FONT, '8192-8447')).toBeUndefined()
    expect(glyphUrl('Other Font', '0-255')).toBeUndefined()
  })

  it('loads a bundled range through fetch and an unbundled one as empty', async () => {
    const fetcher = vi.fn(async () => new Response(bytes)) as unknown as typeof fetch
    expect((await loadGlyphs(GLYPH_FONT, '0-255.pbf', fetcher)).byteLength).toBe(3)
    expect((await loadGlyphs(GLYPH_FONT, '8192-8447', fetcher)).byteLength).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('serves asmap://l/ without any IPC call', async () => {
    const ttx = mockTtx({})
    const got = await loadAsmap(`asmap://l/${encodeURIComponent('Missing Font')}/0-255.pbf`)
    expect(got.data.byteLength).toBe(0)
    expect(ttx.calls('maps:fetch')).toEqual([])
  })
})

describe('offline styles with labels', () => {
  const archive = (schema: 'protomaps' | 'openmaptiles') =>
    archiveStyle(
      {
        mode: 'archive',
        attribution: 'x',
        tileType: 'vector',
        schema,
        bounds: [-1, -1, 1, 1],
        minZoom: 0,
        maxZoom: 14,
        sourceName: 'x',
      } as never,
      'asmap://a/p/m/{z}/{x}/{y}',
      'light',
    )

  it.each([
    ['protomaps', 'places'],
    ['openmaptiles', 'place'],
  ] as const)('names places from the bundled font in the %s schema', (schema, layer) => {
    const style = archive(schema)
    expect(style.glyphs).toBe('asmap://l/{fontstack}/{range}')
    const names = style.layers.find((l) => l.id === 'place-names')
    expect(names).toMatchObject({ type: 'symbol', 'source-layer': layer })
    expect((names as { layout: { 'text-font': string[] } }).layout['text-font']).toEqual([
      GLYPH_FONT,
    ])
  })

  it('points every label at a remote-free address', () => {
    const json = JSON.stringify(archive('protomaps'))
    expect(json).not.toMatch(/https?:/)
  })
})
