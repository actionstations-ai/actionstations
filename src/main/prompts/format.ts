// Prompt file format (docs/05-DATA-MODEL.md §Prompt file format): YAML frontmatter + a
// Handlebars body split into sections by `<!-- @system -->`, `<!-- @context -->`,
// `<!-- @user -->` marker lines. Parsing reports problems with 1-based file line numbers.
import { createHash } from 'node:crypto'
import matterModule from 'gray-matter'
import { PromptFrontmatter } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { validateTemplate } from './template'

// gray-matter is CommonJS: default-import then use (named imports crash the built ESM main).
const matter = matterModule

export type SectionName = 'system' | 'context' | 'user'

export interface PromptIssue {
  /** 1-based line in the raw file. */
  line: number
  message: string
}

export interface PromptSection {
  /** Section text, trimmed. */
  text: string
  /** 1-based file line of the marker. */
  markerLine: number
  /** 1-based file line where `text` starts (first non-blank line after the marker). */
  startLine: number
}

export interface ParsedPrompt {
  frontmatter: PromptFrontmatter
  body: string
  sections: Partial<Record<SectionName, PromptSection>>
}

const MARKER_LINE = /^\s*<!--\s*@([A-Za-z_-]+)\s*-->\s*$/
const SECTION_NAMES: readonly SectionName[] = ['system', 'context', 'user']

export const hashRaw = (raw: string): string => createHash('sha256').update(raw).digest('hex')

/** Thrown when a prompt file is invalid; `details` carries the per-line issues. */
export function promptValidationError(file: string, issues: PromptIssue[]): AppError {
  const lines = issues.map((i) => `line ${i.line}: ${i.message}`).join('; ')
  return new AppError('VALIDATION', `Invalid prompt ${file}: ${lines}`, issues)
}

const countNewlines = (s: string): number => s.split('\n').length - 1

/** Find the frontmatter line declaring `key` (for line-specific schema errors). */
function lineOfKey(rawLines: string[], key: string | undefined, fmEndLine: number): number {
  if (!key) return 1
  const re = new RegExp(`^\\s*${key.replace(/[^A-Za-z0-9_]/g, '')}\\s*:`)
  for (let i = 1; i < fmEndLine && i < rawLines.length; i++) {
    if (re.test(rawLines[i] ?? '')) return i + 1
  }
  return 1
}

function yamlErrorLine(err: unknown): number {
  const mark = (err as { mark?: { line?: number } }).mark
  // gray-matter's YAML block begins with the newline after `---`, so the 0-based mark.line
  // counted inside it equals the 0-based file line; +1 makes it 1-based.
  return typeof mark?.line === 'number' ? mark.line + 1 : 1
}

interface Split {
  data: Record<string, unknown>
  body: string
  bodyStartLine: number
}

function splitFrontmatter(raw: string, issues: PromptIssue[]): Split | undefined {
  if (!raw.startsWith('---')) {
    issues.push({ line: 1, message: 'missing YAML frontmatter (file must start with ---)' })
    return undefined
  }
  try {
    const file = matter(raw, {})
    const prefix = raw.slice(0, raw.length - file.content.length)
    return {
      data: (file.data ?? {}) as Record<string, unknown>,
      body: file.content,
      bodyStartLine: countNewlines(prefix) + 1,
    }
  } catch (err) {
    const reason = (err as { reason?: string }).reason ?? (err as Error).message
    issues.push({ line: yamlErrorLine(err), message: `YAML frontmatter: ${reason}` })
    return undefined
  }
}

function checkFrontmatter(
  split: Split,
  expectedName: string,
  rawLines: string[],
  issues: PromptIssue[],
): PromptFrontmatter | undefined {
  const fmEnd = split.bodyStartLine - 1
  const parsed = PromptFrontmatter.safeParse(split.data)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = typeof issue.path[0] === 'string' ? issue.path[0] : undefined
      const where = issue.path.length ? `${issue.path.join('.')}: ` : ''
      issues.push({ line: lineOfKey(rawLines, key, fmEnd), message: `${where}${issue.message}` })
    }
    return undefined
  }
  if (parsed.data.name !== expectedName) {
    issues.push({
      line: lineOfKey(rawLines, 'name', fmEnd),
      message: `name "${parsed.data.name}" must equal the file name "${expectedName}"`,
    })
  }
  return parsed.data
}

/**
 * Split a body into sections at marker lines. Text before the first marker is a human
 * comment and is dropped. Problems are appended to `issues` (file line numbers).
 */
export function splitSections(
  body: string,
  bodyStartLine = 1,
  issues: PromptIssue[] = [],
): Partial<Record<SectionName, PromptSection>> {
  const sections: Partial<Record<SectionName, PromptSection>> = {}
  let current: { name: SectionName; markerLine: number; lines: string[] } | undefined
  const close = () => {
    if (!current) return
    const joined = current.lines.join('\n')
    const leading = countNewlines(/^\s*/.exec(joined)?.[0] ?? '')
    sections[current.name] = {
      text: joined.trim(),
      markerLine: current.markerLine,
      startLine: current.markerLine + 1 + leading,
    }
  }
  body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line, i) => {
      const fileLine = bodyStartLine + i
      const m = MARKER_LINE.exec(line)
      if (!m) {
        current?.lines.push(line)
        return
      }
      const name = m[1] as SectionName
      if (!SECTION_NAMES.includes(name)) {
        issues.push({ line: fileLine, message: `unknown section marker "@${m[1]}"` })
        return
      }
      if (sections[name] || current?.name === name) {
        issues.push({ line: fileLine, message: `duplicate section marker "@${name}"` })
      }
      close()
      current = { name, markerLine: fileLine, lines: [] }
    })
  close()
  return sections
}

function requireSections(
  sections: Partial<Record<SectionName, PromptSection>>,
  bodyStartLine: number,
  issues: PromptIssue[],
): void {
  for (const name of ['system', 'user'] as const) {
    if (!sections[name]) {
      issues.push({
        line: bodyStartLine,
        message: `missing required section marker <!-- @${name} -->`,
      })
    } else if (!sections[name].text) {
      issues.push({ line: sections[name].markerLine, message: `section @${name} is empty` })
    }
  }
}

function compileSections(
  sections: Partial<Record<SectionName, PromptSection>>,
  issues: PromptIssue[],
): void {
  for (const section of Object.values(sections)) {
    const problem = validateTemplate(section.text)
    if (problem) {
      issues.push({ line: section.startLine + problem.line - 1, message: problem.message })
    }
  }
}

/**
 * Parse and fully validate one prompt file. `file` names it in error messages.
 * Throws AppError('VALIDATION') with `details: PromptIssue[]`.
 */
export function parsePromptRaw(raw: string, expectedName: string, file: string): ParsedPrompt {
  const text = raw.replace(/\r\n?/g, '\n')
  const rawLines = text.split('\n')
  const issues: PromptIssue[] = []
  const split = splitFrontmatter(text, issues)
  if (!split) throw promptValidationError(file, issues)
  const frontmatter = checkFrontmatter(split, expectedName, rawLines, issues)
  const sections = splitSections(split.body, split.bodyStartLine, issues)
  requireSections(sections, split.bodyStartLine, issues)
  compileSections(sections, issues)
  if (issues.length || !frontmatter) throw promptValidationError(file, sortIssues(issues))
  return { frontmatter, body: split.body, sections }
}

const sortIssues = (issues: PromptIssue[]): PromptIssue[] =>
  [...issues].sort((a, b) => a.line - b.line)
