// URL rule of the template checker: a template may only point at its own folder.

/** Handlebars expressions in source text. */
const MUSTACHE = /\{\{[\s\S]*?\}\}/g
/** Stand-ins for Handlebars expressions in the checker's skeleton (see template-html.ts). */
export const PLACEHOLDER = /\d+/g
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const DATA_OK = /^data:(?:image|font)\//i

/** Why a URL is not allowed in a template, or undefined when it is local. */
export function templateUrlProblem(raw: string): string | undefined {
  // Values filled in by Handlebars come from the app (fields, assets): only the literal
  // parts of the value are the template's own.
  // As the URL parser does: drop tabs and newlines anywhere, C0 controls and spaces at the ends.
  const url = raw
    .replace(MUSTACHE, '')
    .replace(PLACEHOLDER, '')
    .replace(/[\t\n\r]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/^[\u0000- ]+|[\u0000- ]+$/g, '')
  const shown = raw.replace(PLACEHOLDER, '{{…}}')
  if (url === '' || url.startsWith('#')) return undefined
  if (DATA_OK.test(url)) return undefined
  if (SCHEME.test(url) || url.startsWith('//') || url.startsWith('\\'))
    return `"${shown}" is not allowed (only files of the template folder and data:image or data:font URLs)`
  if (url.startsWith('/'))
    return `"${shown}" is an absolute path; use a path inside the template folder`
  const path = url.split(/[?#]/)[0]!
  if (path.split(/[/\\]/).some((s) => s === '..'))
    return `"${shown}" points outside the template folder`
  return undefined
}
