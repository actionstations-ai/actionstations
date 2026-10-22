#!/usr/bin/env node
// Checks relative links in the repository's Markdown files: the target file or folder must
// exist, and a #fragment pointing into a Markdown file must match one of its headings
// (GitHub-style slugs). External links (http, https, mailto) are not fetched.
// Usage: node scripts/check-doc-links.mjs [file-or-dir ...]   (default: the whole repo)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const SKIP_DIRS = new Set([
  'node_modules',
  'out',
  'dist',
  'release',
  'test-results',
  'playwright-report',
  '.git',
  '.tmp',
  '.claude',
  '__golden__',
])
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/** All .md files under a directory, skipping build output and dependencies. */
export function findMarkdown(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...findMarkdown(join(dir, entry.name)))
    } else if (entry.name.endsWith('.md')) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

/** Remove fenced code blocks and inline code so links inside examples are ignored. */
export function stripCode(text) {
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))
}

/** GitHub heading slug: lower-case, drop punctuation, spaces to hyphens. */
export function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}

/** Slugs of every heading in a Markdown text, with GitHub's -1, -2 suffixes for repeats. */
export function headingSlugs(text) {
  const seen = new Map()
  const slugs = new Set()
  for (const line of stripCode(text).split('\n')) {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const base = slugify(m[1])
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    slugs.add(n ? `${base}-${n}` : base)
  }
  return slugs
}

/** Inline links and images: [text](target "title") → target. Reference definitions too. */
export function extractLinks(text) {
  const body = stripCode(text)
  const links = []
  const lineOf = (index) => body.slice(0, index).split('\n').length
  for (const m of body.matchAll(
    /!?\[(?:[^\]\n]|\][^(\n])*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
  ))
    links.push({ target: m[1], line: lineOf(m.index) })
  for (const m of body.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/gm))
    links.push({ target: m[1], line: lineOf(m.index) })
  return links
}

const slugCache = new Map()
function slugsOf(file) {
  if (!slugCache.has(file)) slugCache.set(file, headingSlugs(readFileSync(file, 'utf8')))
  return slugCache.get(file)
}

/** Problems for one Markdown file: [{ line, target, reason }]. */
export function checkFile(file) {
  const problems = []
  for (const { target, line } of extractLinks(readFileSync(file, 'utf8'))) {
    if (EXTERNAL.test(target)) continue
    const [rawPath, fragment] = target.split('#', 2)
    let path
    try {
      path = decodeURIComponent(rawPath)
    } catch {
      problems.push({ line, target, reason: 'malformed URL encoding' })
      continue
    }
    const dest = path ? resolve(dirname(file), path) : file
    if (!existsSync(dest)) {
      problems.push({ line, target, reason: 'file not found' })
      continue
    }
    if (fragment && dest.endsWith('.md') && statSync(dest).isFile()) {
      if (!slugsOf(dest).has(fragment.toLowerCase()))
        problems.push({ line, target, reason: `no heading #${fragment}` })
    }
  }
  return problems
}

function main(args) {
  const inputs = args.length ? args.map((a) => resolve(a)) : [ROOT]
  const files = inputs.flatMap((p) => (statSync(p).isDirectory() ? findMarkdown(p) : [p]))
  let count = 0
  for (const file of files) {
    for (const p of checkFile(file)) {
      count += 1
      console.error(`${relative(ROOT, file)}:${p.line}  ${p.target}  (${p.reason})`)
    }
  }
  if (count) {
    console.error(`✖ ${count} broken link(s) in ${files.length} Markdown files`)
    process.exit(1)
  }
  console.log(`✔ links ok in ${files.length} Markdown files`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname))
  main(process.argv.slice(2))
