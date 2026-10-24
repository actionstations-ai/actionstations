// HTML rules of the template checker (#301). The checker judges the structure the renderer
// will see, not the source text:
//
//   1. Handlebars.parse() gives the template's AST (with whitespace control applied, as
//      rendering does). The checker writes a skeleton: literal content as is, every
//      expression ({{x}}, {{!…}}, each {{#block}} / {{else}} / {{/block}}) as an inert
//      placeholder <n> (private-use characters, never markup).
//   2. parse5 parses the skeleton as the body of a full document, as Chromium would.
//   3. Placeholders may only sit in text and in quoted attribute values; never in a tag or
//      attribute name, an end tag, a comment, or a raw-text element (<style>, <title>, …).
//      All markers of one block sit in the same text parent or the same attribute value, so
//      dropping or repeating a branch cannot change how the rest of the document parses.
//      No expression directly after "<", "</", "<!", "<!-" or "<?" (its output could form a tag).
//   4. Element and attribute rules run on the parsed tree (entities decoded), and CSS from
//      <style> and style="" goes through the CSS tokenizer (template-css.ts).
//   5. HTML comments must be plain: written exactly <!--text--> with no "--!>", "<!--" etc.
import Handlebars from 'handlebars'
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5'
import type { PackProblem } from '@shared/schemas/pack'
import { checkCss } from './template-css'
import { PLACEHOLDER, templateUrlProblem } from './template-url'

const BANNED_TAGS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'base',
  'form',
  'link',
  'portal',
  'fencedframe',
  'webview',
])
/** Attributes whose value is a URL the renderer would load or navigate to. */
const URL_ATTRS = new Set([
  'src',
  'href',
  'xlink:href',
  'poster',
  'action',
  'formaction',
  'data',
  'background',
  'lowsrc',
  'ping',
  'manifest',
  'codebase',
])
/** Elements whose text the tokenizer does not parse as markup (RAWTEXT / RCDATA / script). */
const RAW_TEXT = new Set([
  'style',
  'script',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
  'title',
  'textarea',
])
const PREFIX = '<!doctype html><html><head><meta charset="utf-8"></head><body><main>'
const SUFFIX = '</main></body></html>'

type Report = (message: string) => void

interface Marker {
  /** Block number for {{#…}} / {{else}} / {{/…}} markers. */
  block?: number
}

// ---- 1. Handlebars → skeleton -----------------------------------------------------------------

class Skeleton {
  text = ''
  readonly markers: Marker[] = []
  private blocks = 0
  private tail = ''

  constructor(private readonly report: Report) {}

  content(value: string): void {
    this.text += value
    this.tail = (this.tail + value).slice(-4)
  }

  mark(block?: number): void {
    if (/(?:<|<\/|<!-?|<\?)$/.test(this.tail))
      this.report(
        'a Handlebars expression right after "<" is not allowed (its output could form a tag)',
      )
    const id = this.markers.length
    this.markers.push(block === undefined ? {} : { block })
    this.text += `${id}`
  }

  program(p: hbs.AST.Program | undefined): void {
    for (const s of p?.body ?? []) this.statement(s)
  }

  statement(s: hbs.AST.Statement): void {
    switch (s.type) {
      case 'ContentStatement':
        return this.content((s as hbs.AST.ContentStatement).value)
      case 'MustacheStatement':
        if (!(s as hbs.AST.MustacheStatement).escaped)
          this.report('Handlebars unescaped output ({{{ }}} or {{& }}) is not allowed')
        return this.mark()
      case 'CommentStatement':
        return this.mark()
      case 'BlockStatement':
        return this.block(s as hbs.AST.BlockStatement)
      case 'PartialStatement':
      case 'PartialBlockStatement':
        return this.report('Handlebars partials ({{> }}) are not allowed')
      default: // Decorator, DecoratorBlock ({{#*inline}} partials)
        return this.report('Handlebars partials ({{> }}) and decorators ({{* }}) are not allowed')
    }
  }

  block(b: hbs.AST.BlockStatement): void {
    const k = this.blocks++
    this.mark(k)
    this.program(b.program)
    if (b.inverse) {
      this.mark(k)
      this.program(b.inverse)
    }
    this.mark(k)
  }
}

function buildSkeleton(html: string, report: Report): Skeleton | undefined {
  if (html.includes('{{{'))
    report('Handlebars triple-stash {{{ }}} (unescaped output) is not allowed')
  let ast: hbs.AST.Program
  try {
    ast = Handlebars.parse(html)
  } catch (e) {
    report(`Handlebars: ${(e as Error).message.split('\n')[0]}`)
    return undefined
  }
  const sk = new Skeleton(report)
  sk.program(ast)
  return sk
}

// ---- 2./3. parse and walk -----------------------------------------------------------------------

const markersIn = (s: string): number[] =>
  [...s.matchAll(PLACEHOLDER)].map((m) => Number(m[0].slice(1, -1)))
const hasMarker = (s: string): boolean => markersIn(s).length > 0

class Walker {
  /** marker id → contexts it was found in ("t<parent>" text, "a<element>:<attr>" value). */
  readonly seen = new Map<number, Set<string>>()
  private readonly ids = new WeakMap<object, number>()

  constructor(
    private readonly source: string,
    private readonly file: string,
    private readonly out: PackProblem[],
    private readonly report: Report,
  ) {}

  private count = 0

  private uid(node: object): number {
    let id = this.ids.get(node)
    if (id === undefined) {
      id = this.count++
      this.ids.set(node, id)
    }
    return id
  }

  private see(markers: number[], context: string): void {
    for (const m of markers) {
      const set = this.seen.get(m) ?? new Set<string>()
      set.add(context)
      this.seen.set(m, set)
    }
  }

