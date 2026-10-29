// @vitest-environment happy-dom
// The asmap:// protocol (#436): the renderer never fetches http(s); every address resolves to a
// maps:* IPC call, and online addresses decode to the provider URL main then checks.
import { describe, expect, it } from 'vitest'
import { mockTtx } from '../../../routes/documents/test-utils'
import { loadAsmap } from './protocol'

const b64 = (s: string) => Buffer.from(s).toString('base64url')

describe('asmap addresses', () => {
  it('reads an archive tile through maps:tile', async () => {
    const ttx = mockTtx({
      'maps:tile': () => ({ data: new Uint8Array([1, 2, 3]), contentType: 'image/png' }),
    })
    const got = await loadAsmap(
      `asmap://a/${encodeURIComponent('/Users/me/My Project.asproj')}/geo1/5/10/12`,
    )
    expect(new Uint8Array(got.data)).toEqual(new Uint8Array([1, 2, 3]))
    expect(ttx.calls('maps:tile')).toEqual([
      { projectPath: '/Users/me/My Project.asproj', mapId: 'geo1', z: 5, x: 10, y: 12 },
    ])
  })

  it('treats an empty archive tile as missing', async () => {
    mockTtx({
      'maps:tile': () => ({ data: new Uint8Array(0), contentType: 'application/octet-stream' }),
    })
    await expect(loadAsmap('asmap://a/p/geo1/0/0/0')).rejects.toThrow(/No tile/)
  })

  it('decodes online tile, glyph and sprite addresses to the provider URL', async () => {
    const ttx = mockTtx({ 'maps:fetch': () => ({ data: new Uint8Array([9]), contentType: 'x' }) })
    await loadAsmap(`asmap://t/${b64('https://tile.example.org/{z}/{x}/{y}.png')}/3/4/5`)
    await loadAsmap(
      `asmap://g/${b64('https://tiles.example.org/fonts/{fontstack}/{range}.pbf')}/Noto%20Sans/0-255.pbf`,
    )
    await loadAsmap(`asmap://s/${b64('https://tiles.example.org/sprites/ofm')}@2x.json`)
    expect(ttx.calls('maps:fetch')).toEqual([
      { url: 'https://tile.example.org/3/4/5.png' },
      { url: 'https://tiles.example.org/fonts/Noto%20Sans/0-255.pbf' },
      { url: 'https://tiles.example.org/sprites/ofm@2x.json' },
    ])
  })

  it('refuses an address it does not know', async () => {
    await expect(loadAsmap('asmap://x/1/2/3')).rejects.toThrow(/Unknown/)
  })
})
