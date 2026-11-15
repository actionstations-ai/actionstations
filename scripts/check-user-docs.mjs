#!/usr/bin/env node
// Guards the documentation published on the docs site. User pages must read as product
// documentation: no ADR or spec numbers, issue numbers, test files, source paths or developer
// commands. Developer pages (architecture, data model, conventions, contributing, templates) may
// name source paths and commands, but not the internal process records: no ADR, spec or issue
// numbers and no links into docs/adr/ or docs/specs/. Text inside fenced code blocks is not checked.
// Usage: node scripts/check-user-docs.mjs [root]   (default: the repository root)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')

export const PATTERNS = [
  { name: 'ADR number', re: /\bADR-?\d{3,4}\b/ },
  { name: 'spec number', re: /\b[Ss]pecs? \d{4}\b/ },
  { name: 'issue or PR number', re: /(^|[\s(,])#\d{2,4}\b/ },
  { name: 'test file', re: /\b[\w/-]+\.(test|spec|live\.test)\.tsx?\b/ },
  { name: 'source path', re: /\bsrc\/(main|renderer|shared|player)\// },
  { name: 'developer command', re: /\bpnpm (exec|test|e2e|build:check|ci:local)\b/ },
  { name: 'ADR or spec file', re: /\b(adr|specs)\/\d{4}-/ },
]

/** What developer pages may not mention: the process records, not the code. */
export const DEVELOPER_PATTERNS = PATTERNS.filter((p) =>
  ['ADR number', 'spec number', 'issue or PR number', 'ADR or spec file'].includes(p.name),
)

const SINGLE_FILES = [
  'docs/03-INJECT-TAXONOMY.md',
  'docs/04-TABLETOP-METHODOLOGY.md',
  'docs/packs-format.md',
  'docs/exercise-bundle-format.md',
  'docs/accessibility/ACR-508.md',
]

function markdownUnder(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...markdownUnder(full))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

/** Pages for developers, where commands and source paths are the point. */
export const DEVELOPER_DOCS = [
  'docs/02-ARCHITECTURE.md',
  'docs/05-DATA-MODEL.md',
  'docs/09-CODE-CONVENTIONS.md',
  'docs/guides/templates.md',
  'CONTRIBUTING.md',
]

/** The user-facing Markdown files under a repository root. */
export function userDocFiles(root) {
  const single = SINGLE_FILES.map((f) => join(root, f)).filter(existsSync)
  const exempt = new Set(DEVELOPER_DOCS.map((f) => join(root, f)))
  return [...markdownUnder(join(root, 'docs/guides')), ...single].filter((f) => !exempt.has(f))
}

/** Findings ({ line, name, text }) in one document, ignoring fenced code blocks. */
export function scanText(text, patterns = PATTERNS) {
  const findings = []
  let fence = null
  text.split('\n').forEach((line, i) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)
    if (marker) {
      if (!fence) fence = marker[1][0]
      else if (marker[1][0] === fence) fence = null
      return
    }
    if (fence) return
    for (const { name, re } of patterns) {
      const m = re.exec(line)
      if (m) findings.push({ line: i + 1, name, text: m[0].trim() })
    }
  })
  return findings
}

function main() {
  const root = resolve(process.argv[2] ?? REPO_ROOT)
  let count = 0
  const developer = DEVELOPER_DOCS.map((f) => join(root, f)).filter(existsSync)
  const pages = [
    ...userDocFiles(root).map((file) => ({ file, patterns: PATTERNS })),
    ...developer.map((file) => ({ file, patterns: DEVELOPER_PATTERNS })),
  ]
  for (const { file, patterns } of pages) {
    for (const f of scanText(readFileSync(file, 'utf8'), patterns)) {
      console.error(`${relative(root, file)}:${f.line}: ${f.name} "${f.text}"`)
      count++
    }
  }
  if (count > 0) {
    console.error(
      `\n${count} internal reference(s) in published docs. Describe the behavior instead.`,
    )
    process.exit(1)
  }
  console.log('published docs: no internal references')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname))
  main()
