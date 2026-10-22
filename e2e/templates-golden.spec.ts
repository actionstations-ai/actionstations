// Golden-image tests for inject templates (ADR-0008). For every template × variant:
// render preview.json at 2× through the built app, render it again and byte-compare
// (determinism), then compare with templates/injects/<type>/__golden__/<variant>.png
// (pixelmatch threshold 0.1, ≤ 0.1 % differing pixels). Mismatches write actual + diff
// images to .tmp/golden-diff/. UPDATE_GOLDENS=1 rewrites the goldens.
//   pnpm build:app && pnpm test:templates
import { expect, test } from '@playwright/test'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  compareWithGolden,
  GOLDEN_DEFAULTS,
  goldenName,
  goldenPath,
  type GoldenResult,
} from '../src/main/render/golden'
import { invoker, launch } from './helpers'

interface TemplateInfo {
  type: string
  preview: Record<string, unknown>
  variants: string[]
}

const TEMPLATES = resolve('templates/injects')
const DIFF_DIR = resolve('.tmp/golden-diff')
const UPDATE = process.env.UPDATE_GOLDENS === '1'

test('every template × variant matches its golden PNG and renders deterministically', async () => {
  test.setTimeout(180_000)
  rmSync(DIFF_DIR, { recursive: true, force: true })
  const { app, page } = await launch()
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
    const templates = await invoke<TemplateInfo[]>('templates:list')
    expect(templates.length).toBeGreaterThan(0)
    for (const t of templates) {
      for (const variant of t.variants.length ? t.variants : ['default']) {
        const name = goldenName(t.type, variant)
        const first = await render(t, variant)
        const second = await render(t, variant)
        if (!first.equals(second)) failures.push(`${name}: two renders of the same data differ`)
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
  }
  console.log(report.join('\n'))
  expect(failures, failures.join('\n')).toEqual([])
})
