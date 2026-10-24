// Builds docs/social-preview.png (1280×640), the GitHub social preview image, from the app logo
// and a guide screenshot (#317). Run with Electron, which lays the image out offscreen, so no
// design tools are needed:
//   pnpm exec electron scripts/make-social-preview.mjs
// The output is committed. GitHub only accepts the image through the web UI: Settings →
// General → Social preview → Edit → Upload an image.
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WIDTH = 1280
const HEIGHT = 640
const LOGO = 'src/renderer/src/assets/action-stations-logo.png'
const SCREENSHOT = 'docs/guides/images/scenario-msel.png'
const OUT = 'docs/social-preview.png'

function dataUrl(rel) {
  return `data:image/png;base64,${readFileSync(join(ROOT, rel)).toString('base64')}`
}

// Colors are the app's brand tokens (src/renderer/src/styles/tokens.css): sidebar navy with the
// blue halftone, brand yellow, ink borders.
function page() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    background-color: #0f1a3c;
    background-image: radial-gradient(rgb(31 111 214 / 0.35) 1.6px, transparent 2px);
    background-size: 14px 14px;
    font-family: -apple-system, 'Segoe UI', Inter, Roboto, sans-serif;
    color: #fbf3dd;
    position: relative;
  }
  .left { position: absolute; left: 56px; top: 64px; width: 520px; }
  .logo { width: 520px; display: block; }
  h1 { font-size: 34px; line-height: 1.25; margin: 28px 0 16px; font-weight: 700; }
  p { font-size: 22px; line-height: 1.45; margin: 0; color: #d9d2bd; }
  .tag { color: #ffd21f; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
         font-size: 17px; margin-top: 30px; }
  .shot { position: absolute; left: 620px; top: 72px; width: 760px; border: 4px solid #14100c;
          border-radius: 10px; box-shadow: 10px 10px 0 #ffd21f; }
</style></head><body>
  <div class="left">
    <img class="logo" src="${dataUrl(LOGO)}" alt="">
    <h1>Tabletop exercises built from your own plans</h1>
    <p>Scenario, MSEL, inject deck with media, controller handbook and player briefing, generated with the models you choose.</p>
    <div class="tag">Local-first desktop app · HSEEP-style</div>
  </div>
  <img class="shot" src="${dataUrl(SCREENSHOT)}" alt="">
</body></html>`
}

async function render() {
  const win = new BrowserWindow({
    show: false,
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    frame: false,
    webPreferences: { offscreen: true, javascript: false },
  })
  await win.loadURL(`data:text/html;base64,${Buffer.from(page()).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 500))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: WIDTH, height: HEIGHT })
  win.destroy()
  const sized =
    image.getSize().width === WIDTH ? image : image.resize({ width: WIDTH, height: HEIGHT })
  writeFileSync(join(ROOT, OUT), sized.toPNG())
  console.log(`wrote ${OUT} (${WIDTH}x${HEIGHT})`)
}

app.disableHardwareAcceleration()
app
  .whenReady()
  .then(render)
  .then(() => app.quit())
  .catch((err) => {
    console.error(err)
    app.exit(1)
  })
