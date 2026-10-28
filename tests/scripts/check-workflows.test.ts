// scripts/check-workflows.mjs: GitHub Actions stays free (ADR-0023).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkWorkflowDir, runnerLabels, workflowProblems } from '../../scripts/check-workflows.mjs'

const wf = (jobs: string, top = 'permissions:\n  contents: read\n') =>
  `name: t\non: push\n${top}jobs:\n${jobs}`

describe('workflowProblems', () => {
  it('accepts standard runners, also through a matrix', () => {
    const text = wf(`  a:
    runs-on: ubuntu-24.04
    steps: [{ run: echo }]
  b:
    strategy:
      matrix:
        include:
          - { os: macos-15 }
          - { os: windows-2025 }
    runs-on: \${{ matrix.os }}
    steps: [{ run: echo }]
`)
    expect(workflowProblems(text)).toEqual([])
  })

  it('refuses larger, GPU and self-hosted runners', () => {
    const text = wf(`  a:
    runs-on: ubuntu-latest-4-cores
    steps: []
  b:
    strategy: { matrix: { os: [macos-15-xlarge] } }
    runs-on: \${{ matrix.os }}
    steps: []
  c:
    runs-on: [self-hosted, linux]
    steps: []
`)
    const problems = workflowProblems(text, 'w.yml')
    expect(problems).toHaveLength(4)
    expect(problems[0]).toMatch(/job a runs on "ubuntu-latest-4-cores"/)
    expect(problems[1]).toMatch(/macos-15-xlarge/)
  })

  it('refuses artifacts, caches and setup caching', () => {
    const text = wf(`  a:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/upload-artifact@v4
      - uses: actions/cache@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
`)
    const problems = workflowProblems(text)
    expect(problems.join('\n')).toMatch(/upload-artifact, which stores/)
    expect(problems.join('\n')).toMatch(/actions\/cache, which stores/)
    expect(problems.join('\n')).toMatch(/turns on a cache in actions\/setup-node/)
  })

  it('needs top-level permissions and inline jobs', () => {
    const text = wf(
      `  a:
    uses: org/repo/.github/workflows/x.yml@main
`,
      '',
    )
    expect(workflowProblems(text)).toEqual([
      'workflow: declare top-level permissions',
      'workflow: job a calls a reusable workflow; inline it so its runners are checked',
    ])
  })

  it('reports YAML errors', () => {
    expect(workflowProblems('a: [', 'bad.yml')[0]).toMatch(/^bad\.yml: not valid YAML/)
  })
})

describe('runnerLabels', () => {
  it('merges matrix axes and include rows', () => {
    expect(
      runnerLabels({
        'runs-on': '${{ matrix.os }}',
        strategy: { matrix: { os: ['a'], include: [{ os: 'b' }] } },
      }),
    ).toEqual(['a', 'b'])
  })
})

describe('this repository', () => {
  it('has only free workflows', () => {
    expect(checkWorkflowDir('.github/workflows')).toEqual([])
  })

  it('the release workflow builds every platform electron-builder.yml configures', () => {
    const text = readFileSync('.github/workflows/release.yml', 'utf8')
    for (const target of ['--mac', '--win', '--linux']) expect(text).toContain(`target: ${target}`)
  })
})