  walk(node: T.ParentNode): void {
    for (const child of node.childNodes) {
      if (child.nodeName === '#text') this.text(child as T.TextNode)
      else if (child.nodeName === '#comment') this.comment(child as T.CommentNode)
      else if ('tagName' in child) {
        this.element(child)
        this.walk(child)
        if (child.tagName === 'template') this.walk((child as T.Template).content)
      }
    }
  }

  private text(node: T.TextNode): void {
    const markers = markersIn(node.value)
    if (!markers.length) return
    const parent = node.parentNode as T.Element | null
    const tag = parent && 'tagName' in parent ? parent.tagName.toLowerCase() : ''
    if (RAW_TEXT.has(tag)) this.report(`Handlebars expressions are not allowed inside <${tag}>`)
    this.see(markers, `t${this.uid(parent ?? node)}`)
  }

  private comment(node: T.CommentNode): void {
    if (hasMarker(node.data))
      this.report('Handlebars expressions are not allowed inside an HTML comment')
    const loc = node.sourceCodeLocation
    const raw = loc ? this.source.slice(loc.startOffset, loc.endOffset) : ''
    const d = node.data
    const plain =
      raw === `<!--${d}-->` &&
      !d.startsWith('>') &&
      !d.startsWith('->') &&
      !d.includes('<!--') &&
      !d.includes('-->') &&
      !d.includes('--!>') &&
      !d.endsWith('<!-')
    if (!plain) this.report('only plain HTML comments (<!-- text -->) are allowed')
  }

  private element(el: T.Element): void {
    const tag = el.tagName.toLowerCase()
    if (hasMarker(tag)) {
      this.report('a Handlebars expression inside a tag name is not allowed')
      return
    }
    if (BANNED_TAGS.has(tag)) this.report(`<${tag}> is not allowed`)
    for (const attr of el.attrs) this.attribute(el, tag, attr)
    if (tag === 'style') {
      const css = el.childNodes
        .map((c) => (c.nodeName === '#text' ? (c as T.TextNode).value : ''))
        .join('')
      checkCss(css, this.file, this.out)
    }
  }

  private attribute(el: T.Element, tag: string, attr: T.Element['attrs'][number]): void {
    const name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name
    if (hasMarker(name)) {
      this.report(`<${tag}>: a Handlebars expression inside an attribute name is not allowed`)
      return
    }
    const markers = markersIn(attr.value)
    if (markers.length) {
      if (!this.quoted(el, attr, name))
        this.report(`<${tag} ${name}>: a value with Handlebars expressions must be quoted`)
      this.see(markers, `a${this.uid(el)}:${name}`)
    }
    checkAttr(tag, name, attr.value, this.file, this.out, this.report)
  }

  private quoted(el: T.Element, attr: T.Element['attrs'][number], name: string): boolean {
    const attrs = el.sourceCodeLocation?.attrs
    const loc = attrs?.[name] ?? attrs?.[attr.name]
    if (!loc) return false
    return /^[^=]*=\s*["']/.test(this.source.slice(loc.startOffset, loc.endOffset))
  }
}

function checkAttr(
  tag: string,
  name: string,
  value: string,
  file: string,
  out: PackProblem[],
  report: Report,
): void {
  const lower = name.toLowerCase()
  const url = (v: string) => {
    const problem = templateUrlProblem(v)
    if (problem) report(`<${tag} ${name}>: ${problem}`)
  }
  if (lower.startsWith('on')) report(`<${tag} ${name}=…>: event handler attributes are not allowed`)
  else if (lower === 'style') checkCss(value, file, out, false)
  else if (lower === 'srcset' || lower === 'imagesrcset') {
    for (const candidate of value.split(',')) url(candidate.trim().split(/\s+/)[0] ?? '')
  } else if (URL_ATTRS.has(lower)) url(value)
  else if (lower === 'http-equiv') report(`<${tag} http-equiv> is not allowed`)
  else if (lower === 'attributename' && /href/i.test(value) && /^(animate|set)$/i.test(tag))
    report(`<${tag} attributeName="${value}"> is not allowed`)
}

/** Every expression placed; each block's markers share one context. */
function checkPlacement(sk: Skeleton, seen: Map<number, Set<string>>, report: Report): void {
  const blockContexts = new Map<number, Set<string>>()
  sk.markers.forEach((m, id) => {
    const contexts = seen.get(id)
    if (!contexts) return
    if (m.block === undefined) return
    const set = blockContexts.get(m.block) ?? new Set<string>()
    for (const c of contexts) set.add(c)
    blockContexts.set(m.block, set)
  })
  const unplaced = sk.markers.some((_, id) => !seen.has(id))
  if (unplaced)
    report(
      'a Handlebars expression sits where markup is not checked (an end tag, a doctype, a comment or a raw-text element)',
    )
  for (const set of blockContexts.values())
    if (set.size > 1)
      report(
        'a Handlebars block ({{#…}} … {{else}} … {{/…}}) must open, branch and close inside the same element or attribute value',
      )
}

/** HTML rules for template.html (Handlebars source, checked as the renderer will parse it). */
export function checkTemplateHtml(html: string, file: string, out: PackProblem[]): void {
  const seen = new Set<string>()
  const report: Report = (message) => {
    if (seen.has(message)) return
    seen.add(message)
    out.push({ path: file, message })
  }
  const sk = buildSkeleton(html, report)
  if (!sk) return
  const source = PREFIX + sk.text + SUFFIX
  const walker = new Walker(source, file, out, report)
  walker.walk(parse(source, { sourceCodeLocationInfo: true, scriptingEnabled: true }))
  checkPlacement(sk, walker.seen, report)
}
