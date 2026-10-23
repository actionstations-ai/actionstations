// scripts/make-example.mjs: the packaging half of the example builder (#157, #158) and the
// file diff of the repair report (#185).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pngjs from 'pngjs'
import wavefile from 'wavefile'
import { describe, expect, it } from 'vitest'
import {
  assertNoRewrite,
  blockingWarnings,
  chooseAssets,
  findLeaks,
  hashTree,
  isDerived,
  markdownSection,
  packageProject,
  seedMarkdown,
  scrub,
  shippedMp3,
  shippedPng,
  treeDiff,
  writeManifest,
  type BuildSpec,
} from '../../scripts/make-example.mjs'

const { PNG } = pngjs
const { WaveFile } = wavefile

/** A solid PNG of the given size (2× renders are ≥ 1600 px wide and get halved). */
function png(width: number, height: number): Buffer {
  const img = new PNG({ width, height })
  for (let i = 0; i < img.data.length; i += 4) img.data.set([120, 130, 140, 255], i)
  return PNG.sync.write(img)
}

const asset = (id: string, role = 'rendered', ext = 'png', kind = 'image') => ({
  id,
  kind,
  role,
  path: `scenarios/S1/media/${id.slice(0, 1)}/${id}.${ext}`,
  provenance: { provider: 'template', createdAt: '2026-10-22T00:00:00.000Z' },
})

const scenario = {
  id: 'S1',
  title: 'Caustic Setpoint',
  brief: { threatFamily: 'cyber_physical' },
  overview: { threat: 'A vendor session raises the caustic dose.' },
  msel: [
    { id: 'START', purposeTag: 'STARTEX' },
    { id: 'I-01', purposeTag: 'CORE_NARRATIVE' },
    { id: 'I-02', purposeTag: 'NOISE' },
    { id: 'I-03', purposeTag: 'DECISION_POINT' },
  ],
  provenance: [{ stage: 'msel', providerRef: { providerId: '01HX' }, status: 'ok' }],
}
const injects = [
  {
    id: 'A1',
    mselRowId: 'START',
    type: 'startex_card',
    title: 'a',
    fields: {},
    assets: [asset('A1')],
  },
  {
    id: 'B1',
    mselRowId: 'I-01',
    type: 'scada_hmi',
    title: 'b',
    fields: {},
    assets: [asset('B1'), asset('B2', 'rendered', 'pdf', 'pdf')],
  },
  {
    id: 'C1',
    mselRowId: 'I-02',
    type: 'helpdesk_ticket',
    title: 'c',
    fields: {},
    assets: [asset('C1')],
  },
  {
    id: 'D1',
    mselRowId: 'I-03',
    type: 'phone_call',
    title: 'd',
    fields: {},
    assets: [asset('D1', 'generated', 'wav', 'audio')],
  },
]

describe('isDerived', () => {
  it('drops derived, transient and local files but keeps project data', () => {
    for (const p of [
      'index.sqlite',
      'index.sqlite-wal',
      '.cache/x',
      'jobs.json',
      'scenarios/S1/history/msel.jsonl',
      'scenarios/S1/job.log',
      '.DS_Store',
    ])
      expect(isDerived(p), p).toBe(true)
    for (const p of [
      'project.json',
      'documents/D1/original.md',
      'scenarios/S1/scenario.json',
      'scenarios/S1/injects/A1.json',
      'scenarios/S1/media/A/A1.png',
    ])
      expect(isDerived(p), p).toBe(false)
  })
})

describe('scrub', () => {
  it('empties routing, removes provider refs and author paths', () => {
    const out = scrub(
      {
        providerRouting: { draft: { providerId: 'p1' } },
        provenance: [{ stage: 'msel', providerRef: { providerId: 'p1' }, model: 'qwen' }],
        note: 'see /Users/someone/x and /abs/out/y',
      },
      ['/abs/out'],
    )
    expect(out).toEqual({
      providerRouting: {},
      provenance: [{ stage: 'msel', model: 'qwen' }],
      note: 'see ~/x and /y',
    })
  })
})

