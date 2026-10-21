// Isolated Handlebars environment for prompt templates. Output is plain text for an LLM,
// not HTML: noEscape. Unknown helpers fail at compile time (knownHelpersOnly).
import HandlebarsModule from 'handlebars'

// handlebars is CommonJS: default-import (named imports crash the built ESM main process).
const hbs = HandlebarsModule.create()

type HelperOptions = { fn?: unknown; hash?: unknown }

/** Handlebars passes its options object as the last argument; strip it. */
function args(raw: unknown[]): unknown[] {
  const last = raw[raw.length - 1] as HelperOptions | undefined
  return last && typeof last === 'object' && 'hash' in last ? raw.slice(0, -1) : raw
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v))
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v])
const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

function itemText(item: unknown): string {
  if (item !== null && typeof item === 'object') return JSON.stringify(item)
  return str(item)
}

/** Prompt helpers. Keep in sync with the editor's help panel (routes/prompts/help.ts). */
export const PROMPT_HELPERS: Record<string, (...raw: unknown[]) => unknown> = {
  json: (...raw) => JSON.stringify(args(raw)[0] ?? null, null, 2),
  join: (...raw) => {
    const [items, sep] = args(raw)
    return list(items)
      .map(itemText)
      .join(typeof sep === 'string' ? sep : ', ')
  },
  eq: (...raw) => {
    const [a, b] = args(raw)
    return a === b
  },
  ne: (...raw) => {
    const [a, b] = args(raw)
    return a !== b
  },
  and: (...raw) => args(raw).every(Boolean),
  or: (...raw) => args(raw).some(Boolean),
  not: (...raw) => !args(raw)[0],
  inc: (...raw) => Number(args(raw)[0] ?? 0) + 1,
  upper: (...raw) => str(args(raw)[0]).toUpperCase(),
  lower: (...raw) => str(args(raw)[0]).toLowerCase(),
  default: (...raw) => {
    const [value, fallback] = args(raw)
    return isEmpty(value) ? fallback : value
  },
  bullets: (...raw) =>
    list(args(raw)[0])
      .map((item) => `- ${itemText(item)}`)
      .join('\n'),
  indent: (...raw) => {
    const [text, n] = args(raw)
    const pad = ' '.repeat(Math.max(0, Number(n ?? 2) || 0))
    return str(text)
      .split('\n')
      .map((line) => (line ? pad + line : line))
      .join('\n')
  },
}

for (const [name, fn] of Object.entries(PROMPT_HELPERS)) hbs.registerHelper(name, fn)

const BUILTIN_HELPERS = ['if', 'unless', 'each', 'with', 'lookup', 'log']

const COMPILE_OPTIONS = {
  noEscape: true,
  strict: false,
  knownHelpersOnly: true,
  knownHelpers: Object.fromEntries(
    [...BUILTIN_HELPERS, ...Object.keys(PROMPT_HELPERS)].map((n) => [n, true]),
  ),
} as const

export type CompiledTemplate = (vars: Record<string, unknown>) => string

export interface TemplateProblem {
  /** 1-based line within the template text. */
  line: number
  message: string
}

function problemLine(err: unknown): number {
  const e = err as { lineNumber?: number; message?: string }
  if (typeof e.lineNumber === 'number') return e.lineNumber
  const m = /line (\d+)/.exec(e.message ?? '')
  return m ? Number(m[1]) : 1
}

function cleanMessage(err: unknown): string {
  const msg = (err as Error).message ?? String(err)
  if (msg.startsWith('You specified knownHelpersOnly, but used the unknown helper ')) {
    return `unknown helper "${msg.slice('You specified knownHelpersOnly, but used the unknown helper '.length).split(' ')[0]}"`
  }
  // Parse errors: "Parse error on line 3:\n<excerpt>\n---^\nExpecting ..." — keep it on one line.
  return msg
    .replace(/ - \d+:\d+$/, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
}

/** Compile eagerly and report the first syntax / unknown-helper problem, if any. */
export function validateTemplate(text: string): TemplateProblem | undefined {
  try {
    hbs.precompile(text, COMPILE_OPTIONS)
    return undefined
  } catch (err) {
    return { line: problemLine(err), message: cleanMessage(err) }
  }
}

export function compileTemplate(text: string): CompiledTemplate {
  const fn = hbs.compile(text, COMPILE_OPTIONS)
  return (vars) => fn(vars)
}
