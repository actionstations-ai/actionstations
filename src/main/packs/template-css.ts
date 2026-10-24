// CSS rules of the template checker (#301). CSS is tokenized per CSS Syntax 3 by
// @csstools/css-tokenizer, so escapes (`@\69mport`, `u\72l(`) are resolved and comments are
// tokens before any rule looks at a name; the rules never match on the raw text.
import { tokenize, type CSSToken } from '@csstools/css-tokenizer'
import type { PackProblem } from '@shared/schemas/pack'
import { templateUrlProblem } from './template-url'

/** Functions whose string arguments (or url-token) the browser fetches. */
const URL_FUNCTIONS = new Set([
  'url',
  'src',
  'image',
  '-webkit-image',
  'image-set',
  '-webkit-image-set',
  'cross-fade',
  '-webkit-cross-fade',
])
const BANNED_FUNCTIONS = new Set(['expression'])
const BANNED_IDENTS = new Set(['behavior', '-moz-binding'])

type Report = (message: string) => void

const lower = (token: CSSToken): string => {
  const data = token[4] as { value?: unknown } | null
  return typeof data?.value === 'string' ? data.value.toLowerCase() : ''
}
const valueOf = (token: CSSToken): string => {
  const data = token[4] as { value?: unknown } | null
  return typeof data?.value === 'string' ? data.value : ''
}

function checkUrlValue(fn: string, value: string, report: Report): void {
  const problem = templateUrlProblem(value)
  if (problem) report(`CSS ${fn === 'url' ? 'url()' : `${fn}()`}: ${problem}`)
}

/** Walk the tokens once, tracking which functions the current token sits inside. */
function checkTokens(tokens: CSSToken[], report: Report): void {
  const stack: string[] = []
  for (const token of tokens) {
    const type = token[0] as string
    if (type === 'at-keyword-token' && lower(token) === 'import')
      report('CSS @import is not allowed')
    else if (type === 'function-token') {
      const name = lower(token)
      if (BANNED_FUNCTIONS.has(name)) report(`CSS ${name}() is not allowed`)
      stack.push(name)
    } else if (type === '(-token') stack.push('(')
    else if (type === ')-token') stack.pop()
    else if (type === 'url-token') checkUrlValue('url', valueOf(token), report)
    else if (type === 'bad-url-token') report('CSS url(): malformed url() is not allowed')
    else if (type === 'string-token') {
      const fn = stack.findLast((f) => URL_FUNCTIONS.has(f))
      if (fn) checkUrlValue(fn, valueOf(token), report)
    } else if (type === 'ident-token' && BANNED_IDENTS.has(lower(token)))
      report('CSS -moz-binding / behavior is not allowed')
  }
}

/**
 * CSS rules: no @import, no expression(), no legacy script bindings, local URLs only in
 * url(), src(), image-set() and friends. `inStyleElement`: the text ends up inside a
 * <style> element (style.css, <style>), where a `<` could close it; style="" values pass false.
 */
export function checkCss(
  css: string,
  file: string,
  out: PackProblem[],
  inStyleElement = true,
): void {
  const seen = new Set<string>()
  const report: Report = (message) => {
    if (seen.has(message)) return
    seen.add(message)
    out.push({ path: file, message })
  }
  if (inStyleElement && css.includes('<'))
    report('"<" is not allowed in CSS (it could close the <style> element)')
  checkTokens(tokenize({ css }), report)
}
