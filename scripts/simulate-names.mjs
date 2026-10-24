#!/usr/bin/env node
// Released examples use simulated names; only federal and state agencies stay real (#283).
// examples/simulated-names.json holds the ordered replacements; make-example applies them to
// imported documents and seeds, and this script applies them to files in place:
//
//   node scripts/simulate-names.mjs <file-or-dir>…   rewrite .json/.md/.txt files, list changes
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const NAMES_FILE = join(ROOT, 'examples/simulated-names.json')

/** The ordered [RegExp, replacement] pairs of a names file. */
export function loadNames(file = NAMES_FILE) {
  const { replace } = JSON.parse(readFileSync(file, 'utf8'))
  return replace.map(([pattern, to]) => [new RegExp(pattern, 'g'), to])
}

/** `text` with every pair applied in order. */
export function simulateNames(text, names = loadNames()) {
  return names.reduce((s, [re, to]) => s.replace(re, to), text)
}

const TEXT = new Set(['.json', '.md', '.txt'])

function walk(path) {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((name) => walk(join(path, name)))
}

/** Rewrite the text files under `paths`; returns the files that changed. */
export function simulateFiles(paths, names = loadNames()) {
  const changed = []
  for (const file of paths.flatMap(walk)) {
    if (!TEXT.has(extname(file))) continue
    const before = readFileSync(file, 'utf8')
    const after = simulateNames(before, names)
    if (after === before) continue
    writeFileSync(file, after)
    changed.push(file)
  }
  return changed
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const changed = simulateFiles(process.argv.slice(2).map((p) => resolve(p)))
  for (const f of changed) console.log(`changed ${f}`)
  console.log(`${changed.length} file(s) changed`)
}