describe('findLeaks', () => {
  it('flags author-machine paths and key-shaped strings only', () => {
    expect(findLeaks('see /Users/someone/Code/x.ttxproj and C:\\Users\\a\\b')).toHaveLength(2)
    expect(findLeaks('api_key: abc Bearer 0123456789abcdef0123')).toHaveLength(2)
    // story content inside injects is not a leak
    expect(
      findLeaks('tail -f /var/log/scada.log; C:\\\\Logs\\\\audit.log /opt/scada/x.sh 10.72.10.10'),
    ).toEqual([])
  })
})

describe('shippedPng', () => {
  it('halves 2× renders and leaves small images alone', () => {
    const big = shippedPng(png(1920, 1080))
    expect([big.width, big.height]).toEqual([960, 540])
    const small = shippedPng(png(800, 600))
    expect([small.width, small.height]).toEqual([800, 600])
  })
})

function fakeProject(): { out: string; src: string } {
  const out = mkdtempSync(join(tmpdir(), 'ttx-example-out-'))
  const src = join(out, 'p.ttxproj')
  const s = join(src, 'scenarios', 'S1')
  for (const d of ['documents/D1', 'scenarios/S1/injects', 'scenarios/S1/history'])
    mkdirSync(join(src, d), { recursive: true })
  writeFileSync(
    join(src, 'project.json'),
    JSON.stringify({
      name: 'P',
      orgType: 'water_utility',
      providerRouting: { draft: { providerId: 'p1' } },
      scenarios: [
        { id: 'S1', title: 'Caustic Setpoint' },
        { id: 'S9', title: 'Not shipped' },
      ],
    }),
  )
  writeFileSync(join(src, 'index.sqlite'), 'db')
  writeFileSync(join(src, 'jobs.json'), '{}')
  writeFileSync(join(src, 'documents', 'D1', 'original.md'), '# doc')
  writeFileSync(join(s, 'scenario.json'), JSON.stringify(scenario))
  writeFileSync(join(s, 'history', 'msel.jsonl'), '{}\n')
  for (const i of injects) {
    writeFileSync(join(s, 'injects', `${i.id}.json`), JSON.stringify(i))
    for (const a of i.assets) {
      mkdirSync(join(src, a.path, '..'), { recursive: true })
      writeFileSync(join(src, a.path), a.kind === 'image' ? png(1920, 1080) : Buffer.alloc(100))
    }
  }
  writeFileSync(
    join(out, 'state.json'),
    JSON.stringify({
      projectPath: 'p.ttxproj',
      scenarios: {
        chem: { scenarioId: 'S1', title: 'Caustic Setpoint', threatFamily: 'cyber_physical' },
      },
    }),
  )
  return { out, src }
}

const spec: BuildSpec = {
  id: 'demo',
  title: 'Demo',
  domainProfile: 'water_utility',
  summary: 'A demo.',
  notice: 'Exercise material.',
  project: { name: 'P' },
  documents: { dir: 'reference/city-water' },
  scenarios: [{ key: 'chem', threatFamily: 'cyber_physical', summary: 'Hand-written.' }],
}

describe('chooseAssets', () => {
  it('keeps rendered PNGs by tag priority and never audio or PDFs', () => {
    const { src } = fakeProject()
    const { kept } = chooseAssets(src, [{ id: 'S1', scenario, injects }])
    expect([...kept.keys()].sort()).toEqual(['A1', 'B1', 'C1'])
    expect(kept.get('B1')?.width).toBe(960)
  })

  it('keeps at most two AI composites, ahead of the rendered cards (#185)', () => {
    const { src } = fakeProject()
    const tweets = ['E1', 'E2', 'E3'].map((id) => ({
      id,
      mselRowId: 'I-02',
      type: 'tweet',
      title: id,
      fields: {},
      assets: [asset(id, 'composite')],
    }))
    for (const t of tweets) {
      const path = join(src, t.assets[0]!.path)
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, png(800, 600))
    }
    const { kept } = chooseAssets(src, [{ id: 'S1', scenario, injects: [...injects, ...tweets] }])
    expect([...kept.keys()]).toEqual(['E1', 'E2', 'A1', 'B1', 'C1'])
  })
})

