// M2 exit criterion (docs/08-ROADMAP.md): with a local model configured, "Give me ideas"
// returns grounded concepts; choosing one yields a full MSEL with ≥ 20 rows, the right
// purpose-tag mix, and real citations. Runs the built app against LM Studio.
// Opt-in (takes minutes): LIVE=1 pnpm exec playwright test e2e/m2-exit.spec.ts
import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

test.skip(!process.env.LIVE, 'Live LLM exit test runs only with LIVE=1')
test.setTimeout(30 * 60_000)

const LM = {
  baseUrl: 'http://127.0.0.1:1234/v1',
  model: process.env.LIVE_MODEL ?? 'qwen3-30b-a3b-2507',
}
// Outside test-results/: Playwright wipes that folder at the start of every run.
const OUT = resolve('.tmp/m2-exit')
const mdFiles = (dir: string) =>
  readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(resolve(dir), f))

interface Job {
  status: string
  message: string
  error?: string
}
interface Citation {
  documentId: string
  headingPath: string
}
interface Idea {
  id: string
  title: string
  hook: string
  systemsAffected: string[]
  sectionsExercised: Citation[]
}
interface Row {
  id: string
  time: string
  purposeTag: string
  citations: Citation[]
}
interface Scenario {
  title: string
  msel: Row[]
  phases: { id: string; title: string }[]
  warnings: { severity: string; code: string; message: string }[]
  provenance: { stage: string; status: string; inputTokens?: number; outputTokens?: number }[]
}

test('M2 exit: grounded ideas → full MSEL from the NCIA plans on a local model', async () => {
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch()
  const invoke = invoker(page)
  const waitJob = async (jobId: string, label: string) => {
    const started = Date.now()
    await expect
      .poll(async () => (await invoke<Job>('jobs:get', { jobId })).status, {
        timeout: 25 * 60_000,
        intervals: [3000],
      })
      .toMatch(/done|error|cancelled/)
    const job = await invoke<Job>('jobs:get', { jobId })
    console.log(
      `${label}: ${job.status} in ${Math.round((Date.now() - started) / 1000)} s ${job.error ?? ''}`,
    )
    expect(job.status, job.error).toBe('done')
  }
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-m2-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'North Coast International Airport',
      orgName: 'North Coast Regional Airport Authority',
      orgType: 'airport',
    })
    const docs = [...mdFiles('reference/ncia'), ...mdFiles('reference/ics-forms')]
    await invoke('documents:import', { projectPath, filePaths: docs })
    await expect
      .poll(
        async () =>
          (await invoke<{ status: string }[]>('documents:list', { projectPath })).every(
            (d) => d.status === 'ok',
          ),
        {
          timeout: 60_000,
        },
      )
      .toBe(true)
    const docIds = new Set(
      (await invoke<{ id: string }[]>('documents:list', { projectPath })).map((d) => d.id),
    )

    const lm = await invoke<{ id: string }>('providers:upsert', {
      config: {
        kind: 'openai-compatible',
        label: 'LM Studio',
        baseUrl: LM.baseUrl,
        defaultModel: LM.model,
        options: {},
        enabled: true,
      },
    })
    const test1 = await invoke<{ ok: boolean; error?: string }>('providers:test', { id: lm.id })
    expect(test1.ok, test1.error).toBe(true)
    await invoke('routing:set', {
      scope: 'global',
      routing: {
        ideate: { providerId: lm.id },
        draft: { providerId: lm.id },
        critique: { providerId: lm.id },
      },
    })

    // 1. Give me ideas
    const { jobId: ideasJob } = await invoke<{ jobId: string }>('generate:ideas', {
      projectPath,
      count: 8,
    })
    await waitJob(ideasJob, 'ideas')
    const ideas = await invoke<Idea[]>('generate:ideas-result', { projectPath })
    console.log(
      'Ideas:\n' +
        ideas
          .map(
            (i) => `  - ${i.title} [${i.sectionsExercised.map((c) => c.headingPath).join('; ')}]`,
          )
          .join('\n'),
    )
    writeFileSync(join(OUT, 'ideas.json'), JSON.stringify(ideas, null, 2))
    expect(ideas.length).toBeGreaterThanOrEqual(5)
    expect(ideas.length).toBeLessThanOrEqual(10)
    for (const idea of ideas) {
      expect(idea.sectionsExercised.length, `${idea.title} cites no sections`).toBeGreaterThan(0)
      for (const c of idea.sectionsExercised)
        expect(docIds.has(c.documentId), c.headingPath).toBe(true)
    }

    // 2. Pick a non-FIDS idea and develop it
    const idea =
      ideas.find(
        (i) =>
          !/FIDS|flight information/i.test(`${i.title} ${i.hook} ${i.systemsAffected.join(' ')}`),
      ) ?? ideas[0]!
    console.log(`Developing: ${idea.title}`)
    const { jobId, scenarioId } = await invoke<{ jobId: string; scenarioId: string }>(
      'generate:scenario',
      {
        projectPath,
        idea,
        brief: {
          userPrompt: idea.hook,
          audience: [
            'Airport Operations',
            'IT/Cybersecurity',
            'Public Safety',
            'Public Information',
          ],
          durationHours: 4,
          phaseCount: 4,
          learningObjectives: [],
          constraints: [
            'Include one red herring and one noise inject per phase',
            'Include a PIO track',
          ],
          startWallClock: '09:00',
        },
      },
    )
    await waitJob(jobId, 'scenario')
    const s = await invoke<Scenario>('scenarios:get', { projectPath, scenarioId })
    writeFileSync(join(OUT, 'scenario.json'), JSON.stringify(s, null, 2))
    for (const kind of ['handbook', 'briefing', 'hotwash'] as const) {
      const { markdown } = await invoke<{ markdown: string }>('scenarios:doc-get', {
        projectPath,
        scenarioId,
        kind,
      })
      writeFileSync(join(OUT, `${kind}.md`), markdown)
      expect(markdown.length, `${kind} is empty`).toBeGreaterThan(200)
    }

    // 3. Exit criteria
    const tags = s.msel.map((r) => r.purposeTag)
    const citations = s.msel.flatMap((r) => r.citations)
    const tokens = s.provenance.reduce(
      (n, p) => n + (p.inputTokens ?? 0) + (p.outputTokens ?? 0),
      0,
    )
    console.log(
      `"${s.title}": ${s.msel.length} rows, ${s.phases.length} phases, ${citations.length} citations, ` +
        `${tokens} tokens, stages ${s.provenance.filter((p) => p.status === 'ok').length}/${s.provenance.length} ok`,
    )
    console.log(
      'Warnings:\n' +
        s.warnings.map((w) => `  ${w.severity} ${w.code}: ${w.message.slice(0, 140)}`).join('\n'),
    )
    expect(s.msel.length).toBeGreaterThanOrEqual(20)
    expect(s.phases).toHaveLength(4)
    expect(tags[0]).toBe('STARTEX')
    expect(tags.at(-1)).toBe('ENDEX')
    expect(tags).toContain('CORE_NARRATIVE')
    expect(tags).toContain('DECISION_POINT')
    expect(tags.some((t) => t === 'NOISE' || t === 'RED_HERRING')).toBe(true)
    expect(tags.some((t) => t === 'PRESSURE' || t === 'MISINFORMATION')).toBe(true)
    expect(citations.length).toBeGreaterThan(0)
    for (const c of citations) expect(docIds.has(c.documentId), c.headingPath).toBe(true)
    expect(s.provenance.filter((p) => p.status === 'error')).toEqual([])
  } finally {
    await app.close()
  }
})
