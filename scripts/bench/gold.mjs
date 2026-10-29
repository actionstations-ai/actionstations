#!/usr/bin/env node
// The gold-standard MSEL statistics the structure rubric compares against (#434, FR-12):
// reference/scenario-3/msel.md parsed into bench/gold/scenario-3.json (committed; a unit test
// fails when the committed file is stale).
//
//   node scripts/bench/gold.mjs [--check]
//
// Purpose tags: the markdown marks some rows in the text ("SCENARIO JUMP", "CRITICAL DECISION
// POINT", "(Noise)", "(Red Herring)"); the others take the tag of the same row id in the
// hand-tagged copy shipped with the airport example ("Flight to Nowhere").
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeFormatted } from './write.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const GOLD_SOURCE = 'reference/scenario-3/msel.md'
export const GOLD_TAGGED =
  'examples/airport-ncia/project/scenarios/01M5HX52XAMK7TGTH69SFTTJRG/scenario.json'
export const GOLD_FILE = 'bench/gold/scenario-3.json'

/** Tag groups the drafted MSEL must cover when the gold does (FR-12). */
export const TAG_GROUPS = [
  ['CORE_NARRATIVE'],
  ['NOISE', 'RED_HERRING'],
  ['PRESSURE', 'MISINFORMATION'],
  ['CLUE'],
  ['DECISION_POINT'],
  ['TIME_JUMP'],
]

const minutes = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

/** Rows and phases of a markdown MSEL in the reference layout. */
export function parseMsel(md) {
  const phases = []
  const rows = []
  for (const line of md.split('\n')) {
    const phase = /^##\s+Phase\s+(\d+):\s*(.+?)\s*\(Hour\s+([\d:]+)\s*[–-]\s*([\d:]+)\)/.exec(line)
    if (phase) {
      phases.push({
        index: phases.length,
        title: phase[2],
        startMin: minutes(phase[3]),
        endMin: minutes(phase[4]),
      })
      continue
    }
    if (!/^\|\s*\d+:\d\d\s*\|/.test(line) || !phases.length) continue
    const [time, id, from, to, event, expectedAction] = cells(line)
    rows.push({ id, time, from, to, event, expectedAction, phase: phases.length - 1 })
  }
  return { phases, rows }
}

/** The row's purpose tag: marked in the text, else the hand-tagged copy's, else core. */
export function goldTag(row, tagged = {}) {
  const text = `${row.event} ${row.expectedAction}`
  if (row.id === 'START') return 'STARTEX'
  if (row.id === 'END') return 'ENDEX'
  if (/SCENARIO JUMP/i.test(text)) return 'TIME_JUMP'
  if (/DECISION POINT/i.test(text)) return 'DECISION_POINT'
  if (/\(Noise\)/i.test(text)) return 'NOISE'
  if (/\(Red Herring\)/i.test(text)) return 'RED_HERRING'
  return tagged[row.id] ?? 'CORE_NARRATIVE'
}

const round2 = (n) => Math.round(n * 100) / 100

/** The statistics the rubric reads: pace per phase, tag counts, covered groups. */
export function goldStats(md, tagged = {}) {
  const { phases, rows } = parseMsel(md)
  const control = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])
  const tags = rows.map((r) => goldTag(r, tagged))
  const counts = {}
  for (const t of tags) counts[t] = (counts[t] ?? 0) + 1
  const perPhase = phases.map((p) => {
    const n = rows.filter((r, i) => r.phase === p.index && !control.has(tags[i])).length
    return { ...p, rows: n, rowsPerHour: round2(n / ((p.endMin - p.startMin) / 60)) }
  })
  const durationHours = (phases.at(-1).endMin - phases[0].startMin) / 60
  const content = rows.filter((_, i) => !control.has(tags[i])).length
  const rates = perPhase.map((p) => p.rowsPerHour)
  return {
    source: GOLD_SOURCE,
    durationHours,
    rows: rows.length,
    contentRows: content,
    rowsPerHour: {
      overall: round2(content / durationHours),
      min: Math.min(...rates),
      max: Math.max(...rates),
    },
    phases: perPhase,
    tags: counts,
    groups: TAG_GROUPS.filter((g) => g.some((t) => counts[t])),
    decisionPhases: [
      ...new Set(rows.filter((_, i) => tags[i] === 'DECISION_POINT').map((r) => r.phase)),
    ],
  }
}

/** The gold file's content from the repository's sources. */
export function buildGold(root = ROOT) {
  const md = readFileSync(join(root, GOLD_SOURCE), 'utf8')
  const seed = JSON.parse(readFileSync(join(root, GOLD_TAGGED), 'utf8'))
  const tagged = Object.fromEntries(seed.msel.map((r) => [r.id, r.purposeTag]))
  return goldStats(md, tagged)
}

export const goldJson = (gold) => JSON.stringify(gold, null, 2) + '\n'

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const text = goldJson(buildGold())
  const file = join(ROOT, GOLD_FILE)
  if (process.argv.includes('--check')) {
    // Compared as data: Prettier may lay the committed file out differently.
    if (
      JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))) !== JSON.stringify(JSON.parse(text))
    ) {
      console.error(`${GOLD_FILE} is stale: run node scripts/bench/gold.mjs`)
      process.exit(1)
    }
  } else {
    await writeFormatted(file, text)
    console.log(`wrote ${GOLD_FILE}`)
  }
}
