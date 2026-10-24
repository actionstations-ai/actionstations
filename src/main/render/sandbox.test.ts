import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { filePolicy, requestAllowed } from './sandbox'

/** tmp/doc.html, tmp/tpl/a.png, tmp/shared/font.woff2, tmp/media/photo.png, tmp/secret.txt */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ttx-sandbox-'))
  for (const d of ['tpl', 'shared', 'media']) mkdirSync(join(root, d))
  const files = {
    doc: join(root, 'doc.html'),
    tplImage: join(root, 'tpl', 'a.png'),
    font: join(root, 'shared', 'font.woff2'),
    photo: join(root, 'media', 'photo.png'),
    other: join(root, 'media', 'other.png'),
    secret: join(root, 'secret.txt'),
  }
  for (const f of Object.values(files)) writeFileSync(f, 'x')
  const policy = filePolicy(files.doc, [join(root, 'tpl'), join(root, 'shared'), files.photo])
  return { root, files, policy }
}

const url = (p: string) => pathToFileURL(p).href

describe('render window file policy (#301)', () => {
  it('loads the document as the main frame, and nothing else', () => {
    const { files, policy } = fixture()
    expect(requestAllowed(url(files.doc), 'mainFrame', policy)).toBe(true)
    expect(requestAllowed(url(files.secret), 'mainFrame', policy)).toBe(false)
    expect(requestAllowed(url(files.tplImage), 'mainFrame', policy)).toBe(false)
    expect(requestAllowed('data:text/html,hi', 'mainFrame', policy)).toBe(false)
  })

  it('loads files under the read roots and data: URLs', () => {
    const { files, policy } = fixture()
    expect(requestAllowed(url(files.tplImage), 'image', policy)).toBe(true)
    expect(requestAllowed(url(files.font) + '?v=1#x', 'font', policy)).toBe(true)
    expect(requestAllowed(url(files.photo), 'image', policy)).toBe(true)
    expect(requestAllowed('data:image/png;base64,AA', 'image', policy)).toBe(true)
  })

  it('refuses files outside the roots, a sibling of a file root, and other schemes', () => {
    const { files, policy, root } = fixture()
    expect(requestAllowed(url(files.secret), 'image', policy)).toBe(false)
    expect(requestAllowed(url(files.other), 'image', policy)).toBe(false)
    expect(requestAllowed(url(join(root, 'tpl', '..', 'secret.txt')), 'image', policy)).toBe(false)
    expect(requestAllowed(url(join(root, 'tpl-evil', 'x.png')), 'image', policy)).toBe(false)
    expect(requestAllowed(url(files.doc), 'image', policy)).toBe(false)
    expect(requestAllowed('https://example.com/a.png', 'image', policy)).toBe(false)
    expect(requestAllowed('file://evil.example/share/a.png', 'image', policy)).toBe(false)
    expect(requestAllowed(url(files.tplImage), 'subFrame', policy)).toBe(false)
  })

  it('judges a link by where it points, not where it sits', () => {
    const { files, policy, root } = fixture()
    const link = join(root, 'tpl', 'link.png')
    symlinkSync(files.secret, link)
    expect(requestAllowed(url(link), 'image', policy)).toBe(false)
  })

  it('refuses everything without a policy (between jobs)', () => {
    const { files } = fixture()
    expect(requestAllowed(url(files.tplImage), 'image', undefined)).toBe(false)
    expect(requestAllowed('data:image/png;base64,AA', 'image', undefined)).toBe(false)
  })
})
