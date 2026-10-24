// Golden-image tests for inject templates (ADR-0008). For every template × variant:
// render preview.json at 2× through the built app, render it again and compare
// (determinism: ≤ 0.01 % visibly different pixels — GPU rasterization can shift a few
// anti-aliased pixels between pooled windows, so byte equality is not guaranteed), then compare with templates/injects/<type>/__golden__/<variant>.png
// (pixelmatch threshold 0.1, ≤ 0.1 % differing pixels). Mismatches write actual + diff
// images to .tmp/golden-diff/. UPDATE_GOLDENS=1 rewrites the goldens.
//   pnpm build:app && pnpm test:templates
//
// Pack templates (#261): with TTX_GOLDEN_PACK=<unpacked pack folder> (`pnpm test:templates
// --pack <folder>`), the pack's templates/<type>/ folders are placed in the app's user
// template layer (so they pass the same load-time checker) and only they are rendered, against
// <pack>/templates/<type>/__golden__/<variant>.png.
import { expect, test } from '@playwright/test'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pixelmatch from 'pixelmatch'
import pngjs from 'pngjs'
import {
  compareWithGolden,
  GOLDEN_DEFAULTS,
  goldenName,
  goldenPath,
  type GoldenResult,
} from '../src/main/render/golden'
import { invoker, launch } from './helpers'

const { PNG } = pngjs

/** Visible pixel differences between two renders vs the allowed noise (0.01 %). */
function renderNoise(a: Buffer, b: Buffer): { differing: number; allowed: number } {
  if (a.equals(b)) return { differing: 0, allowed: 0 }
  const [x, y] = [PNG.sync.read(a), PNG.sync.read(b)]
  if (x.width !== y.width || x.height !== y.height) return { differing: Infinity, allowed: 0 }
  const differing = pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0.1 })
  return { differing, allowed: Math.ceil(x.width * x.height * 0.0001) }
}

interface TemplateInfo {
  type: string
  preview: Record<string, unknown>
  variants: string[]
  source?: string
}

const PACK = process.env.TTX_GOLDEN_PACK ? resolve(process.env.TTX_GOLDEN_PACK) : undefined
const TEMPLATES = PACK ? join(PACK, 'templates') : resolve('templates/injects')
const DIFF_DIR = resolve('.tmp/golden-diff')
const UPDATE = process.env.UPDATE_GOLDENS === '1'

/** The pack's template types (folders with a template.html). */
const packTypes = (): string[] =>
  readdirSync(TEMPLATES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(TEMPLATES, d.name, 'template.html')))
    .map((d) => d.name)
    .sort()

/** A userData folder whose user template layer holds the pack's templates. */
function packUserData(types: string[]): string {
  const userData = mkdtempSync(join(tmpdir(), 'ttx-golden-pack-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingComplete: true }))
  const layer = join(userData, 'templates', 'injects')
  mkdirSync(layer, { recursive: true })
  for (const type of types)
    cpSync(join(TEMPLATES, type), join(layer, type), {
      recursive: true,
      filter: (src) => !src.includes('__golden__'),
    })
  return userData
}

test('every template × variant matches its golden PNG and renders deterministically', async () => {
  test.setTimeout(180_000)
  rmSync(DIFF_DIR, { recursive: true, force: true })
  const types = PACK ? packTypes() : []
  if (PACK) expect(types.length, `no templates in ${TEMPLATES}`).toBeGreaterThan(0)
  const userData = PACK ? packUserData(types) : undefined
  const { app, page } = await launch({}, userData ? { userData } : {})
  const invoke = invoker(page)
  const render = async (t: TemplateInfo, variant: string): Promise<Buffer> => {
    const r = await invoke<{ dataUrl: string }>('render:preview', {
      type: t.type,
      fields: t.preview,
      variant,
      scale: 2,
    })
    return Buffer.from(r.dataUrl.split(',')[1]!, 'base64')
  }
  const failures: string[] = []
  const report: string[] = []
  try {
    let templates = await invoke<TemplateInfo[]>('templates:list')
    if (PACK) {
      const refused =
        await invoke<{ type: string; problems: { path?: string; message: string }[] }[]>(
          'templates:refused',
        )
      for (const r of refused)
        failures.push(
          `${r.type}: refused by the template checker: ${r.problems.map((p) => `${p.path ?? ''} ${p.message}`).join('; ')}`,
        )
      templates = templates.filter((t) => types.includes(t.type) && t.source === 'user')
      for (const type of types)
        if (!templates.some((t) => t.type === type) && !refused.some((r) => r.type === type))
          failures.push(`${type}: not loaded from the pack folder`)
    }
    if (!PACK) expect(templates.length).toBeGreaterThan(0)
    for (const t of templates) {
      for (const variant of t.variants.length ? t.variants : ['default']) {
        const name = goldenName(t.type, variant)
        const first = await render(t, variant)
        const second = await render(t, variant)
        const noise = renderNoise(first, second)
        if (noise.differing > noise.allowed)
          failures.push(
            `${name}: two renders of the same data differ (${noise.differing} px > ${noise.allowed})`,
          )
        const result: GoldenResult = compareWithGolden(
          first,
          goldenPath(TEMPLATES, t.type, variant),
          name,
          { ...GOLDEN_DEFAULTS, diffDir: DIFF_DIR, update: UPDATE },
        )
        report.push(`${name}: ${result.status}`)
        if (result.status === 'missing' || result.status === 'mismatch')
          failures.push(result.message)
      }
    }
  } finally {
    await app.close()
    if (userData) rmSync(userData, { recursive: true, force: true })
  }
  console.log(report.join('\n'))
  expect(failures, failures.join('\n')).toEqual([])
})
