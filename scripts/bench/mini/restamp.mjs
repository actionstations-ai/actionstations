#!/usr/bin/env node
// Re-stamp saved Mini run files with the current suite version and task-set hash, without any
// model call and without changing a score (#609). The Mini's published version is 1; runs saved
// while it was labelled 2 carry that label and the hash of the task set under it.
//
//   node scripts/bench/mini/restamp.mjs <run-dir-or-file> [...]
//
// Writes each file in place; keep a copy of the folder first.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadSuite } from '../corpus.mjs'
import { taskSetHash } from '../taskset.mjs'

/** The run with the current suite name, suite version and task-set hash; nothing else changes. */
export function restampRun(run, suite = loadSuite('mini'), hash = taskSetHash('mini')) {
  return { ...run, suite: 'mini', suiteVersion: suite.suiteVersion, taskSetHash: hash }
}

export function runFilesIn(path) {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path)
    .filter((f) => f.startsWith('mini-') && f.endsWith('.json'))
    .sort()
    .map((f) => join(path, f))
}

function main(paths) {
  if (!paths.length) throw new Error('usage: restamp.mjs <run-dir-or-file> [...]')
  for (const file of paths.flatMap((p) => runFilesIn(resolve(p)))) {
    const run = JSON.parse(readFileSync(file, 'utf8'))
    writeFileSync(file, `${JSON.stringify(restampRun(run), null, 2)}\n`)
    console.log(`restamped ${file}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
