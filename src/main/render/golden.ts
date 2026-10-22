// Golden-image comparison for inject templates (ADR-0008, `pnpm test:templates`).
// Used by e2e/templates-golden.spec.ts; no Electron or path aliases here so Playwright's
// loader and Vitest can both import it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pixelmatch from 'pixelmatch'
import pngjs from 'pngjs'

const { PNG } = pngjs

export interface GoldenOptions {
  /** pixelmatch per-pixel color threshold (0..1). */
  threshold: number
  /** Largest share of differing pixels that still passes (0.001 = 0.1 %). */
  maxDiffRatio: number
  /** Where actual + diff images go on mismatch. */
  diffDir: string
  /** Rewrite the golden instead of comparing. */
  update: boolean
}

export const GOLDEN_DEFAULTS: Omit<GoldenOptions, 'diffDir' | 'update'> = {
  threshold: 0.1,
  maxDiffRatio: 0.001,
}

export type GoldenResult =
  | { status: 'match'; diffPixels: number; ratio: number }
  | { status: 'updated' }
  | { status: 'missing'; message: string }
  | { status: 'mismatch'; message: string; diffPixels?: number; ratio?: number }

/** File-safe name for a template × variant, e.g. `time_jump_card--default`. */
export const goldenName = (type: string, variant: string): string => `${type}--${variant}`

/** templates/injects/<type>/__golden__/<variant>.png */
export const goldenPath = (templatesRoot: string, type: string, variant: string): string =>
  join(templatesRoot, type, '__golden__', `${variant}.png`)

function writeArtifacts(diffDir: string, name: string, actual: Buffer, diff?: Buffer): string {
  mkdirSync(diffDir, { recursive: true })
  const actualPath = join(diffDir, `${name}.actual.png`)
  writeFileSync(actualPath, actual)
  if (diff) writeFileSync(join(diffDir, `${name}.diff.png`), diff)
  return actualPath
}

/** Compare a rendered PNG with its committed golden (or rewrite it when `update`). */
export function compareWithGolden(
  actual: Buffer,
  golden: string,
  name: string,
  opts: GoldenOptions,
): GoldenResult {
  if (opts.update) {
    mkdirSync(dirname(golden), { recursive: true })
    writeFileSync(golden, actual)
    return { status: 'updated' }
  }
  if (!existsSync(golden)) {
    const at = writeArtifacts(opts.diffDir, name, actual)
    return {
      status: 'missing',
      message:
        `${name}: no golden at ${golden}. Check the render (${at}), then create it with ` +
        `UPDATE_GOLDENS=1 pnpm test:templates and commit the PNG with the template.`,
    }
  }
  const a = PNG.sync.read(actual)
  const g = PNG.sync.read(readFileSync(golden))
  if (a.width !== g.width || a.height !== g.height) {
    const at = writeArtifacts(opts.diffDir, name, actual)
    return {
      status: 'mismatch',
      message: `${name}: size ${a.width}×${a.height} ≠ golden ${g.width}×${g.height} (actual: ${at})`,
    }
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const diffPixels = pixelmatch(a.data, g.data, diff.data, a.width, a.height, {
    threshold: opts.threshold,
  })
  const ratio = diffPixels / (a.width * a.height)
  if (ratio <= opts.maxDiffRatio) return { status: 'match', diffPixels, ratio }
  const at = writeArtifacts(opts.diffDir, name, actual, PNG.sync.write(diff))
  return {
    status: 'mismatch',
    diffPixels,
    ratio,
    message:
      `${name}: ${diffPixels} pixels differ (${(ratio * 100).toFixed(3)} % > ` +
      `${(opts.maxDiffRatio * 100).toFixed(3)} %). Actual and diff: ${at.replace('.actual.png', '.*.png')}`,
  }
}
