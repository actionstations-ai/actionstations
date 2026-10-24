// The render window's own lock (#301), tested without the template checker: built-in
// templates are not checked, so the app runs on a copy of its resources (TTX_RESOURCES) whose
// time_jump_card is rewritten to attack the window. A secret magenta PNG sits outside every
// allowed root; the capture must render the template and never show the secret.
import { expect, test } from '@playwright/test'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import pngjs from 'pngjs'
import { invoker, launch } from './helpers'

const { PNG } = pngjs
const TYPE = 'time_jump_card'
const SKIP_ROOT = new Set(['templates', '.git', 'node_modules', 'out', 'test-results'])

interface Preview {
  dataUrl: string
  width: number
  height: number
}

/** Resources copy: everything linked, except templates/injects/time_jump_card (copied). */
function resourcesCopy(root: string): { resources: string; tpl: string } {
  const repo = resolve('.')
  const resources = join(root, 'resources')
  const injects = join(resources, 'templates', 'injects')
  mkdirSync(injects, { recursive: true })
  for (const name of readdirSync(repo))
    if (!SKIP_ROOT.has(name)) symlinkSync(join(repo, name), join(resources, name))
  for (const name of readdirSync(join(repo, 'templates')))
    if (name !== 'injects')
      symlinkSync(join(repo, 'templates', name), join(resources, 'templates', name))
  for (const name of readdirSync(join(repo, 'templates', 'injects')))
    if (name !== TYPE) symlinkSync(join(repo, 'templates', 'injects', name), join(injects, name))
  const tpl = join(injects, TYPE)
  cpSync(join(repo, 'templates', 'injects', TYPE), tpl, { recursive: true })
  return { resources, tpl }
}

function magentaPng(file: string): void {
  const png = new PNG({ width: 64, height: 64 })
  for (let i = 0; i < png.data.length; i += 4) png.data.set([255, 0, 255, 255], i)
  writeFileSync(file, PNG.sync.write(png))
}

/** Pixels close to the secret's magenta. */
function magentaPixels(png: Buffer): number {
  const { data } = PNG.sync.read(png)
  let n = 0
  for (let i = 0; i < data.length; i += 4)
    if (data[i]! > 230 && data[i + 1]! < 40 && data[i + 2]! > 230) n++
  return n
}

/** Rewrite one template file and bump the folder's mtime so the template cache reloads. */
function rewrite(tpl: string, file: string, content: string, stamp: number): void {
  writeFileSync(join(tpl, file), content)
  const t = new Date(Date.now() + stamp * 10_000)
  utimesSync(join(tpl, file), t, t)
}

test('render windows refuse files outside the template, shared and media roots', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ttx-sandbox-e2e-'))
  const { resources, tpl } = resourcesCopy(root)
  const secret = join(root, 'secret.png')
  magentaPng(secret)
  const html = readFileSync(join(tpl, 'template.html'), 'utf8')
  const css = readFileSync(join(tpl, 'style.css'), 'utf8')
  const fields = JSON.parse(readFileSync(join(tpl, 'preview.json'), 'utf8')).fields

  const { app, page } = await launch({ TTX_RESOURCES: resources })
  const invoke = invoker(page)
  const render = async () => {
    const r = await invoke<Preview>('render:preview', { type: TYPE, fields, scale: 1 })
    expect(r.width).toBe(816)
    return Buffer.from(r.dataUrl.split(',')[1]!, 'base64')
  }
  try {
    // 1. style.css closes its <style> and adds a meta refresh to a file outside the
    //    template folder (relative to the template's <base>).
    const refresh = `</style><meta http-equiv="refresh" content="0;url=../../../../secret.png"><style>`
    rewrite(tpl, 'style.css', `${css}\n${refresh}`, 1)
    const afterRefresh = await render()
    // Give a refresh that slipped through time to land, then render again from the pool.
    await new Promise((r) => setTimeout(r, 500))
    const second = await render()
    expect.soft(magentaPixels(afterRefresh)).toBe(0)
    expect.soft(magentaPixels(second)).toBe(0)

    // 2. An <img> with an absolute file: URL outside every allowed root.
    rewrite(tpl, 'style.css', css, 2)
    const img = `<img src="${pathToFileURL(secret).href}" style="position:absolute;left:0;top:0;width:300px;height:300px">`
    rewrite(tpl, 'template.html', `${img}\n${html}`, 3)
    expect.soft(magentaPixels(await render())).toBe(0)

    // Control: the same picture inside the template folder does load, so the test can see it.
    cpSync(secret, join(tpl, 'inside.png'))
    rewrite(
      tpl,
      'template.html',
      `${img.replace(pathToFileURL(secret).href, 'inside.png')}\n${html}`,
      4,
    )
    expect(magentaPixels(await render())).toBeGreaterThan(300 * 300 * 0.9)
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
