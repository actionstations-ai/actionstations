// scripts/bench/taskset.mjs: the public task set and its hash (#586).
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  exportTaskSet,
  hashFiles,
  taskSetFiles,
  taskSetHash,
  taskSetManifest,
} from '../../scripts/bench/taskset.mjs'

describe('task set', () => {
  it('lists the suite, its defect files, the gold, the judge files and the corpus manifest', () => {
    const paths = Object.keys(taskSetFiles('quick'))
    expect(paths).toEqual(
      expect.arrayContaining([
        'suite.json',
        'gold/scenario-3.json',
        'judge/bench_judge.md',
        'judge/calibration-rows.json',
        'corpus.json',
        'defects/city-water-chem.json',
      ]),
    )
  })

  it('hashes the same files to the same value and a changed file to another', () => {
    const files = taskSetFiles('quick')
    expect(hashFiles(files)).toBe(taskSetHash('quick'))
    expect(hashFiles({ ...files, 'suite.json': `${files['suite.json']} ` })).not.toBe(
      taskSetHash('quick'),
    )
  })

  it('hashes the standard and quick suites differently', () => {
    expect(taskSetHash('standard')).not.toBe(taskSetHash('quick'))
  })

  it('writes a folder whose files re-hash to the manifest hash', () => {
    const out = mkdtempSync(join(tmpdir(), 'taskset-'))
    const { dir, manifest } = exportTaskSet('quick', out)
    const files = Object.fromEntries(
      Object.keys(manifest.files).map((p) => [p, readFileSync(join(dir, p), 'utf8')]),
    )
    expect(hashFiles(files)).toBe(manifest.hash)
    expect(manifest).toEqual(taskSetManifest('quick'))
  })

  it('carries the drafting brief and corpus hash of each example in corpus.json', () => {
    const corpus = JSON.parse(taskSetFiles('quick')['corpus.json']!)
    expect(corpus['city-water'].corpusHash).toMatch(/^[0-9a-f]{16}$/)
    expect(corpus['city-water'].briefs['city-water-chem'].threatFamily).toBeTruthy()
  })
})
