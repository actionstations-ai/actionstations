#!/usr/bin/env node
// Guards the user-facing documentation (the published docs site): it must read as product
// documentation, so it may not mention ADR or spec numbers, issue numbers, test files, source
// paths or developer commands. Text inside fenced code blocks is not checked.
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
]

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

/** Guides written for contributors, where commands and source paths are the point. */
export const CONTRIBUTOR_GUIDES = ['docs/guides/templates.md']

/** The user-facing Markdown files under a repository root. */
export function userDocFiles(root) {
  const single = SINGLE_FILES.map((f) => join(root, f)).filter(existsSync)
  const exempt = new Set(CONTRIBUTOR_GUIDES.map((f) => join(root, f)))
  return [...markdownUnder(join(root, 'docs/guides')), ...single].filter((f) => !exempt.has(f))
}

/** Findings ({ line, name, text }) in one document, ignoring fenced code blocks. */
export function scanText(text) {
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
    for (const { name, re } of PATTERNS) {
      const m = re.exec(line)
      if (m) findings.push({ line: i + 1, name, text: m[0].trim() })
    }
  })
  return findings
}

function main() {
  const root = resolve(process.argv[2] ?? REPO_ROOT)
  let count = 0
  for (const file of userDocFiles(root)) {
    for (const f of scanText(readFileSync(file, 'utf8'))) {
      console.error(`${relative(root, file)}:${f.line}: ${f.name} "${f.text}"`)
      count++
    }
  }
  if (count > 0) {
    console.error(
      `\n${count} internal reference(s) in user-facing docs. Describe the behavior instead.`,
    )
    process.exit(1)
  }
  console.log('user-facing docs: no internal references')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname))
  main()
