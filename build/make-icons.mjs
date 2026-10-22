// Regenerates every app icon from build/icon.svg. Run with Electron (it rasterizes the SVG in
// an offscreen window, so no design tools are needed):
//   pnpm exec electron build/make-icons.mjs
// Writes build/icon.png (1024), build/icon.icns (mac), build/icon.ico (win) and
// build/icons/<N>x<N>.png (linux). The outputs are committed.
import { app, BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeIcns, encodeIco, ICNS_TYPES } from './icon-formats.mjs'

const BUILD_DIR = dirname(fileURLToPath(import.meta.url))
const MASTER = 1024
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]

async function rasterizeMaster(svg) {
  const win = new BrowserWindow({
    show: false,
    width: MASTER,
    height: MASTER,
    useContentSize: true,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, javascript: false },
  })
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('<svg ', '<svg style="display:block;width:100vw;height:100vh" ')}</body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: MASTER, height: MASTER })
  win.destroy()
  const { width, height } = image.getSize()
  if (width !== MASTER || height !== MASTER) throw new Error(`Captured ${width}x${height}`)
  return image
}

function pngAt(master, size) {
  if (size === MASTER) return master.toPNG()
  return master.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

async function main() {
  const svg = readFileSync(join(BUILD_DIR, 'icon.svg'), 'utf8')
  const master = await rasterizeMaster(svg)
  const sizes = new Set([...ICO_SIZES, ...LINUX_SIZES, ...ICNS_TYPES.map((t) => t.size)])
  const pngs = new Map([...sizes].map((s) => [s, pngAt(master, s)]))

  writeFileSync(join(BUILD_DIR, 'icon.png'), pngs.get(MASTER))
  writeFileSync(join(BUILD_DIR, 'icon.icns'), encodeIcns(pngs))
  writeFileSync(join(BUILD_DIR, 'icon.ico'), encodeIco(ICO_SIZES.map((s) => pngs.get(s))))
  mkdirSync(join(BUILD_DIR, 'icons'), { recursive: true })
  for (const s of LINUX_SIZES) writeFileSync(join(BUILD_DIR, 'icons', `${s}x${s}.png`), pngs.get(s))
  console.log(`icons written to ${BUILD_DIR} (${sizes.size} sizes)`)
}

app.disableHardwareAcceleration()
app
  .whenReady()
  .then(main)
  .then(
    () => app.quit(),
    (err) => {
      console.error(err)
      app.exit(1)
    },
  )