describe('packageProject + writeManifest', () => {
  it('ships a scrubbed project with only the chosen media and the spec scenarios', () => {
    const { out } = fakeProject()
    const dest = join(out, 'examples', 'demo', 'project')
    const result = packageProject(spec, out, dest)
    expect(existsSync(join(dest, 'index.sqlite'))).toBe(false)
    expect(existsSync(join(dest, 'jobs.json'))).toBe(false)
    expect(existsSync(join(dest, 'scenarios', 'S1', 'history'))).toBe(false)
    expect(existsSync(join(dest, 'documents', 'D1', 'original.md'))).toBe(true)
    expect(existsSync(join(dest, 'scenarios', 'S1', 'media', 'D', 'D1.wav'))).toBe(false)
    expect(existsSync(join(dest, 'scenarios', 'S1', 'media', 'B', 'B2.pdf'))).toBe(false)
    const project = JSON.parse(readFileSync(join(dest, 'project.json'), 'utf8'))
    expect(project.providerRouting).toEqual({})
    expect(project.scenarios.map((s: { id: string }) => s.id)).toEqual(['S1'])
    expect(readFileSync(join(dest, 'scenarios', 'S1', 'scenario.json'), 'utf8')).not.toContain(
      'providerId',
    )
    const d1 = JSON.parse(readFileSync(join(dest, 'scenarios', 'S1', 'injects', 'D1.json'), 'utf8'))
    expect(d1.assets).toEqual([])
    const b1 = JSON.parse(readFileSync(join(dest, 'scenarios', 'S1', 'injects', 'B1.json'), 'utf8'))
    expect(b1.assets.map((a: { id: string; width: number }) => [a.id, a.width])).toEqual([
      ['B1', 960],
    ])
    expect(result.kept).toBe(3)
    const manifest = writeManifest(spec, out, result.bundles, join(out, 'examples', 'demo'))
    expect(manifest).toMatchObject({ id: 'demo', fictional: true, domainProfile: 'water_utility' })
    expect(manifest.scenarios).toEqual([
      {
        id: 'S1',
        title: 'Caustic Setpoint',
        threatFamily: 'cyber_physical',
        summary: 'Hand-written.',
      },
    ])
    expect(existsSync(join(out, 'examples', 'demo', 'example.json'))).toBe(true)
  })

  it('refuses a package that still carries an author path', () => {
    const { out, src } = fakeProject()
    writeFileSync(
      join(src, 'documents', 'D1', 'original.md'),
      'copied from /Users/someone/plans.md',
    )
    expect(() => packageProject(spec, out, join(out, 'examples', 'leaky', 'project'))).toThrow(
      /author paths/,
    )
  })
})

describe('hashTree + treeDiff (repair report)', () => {
  it('counts changed, added, removed and byte-identical files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-tree-'))
    mkdirSync(join(dir, 'injects'), { recursive: true })
    writeFileSync(join(dir, 'scenario.json'), '{"v":1}')
    writeFileSync(join(dir, 'injects', 'A.json'), 'a')
    writeFileSync(join(dir, 'injects', 'B.json'), 'b')
    const before = hashTree(dir)
    writeFileSync(join(dir, 'scenario.json'), '{"v":2}')
    rmSync(join(dir, 'injects', 'B.json'))
    writeFileSync(join(dir, 'injects', 'C.json'), 'c')
    expect(treeDiff(before, hashTree(dir))).toEqual({
      changed: ['scenario.json'],
      added: ['injects/C.json'],
      removed: ['injects/B.json'],
      identical: 1,
    })
  })
})

/** A mono 16-bit WAV of `seconds` of a quiet tone. */
function wav(seconds: number, rate = 24000): Buffer {
  const w = new WaveFile()
  const samples = new Int16Array(seconds * rate).map((_, i) => Math.round(2000 * Math.sin(i / 8)))
  w.fromScratch(1, rate, '16', samples)
  return Buffer.from(w.toBuffer())
}

