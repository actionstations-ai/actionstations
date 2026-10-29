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

  // Security review of #274 (#301): each of these passed the regex checker and rendered
  // dangerous HTML. The checker now judges the Handlebars AST and a real HTML parse.
  it.each([
    ['comment splitting a tag name', '<div><scr{{!}}ipt>alert(1)</scr{{!}}ipt></div>', /tag name/],
    ['value splitting a tag name', '<div><scr{{nope}}ipt>x</scr{{nope}}ipt></div>', /tag name/],
    ['comment before an attribute', '<img src="a.png" {{!}}onerror="alert(1)">', /attribute name/],
    ['comment inside an attribute name', '<img src="a.png" o{{!}}nerror="x()">', /attribute name/],
    ['comment before src', '<img {{!}}src="https://evil.example/b.png">', /attribute name/],
    ['abruptly closed comment', '<!--><img src="a.png">-->', /plain HTML comments/],
    ['comment closed with --!>', '<!-- --!><img src="a.png"> -->', /plain HTML comments/],
    [
      'meta refresh behind a comment',
      '<meta {{!}}http-equiv="refresh" content="0;url=file:///etc/hosts">',
      /attribute name/,
    ],
    ['style tag split by a comment', '<sty{{!}}le>@import url(x.css);</sty{{!}}le>', /tag name/],
    ['CSS escape in @import', '<style>@\\69mport "https://evil.example/e.css";</style>', /@import/],
    [
      'CSS escape in url( in style=""',
      '<div style="background:u\\72l(https://evil.example/f.png)"></div>',
      /CSS url\(\)/,
    ],
    [
      'CSS escape in url( in <style>',
      '<style>.a{background:\\75rl(https://evil.example/g.png)}</style>',
      /CSS url\(\)/,
    ],
    ['entity-encoded scheme', '<img src="&#x68;ttps://evil.example/h.png">', /is not allowed/],
    ['tab inside a scheme', '<img src="jav&#9;ascript:x()">', /is not allowed/],
    ['expression right after <', '<{{fields.tag}}>', /right after "<"/],
    ['expression right after </', '<p></{{fields.tag}}>', /right after "<"/],
    ['expression in an unquoted value', '<img alt={{fields.alt}} src="a.png">', /must be quoted/],
    ['expression inside an HTML comment', '<!-- {{fields.x}} -->', /inside an HTML comment/],
    ['expression inside <style>', '<style>.a{color:{{fields.c}} }</style>', /inside <style>/],
    [
      'block whose branches change quote parity',
      '<img alt="{{#if fields.a}}">{{/if}}<b title=" x=1 onerror=alert(1) ">',
      /same element or attribute value/,
    ],
    [
      'block opening a raw-text element',
      '{{#if fields.a}}<title>{{/if}}<b>x</b></title>',
      /inside <title>|same element/,
    ],
    ['unescaped {{& }}', '<p>{{& fields.x}}</p>', /unescaped output/],
    ['inline partial', '{{#*inline "x"}}<p></p>{{/inline}}', /partials/],
    ['script in SVG', '<svg><script href="a.js"></script></svg>', /<script> is not allowed/],
  ])('refuses %s (#301)', (_name, html, re) => {
    expect(messages(html)).toMatch(re)
  })

  it('refuses a style.css that closes its <style> element (#301)', () => {
    const css =
      '.x{color:red}</style><meta http-equiv="refresh" content="0;url=../../.aws/credentials"><style>'
    expect(messages('<div>ok</div>', { 'style.css': css })).toMatch(
      /style.css: "<" is not allowed in CSS/,
    )
  })

  it.each([
    ['@\\69mport "x.css";', /@import/],
    ['.a{background:u\\72l(https://x.test/a.png)}', /CSS url\(\)/],
    ['.a{background:url("https://x.test/a.png")}', /CSS url\(\)/],
    ['.a{background:image-set("https://x.test/a.png" 1x)}', /image-set\(\)/],
    ['.a{width:ex\\70ression(alert(1))}', /expression\(\)/],
    ['.a{-moz-bind\\69ng:url(a.xml)}', /-moz-binding/],
    ['.a{background:url(https://x.test/a.png', /CSS url\(\)/],
  ])('refuses CSS %s after resolving escapes (#301)', (css, re) => {
    expect(messages('<p></p>', { 'style.css': css })).toMatch(re)
  })

  it('accepts blocks that stay inside one element or attribute value', () => {
    expect(
      check(
        '<div class="a {{#if fields.x}}on{{else}}off{{/if}}">' +
          '{{#each fields.items}}<p title="{{this}}">{{@index}}</p>{{else}}<p>none</p>{{/each}}' +
          '{{#if fields.y}}<span>{{fields.y}}</span>{{/if}}</div><!-- plain note -->',
      ),
    ).toEqual([])
  })

  it('templateUrlProblem judges only the literal parts of a Handlebars value', () => {
    expect(templateUrlProblem('{{assets.photo}}')).toBeUndefined()
    expect(templateUrlProblem('https://x.test/{{id}}.png')).toMatch(/not allowed/)
  })
})

describe('labels files (spec 0435 FR-4)', () => {
  const html = '<p>{{t "hello"}}</p>'
  const problems = (name: string, content: string) =>
    check(html, { [name]: content }).map((p) => `${p.path}: ${p.message}`)

  it('accepts labels/<language>.json as a flat map of strings', () => {
    expect(problems('labels/es.json', '{"hello":"hola"}')).toEqual([])
    expect(problems('labels/es-US.json', '{}')).toEqual([])
  })

  it('refuses nested values, non-JSON, odd names and files over 64 KB', () => {
    expect(problems('labels/es.json', '{"a":{"b":"c"}}')).toEqual([
      'labels/es.json: must be a flat map of strings',
    ])
    expect(problems('labels/es.json', 'nope')).toEqual(['labels/es.json: not valid JSON'])
    expect(problems('labels/Spanish.json', '{}')).toEqual([
      'labels/Spanish.json: label files are labels/<language>.json',
    ])
    expect(problems('labels/es.json', JSON.stringify({ a: 'x'.repeat(70_000) }))).toEqual([
      'labels/es.json: larger than 64 KB',
    ])
  })
})
