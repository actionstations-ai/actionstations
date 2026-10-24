import { mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkTemplateFiles, templateUrlProblem } from './template-check'

const OK_CSS = '.a { color: red; }'
const check = (html: string, extra: Record<string, string> = {}) =>
  checkTemplateFiles(new Map(Object.entries({ 'template.html': html, ...extra })))
const messages = (html: string, extra?: Record<string, string>) =>
  check(html, extra)
    .map((p) => `${p.path}: ${p.message}`)
    .join('\n')

describe('checkTemplateFiles', () => {
  it('accepts every built-in template', () => {
    const root = resolve('templates/injects')
    const types = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
    expect(types.length).toBeGreaterThan(10)
    for (const type of types)
      expect([type, checkTemplateFiles(join(root, type))]).toEqual([type, []])
  })

  it('accepts local files, fragments, data:image / data:font and Handlebars values', () => {
    expect(
      check(
        '<img src="a.png"><img src="{{assets.photo}}"><use href="#x"/><img src="data:image/png;base64,AA">' +
          '<div style="background:url(img/b.png)"></div>',
        { 'style.css': "@font-face{src:url('data:font/woff2;base64,AA')} .x{background:url(#g)}" },
      ),
    ).toEqual([])
  })

  it.each([
    ['<script>x()</script>', /<script> is not allowed/],
    ['<SCRIPT src="a.js"></SCRIPT>', /<script> is not allowed/],
    ['<iframe src="a.html"></iframe>', /<iframe> is not allowed/],
    ['<object data="a"></object>', /<object> is not allowed/],
    ['<embed src="a">', /<embed> is not allowed/],
    ['<base href="a/">', /<base> is not allowed/],
    ['<form></form>', /<form> is not allowed/],
    ['<link rel="stylesheet" href="a.css">', /<link> is not allowed/],
    ['<meta http-equiv="refresh" content="0">', /<meta http-equiv> is not allowed/],
    ['<img src="a.png" onerror="x()">', /event handler attributes/],
    ['<body ONLOAD=x()>', /event handler attributes/],
    ['<svg onload="x()"></svg>', /event handler attributes/],
    ['<a href="javascript:alert(1)">x</a>', /"javascript:alert\(1\)" is not allowed/],
    ['<img src="https://example.com/a.png">', /is not allowed/],
    ['<img src="//example.com/a.png">', /is not allowed/],
    ['<img src="file:///etc/passwd">', /is not allowed/],
    ['<img src="/abs.png">', /absolute path/],
    ['<img src="../other/a.png">', /outside the template folder/],
    ['<img srcset="a.png 1x, https://x.test/b.png 2x">', /<img srcset>/],
    ['<video poster="http://x.test/p.png"></video>', /<video poster>/],
    ['<img src="data:text/html,<script>">', /is not allowed/],
    ['<div style="background:url(http://x.test/a.png)"></div>', /CSS url\(\)/],
    ['<style>@import "x.css";</style>', /@import is not allowed/],
    ['<style>.a{width:expression(alert(1))}</style>', /expression\(\) is not allowed/],
    ['<p>{{{raw}}}</p>', /triple-stash/],
    ['{{> header}}', /partials/],
    ['{{#> layout}}x{{/layout}}', /partials/],
    ['<svg><set attributeName="href" to="javascript:x()"/></svg>', /attributeName/],
  ])('refuses %s', (html, re) => {
    expect(messages(html)).toMatch(re)
  })

  it('checks style.css and preview.json assets', () => {
    const out = messages('<p></p>', {
      'style.css': '@import url("x.css");\n.b{background:url( "https://cdn.test/x.png" )}',
      'preview.json': JSON.stringify({ fields: {}, assets: { photo: 'https://x.test/a.jpg' } }),
    })
    expect(out).toMatch(/style.css: CSS @import/)
    expect(out).toMatch(/style.css: CSS url\(\): "https:\/\/cdn.test\/x.png"/)
    expect(out).toMatch(/preview.json: assets.photo/)
  })

  it('ignores markup inside HTML and CSS comments', () => {
    expect(check('<!-- <script> -->', { 'style.css': `/* @import "x"; */ ${OK_CSS}` })).toEqual([])
  })

  it('refuses other HTML files, SVG and scripts as files', () => {
    const out = messages('<p></p>', { 'other.html': '', 'icon.svg': '', 'a.js': '' })
    expect(out).toMatch(/other.html: the only HTML file/)
    expect(out).toMatch(/icon.svg: .svg not allowed/)
    expect(out).toMatch(/a.js: .js not allowed/)
  })

  it('reports a missing template.html and links in a folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tpl-'))
    writeFileSync(join(dir, 'style.css'), OK_CSS)
    symlinkSync('/etc/hosts', join(dir, 'hosts.css'))
    const out = checkTemplateFiles(dir).map((p) => `${p.path}: ${p.message}`)
    expect(out).toContain('template.html: missing')
    expect(out).toContain('hosts.css: links are not allowed in a template')
  })

  it('templateUrlProblem judges only the literal parts of a Handlebars value', () => {
    expect(templateUrlProblem('{{assets.photo}}')).toBeUndefined()
    expect(templateUrlProblem('https://x.test/{{id}}.png')).toMatch(/not allowed/)
  })
})
