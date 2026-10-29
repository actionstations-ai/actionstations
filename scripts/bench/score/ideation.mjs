// Ideation scores (#434, FR-13): valid ideas out of the count asked for, distinctness, citation
// resolution of sectionsExercised, threat-family spread and grounding of whyItTeaches (the
// source check of #423, grounding:ideas). Distinctness compares title + hook with a
// term-frequency cosine: deterministic and the same on every machine, unlike an embedding
// model whose numbers depend on its runtime.
import { supportScore } from './grounding.mjs'
import { share } from './util.mjs'

const STOP = new Set(
  'a an and are as at be by for from has in into is it its of on or that the their this to with while'.split(
    ' ',
  ),
)

export function termVector(text) {
  const v = new Map()
  for (const w of text.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? []) {
    if (STOP.has(w)) continue
    v.set(w, (v.get(w) ?? 0) + 1)
  }
  return v
}

export function cosine(a, b) {
  let dot = 0
  for (const [k, x] of a) dot += x * (b.get(k) ?? 0)
  const norm = (v) => Math.sqrt([...v.values()].reduce((n, x) => n + x * x, 0))
  const d = norm(a) * norm(b)
  return d > 0 ? dot / d : 0
}

/** Ideas that have a near twin (cosine ≥ threshold) among the others. */
export function nearDuplicates(ideas, threshold) {
  const vectors = ideas.map((i) => termVector(`${i.title} ${i.hook}`))
  const dup = new Set()
  for (let i = 0; i < ideas.length; i++)
    for (let j = i + 1; j < ideas.length; j++)
      if (cosine(vectors[i], vectors[j]) >= threshold) {
        dup.add(i)
        dup.add(j)
      }
  return dup
}

/** Keys the ideate job log reports as dropped ('Idea "x" cited unknown keys a, b; dropped'). */
export function droppedIdeaKeys(logEntries) {
  let n = 0
  for (const e of logEntries) {
    const m = /cited unknown keys (.+); dropped/.exec(e.message ?? '')
    if (m) n += m[1].split(',').filter((k) => k.trim()).length
  }
  return n
}

/** Parts 0–100: valid, distinct, resolution, spread. */
/** `grounding`: grounding:ideas results by idea id; without it the part is left out. */
export function ideationScore(ideas, { count, dropped, threshold, grounding }) {
  const valid = ideas.filter((i) => i.title?.trim() && i.hook?.trim())
  const dup = nearDuplicates(valid, threshold)
  const kept = valid.reduce((n, i) => n + (i.sectionsExercised?.length ?? 0), 0)
  const families = new Set(valid.map((i) => i.threatFamily).filter(Boolean))
  const support = grounding ? supportScore(valid.map((i) => grounding[i.id])) : undefined
  return {
    valid: Math.min(1, share(valid.length, count)) * 100,
    distinct: valid.length ? (1 - dup.size / valid.length) * 100 : 0,
    resolution: share(kept, kept + dropped) * 100,
    spread: Math.min(1, share(families.size, valid.length)) * 100,
    ...(support ? { grounding: support.support, groundingCounts: support } : {}),
    ideas: valid.length,
    nearDuplicates: dup.size,
    citationsKept: kept,
    citationsDropped: dropped,
  }
}
