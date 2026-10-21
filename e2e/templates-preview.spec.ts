// Renders every inject template's preview.json through the real app (templates:list →
// render:preview) into test-results/templates/<type>.png. This is the template authoring
// loop: pnpm build:app && pnpm exec playwright test e2e/templates-preview.spec.ts
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

interface TemplateInfo {
  type: string
  width: number
  preview: Record<string, unknown>
  variants: string[]
}

test('every template renders its preview to PNG', async () => {
  const out = resolve('test-results/templates')
  mkdirSync(out, { recursive: true })
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    const templates = await invoke<TemplateInfo[]>('templates:list')
    expect(templates.length).toBeGreaterThan(0)
    for (const t of templates) {
      for (const variant of t.variants.length ? t.variants : ['default']) {
        const r = await invoke<{ dataUrl: string; width: number; height: number }>(
          'render:preview',
          {
            type: t.type,
            fields: t.preview,
            variant,
            scale: 2,
          },
        )
        expect(r.width, t.type).toBe(t.width)
        expect(r.height, t.type).toBeGreaterThan(20)
        const png = Buffer.from(r.dataUrl.split(',')[1]!, 'base64')
        expect(png.length, t.type).toBeGreaterThan(2000)
        writeFileSync(join(out, `${t.type}${variant === 'default' ? '' : `--${variant}`}.png`), png)
      }
    }
  } finally {
    await app.close()
  }
})