/** Give the fake project's phone call D1 a real WAV clip of `seconds`. */
function withClip(src: string, seconds: number): void {
  const d1 = injects.find((i) => i.id === 'D1')!
  writeFileSync(join(src, d1.assets[0]!.path), wav(Math.min(seconds, 3)))
  const file = join(src, 'scenarios', 'S1', 'injects', 'D1.json')
  const value = JSON.parse(readFileSync(file, 'utf8'))
  value.assets[0].durationSec = seconds
  writeFileSync(file, JSON.stringify(value))
}

describe('voice clip (#219)', () => {
  it('encodes a WAV as a small mono MP3', () => {
    const mp3 = shippedMp3(wav(3))
    expect(mp3[0]).toBe(0xff)
    expect(mp3.byteLength).toBeLessThan(wav(3).byteLength / 5)
  })

  it('ships one short clip as MP3 inside the media budget, never a long one', () => {
    const { out, src } = fakeProject()
    withClip(src, 3)
    const dest = join(out, 'examples', 'demo', 'project')
    expect(packageProject(spec, out, dest).clip).toBe('D1')
    const d1 = JSON.parse(readFileSync(join(dest, 'scenarios', 'S1', 'injects', 'D1.json'), 'utf8'))
    expect(d1.assets[0].path).toMatch(/D1\.mp3$/)
    expect(existsSync(join(dest, d1.assets[0].path))).toBe(true)
    expect(existsSync(join(dest, 'scenarios', 'S1', 'media', 'D', 'D1.wav'))).toBe(false)

    const long = fakeProject()
    withClip(long.src, 90)
    const longDest = join(long.out, 'examples', 'long', 'project')
    expect(packageProject(spec, long.out, longDest).clip).toBeUndefined()
  })
})

describe('seed documents (#224)', () => {
  const md =
    '# Handbook\n\n### 4. Rubric\nr\n\n### 5. Hot Wash Guide (Debrief)\nq1\n#### Notes\nn\n\n### 6. After\nx\n'

  it('takes one section down to the next heading of its level', () => {
    expect(markdownSection(md, 'Hot Wash')).toBe(
      '### 5. Hot Wash Guide (Debrief)\nq1\n#### Notes\nn\n',
    )
    expect(() => markdownSection(md, 'Nope')).toThrow(/no heading/)
  })

  it('reads a file, a section of one, or a list joined in order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-seed-'))
    writeFileSync(join(dir, 'h.md'), md)
    writeFileSync(join(dir, 'a.md'), '# Card A\n')
    writeFileSync(join(dir, 'b.md'), '# Card B\n')
    expect(seedMarkdown('h.md', dir)).toBe(md)
    expect(seedMarkdown({ file: 'h.md', section: 'Rubric' }, dir)).toBe('### 4. Rubric\nr\n')
    expect(seedMarkdown(['a.md', 'b.md'], dir)).toBe('# Card A\n\n# Card B\n')
  })
})

describe('blockingWarnings (verify, #220)', () => {
  const w = (code: string, severity = 'warning', rowId?: string) => ({
    code,
    severity,
    message: `${code} message`,
    ...(rowId ? { rowId } : {}),
  })

  it('lets CRITIQUE notes and info through and reports everything else once', () => {
    const stored = [w('CRITIQUE'), w('ROLE_NO_INJECT'), w('DENSITY', 'info')]
    const fresh = [w('ROLE_NO_INJECT'), w('INJECT_PLAYER_VOICE', 'warning', 'I-12')]
    expect(blockingWarnings(stored, fresh).map((x) => x.code)).toEqual([
      'ROLE_NO_INJECT',
      'INJECT_PLAYER_VOICE',
    ])
    expect(blockingWarnings([w('CRITIQUE')])).toEqual([])
  })
})

describe('assertNoRewrite (refresh, #220)', () => {
  it('fails when the repair wanted a model to rewrite something', () => {
    expect(() => assertNoRewrite({ msel: { textChanged: [] }, injectRows: [] }, 'k')).not.toThrow()
    expect(() => assertNoRewrite({ msel: { textChanged: ['I-10'] } }, 'k')).toThrow(/I-10/)
    expect(() => assertNoRewrite({ recheck: { regenerate: ['abc'] } }, 'k')).toThrow(/abc/)
  })
})
