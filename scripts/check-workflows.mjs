#!/usr/bin/env node
// Keeps GitHub Actions free (ADR-0023). Every workflow in .github/workflows/ must:
//   - run each job on a standard GitHub-hosted runner (free for public repositories; larger
//     and GPU runners are billed even there),
//   - store nothing on GitHub: no artifact uploads and no caches (both use the org's storage),
//   - declare top-level `permissions`.
// Usage: node scripts/check-workflows.mjs [dir]   (default .github/workflows; exit 1 on a problem)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

/** Standard runner labels (docs.github.com: GitHub-hosted runners, public repositories). */
export const STANDARD_RUNNERS = new Set([
  'ubuntu-latest',
  'ubuntu-24.04',
  'ubuntu-22.04',
  'ubuntu-24.04-arm',
  'ubuntu-22.04-arm',
  'windows-latest',
  'windows-2025',
  'windows-2022',
  'windows-11-arm',
  'macos-latest',
  'macos-15',
  'macos-14',
])

/** Actions that store files or caches on GitHub. */
const STORING_ACTIONS = /^actions\/(upload-artifact|cache|upload-pages-artifact)(@|\/|$)/

/** Runner labels a job may use: its runs-on, with ${{ matrix.<key> }} expanded. */
export function runnerLabels(job) {
  const runsOn = job['runs-on']
  const values = Array.isArray(runsOn) ? runsOn : [runsOn]
  const labels = []
  for (const value of values) {
    const m = typeof value === 'string' ? /^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$/.exec(value) : null
    if (!m) {
      labels.push(value)
      continue
    }
    const matrix = job.strategy?.matrix ?? {}
    const key = m[1]
    const fromAxis = Array.isArray(matrix[key]) ? matrix[key] : []
    const fromInclude = (matrix.include ?? []).map((row) => row[key]).filter((v) => v !== undefined)
    const all = [...fromAxis, ...fromInclude]
    labels.push(...(all.length > 0 ? all : [value]))
  }
  return labels
}

/** Problems in one workflow file's text; `name` prefixes each message. */
export function workflowProblems(text, name = 'workflow') {
  let doc
  try {
    doc = load(text)
  } catch (e) {
    return [`${name}: not valid YAML (${e.message.split('\n')[0]})`]
  }
  const problems = []
  if (!doc || typeof doc !== 'object') return [`${name}: empty workflow`]
  if (!('permissions' in doc)) problems.push(`${name}: declare top-level permissions`)
  for (const [id, job] of Object.entries(doc.jobs ?? {})) {
    if (job.uses) {
      problems.push(
        `${name}: job ${id} calls a reusable workflow; inline it so its runners are checked`,
      )
      continue
    }
    for (const label of runnerLabels(job))
      if (!STANDARD_RUNNERS.has(label))
        problems.push(
          `${name}: job ${id} runs on "${label}", which is not a standard GitHub-hosted runner`,
        )
    for (const step of job.steps ?? []) {
      const uses = String(step.uses ?? '')
      if (STORING_ACTIONS.test(uses))
        problems.push(`${name}: job ${id} uses ${uses.split('@')[0]}, which stores files on GitHub`)
      if (step.with && 'cache' in step.with)
        problems.push(`${name}: job ${id} turns on a cache in ${uses.split('@')[0]}`)
    }
  }
  return problems
}

/** Problems across every .yml/.yaml file in `dir`. */
export function checkWorkflowDir(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .flatMap((f) => workflowProblems(readFileSync(join(dir, f), 'utf8'), f))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const problems = checkWorkflowDir(resolve(process.argv[2] ?? join(root, '.github', 'workflows')))
  for (const p of problems) console.error(`✖ ${p}`)
  if (problems.length > 0) process.exit(1)
  console.log('workflows: standard runners only, nothing stored on GitHub')
}
