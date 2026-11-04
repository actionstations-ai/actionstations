#!/usr/bin/env node
// Score saved Mini run files again with the current speed figures and band reasons, without any
// model call (#610, #611). Quality, completion and damage are not touched: only what is derived
// from each call's own seconds and token counts (the tokens-per-second figures and the draft
// time) and from the result (the verdict's reasons) is recomputed, and the run is re-stamped
// with the current suite version and task-set hash.
//
//   node scripts/bench/mini/rescore.mjs <run-dir-or-file> [...]
//
// Writes each file in place and prints the speed figures before and after. Keep a copy of the
// folder first.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadSuite } from '../corpus.mjs'
import { rangeOf, speedOf } from './score.mjs'
import { restampRun, runFilesIn } from './restamp.mjs'
import { verdictOf } from './verdict.mjs'

/** The calls of a saved repeat, as the scorer saw them. */
export const callsOf = (repeat) =>
  Object.entries(repeat.probes).map(([key, p]) => ({
    key,
    ok: p.ok,
    seconds: p.seconds,
    inputTokens: p.inputTokens,
    outputTokens: p.outputTokens,
  }))

/** The run with speed, draft time and verdict recomputed from what it saved. */
export function rescoreRun(run, suite = loadSuite('mini')) {
  const repeats = run.repeats.map((r) => ({
    ...r,
    speed: { ...r.speed, ...speedOf({ calls: callsOf(r), budget: suite.scenarioBudget }) },
  }))
  const speeds = repeats.map((r) => r.speed)
  const result = {
    ...run.result,
    outputTokensPerSecond: rangeOf(speeds.map((s) => s.outputTokensPerSecond)),
    promptTokensPerSecond: rangeOf(speeds.map((s) => s.promptTokensPerSecond)),
    draftMinutes: rangeOf(speeds.map((s) => s.draftMinutes)),
  }
  const verdict = verdictOf({ result, repeats, bands: suite.bands })
  return restampRun({ ...run, repeats, result, verdict }, suite)
}

const figure = (r) => (r ? `${r.value} (${r.min} to ${r.max})` : 'n/a')

function main(paths) {
  if (!paths.length) throw new Error('usage: rescore.mjs <run-dir-or-file> [...]')
  for (const file of paths.flatMap((p) => runFilesIn(resolve(p)))) {
    const old = JSON.parse(readFileSync(file, 'utf8'))
    const run = rescoreRun(old)
    writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`)
    const name = old.model.ref ?? old.model.name
    console.log(
      `${name}: output tok/s ${figure(old.result.outputTokensPerSecond)} -> ${figure(run.result.outputTokensPerSecond)}; prompt tok/s ${figure(old.result.promptTokensPerSecond)} -> ${figure(run.result.promptTokensPerSecond)}; draft min ${figure(old.result.draftMinutes)} -> ${figure(run.result.draftMinutes)}`,
    )
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
