#!/usr/bin/env node
// Records repository stats for the README (#378): installer downloads, stars and forks.
// GitHub keeps only a running total per release asset, with no history, and that total is lost
// when an asset is replaced. No GitHub Actions run for this repository, so this script keeps the
// history: each run adds today's snapshot to docs/stats/history.json (a second run on the same
// date replaces it) and redraws the chart and the downloads badge in docs/stats/. It reads the
// repository with `gh api`, so the GitHub CLI must be signed in. scripts/release.sh runs it.
//
//   node scripts/repo-stats.mjs [--date YYYY-MM-DD] [--offline] [--out DIR]   (pnpm stats)
//
// --offline redraws the files from history.json without fetching anything.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COLORS, escapeXml, renderBadge } from './make-badges.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const REPO = 'actionstations-ai/actionstations'

/** Files people install. Checksums, blockmaps and latest-*.yml are not downloads of the app. */
export const INSTALLER_RE = /\.(dmg|exe|msi|AppImage|deb|rpm|zip|tar\.gz)$/

/** `<tag>/<asset name>` → download count, installers only. */
export function installerCounts(releases) {
  const counts = {}
  for (const release of releases)
    for (const asset of release.assets ?? [])
      if (INSTALLER_RE.test(asset.name))
        counts[`${release.tag_name}/${asset.name}`] = asset.download_count
  return counts
}

/**
 * Merge fresh counts into the per-asset ledger. A count lower than the last one seen means the
 * asset was replaced and GitHub restarted it, so the old total moves to `carried`. Assets that
 * disappeared keep their entry: those downloads still happened.
 */
export function updateLedger(ledger, counts) {
  const next = structuredClone(ledger)
  for (const [key, count] of Object.entries(counts)) {
    const entry = next[key] ?? { carried: 0, last: 0 }
    if (count < entry.last) entry.carried += entry.last
    entry.last = count
    next[key] = entry
  }
  return Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)))
}

export const ledgerTotal = (ledger) =>
  Object.values(ledger).reduce((sum, e) => sum + e.carried + e.last, 0)

/** Add or replace the snapshot for its date, keeping the list in date order. */
export function addSnapshot(snapshots, snapshot) {
  return [...snapshots.filter((s) => s.date !== snapshot.date), snapshot].sort((a, b) =>
    a.date.localeCompare(b.date),
  )
}

/** Axis maximum and step: 1, 2 or 5 × 10^n, about four steps, never below 1. */
export function niceScale(max) {
  const raw = Math.max(max, 1) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw),
  )
  return { max: Math.max(step, Math.ceil(max / step) * step), step }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

// Validated with the data-viz palette checker against GitHub's light and dark page colors.
export const THEMES = {
  light: {
    surface: '#ffffff',
    text: '#1f2328',
    muted: '#59636e',
    grid: '#d1d9e0',
    series: { downloads: '#2a78d6', stars: '#eb6834', forks: '#1baf7a' },
  },
  dark: {
    surface: '#0d1117',
    text: '#f0f6fc',
    muted: '#9198a1',
    grid: '#3d444d',
    series: { downloads: '#3987e5', stars: '#d95926', forks: '#199e70' },
  },
}

const LABELS = { downloads: 'Installer downloads', stars: 'Stars', forks: 'Forks' }
const W = 760
const H = 270
const PANEL_W = 340
const FONT = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`

/** Push end-of-line value labels apart so two lines ending close together stay readable. */
export function spreadLabels(labels, gap = 14) {
  const sorted = [...labels].sort((a, b) => a.y - b.y)
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i].y - sorted[i - 1].y < gap) sorted[i] = { ...sorted[i], y: sorted[i - 1].y + gap }
  return sorted
}

/** One small-multiple panel: a title, an optional legend, a y axis from 0, and lines. */
function panel(snapshots, keys, title, x0, theme) {
  const top = keys.length > 1 ? 70 : 50
  const plot = { left: x0 + 36, right: x0 + PANEL_W - 44, top, bottom: H - 36 }
  const { max, step } = niceScale(Math.max(...snapshots.flatMap((s) => keys.map((k) => s[k]))))
  const times = snapshots.map((s) => Date.parse(s.date))
  const [t0, t1] = [Math.min(...times), Math.max(...times)]
  const px = (t) =>
    t1 === t0
      ? (plot.left + plot.right) / 2
      : plot.left + ((t - t0) / (t1 - t0)) * (plot.right - plot.left)
  const py = (v) => plot.bottom - (v / max) * (plot.bottom - plot.top)
  const out = [
    `<text x="${x0}" y="20" fill="${theme.text}" font-size="14" font-weight="600" ${FONT}>${escapeXml(title)}</text>`,
  ]
  if (keys.length > 1)
    keys.forEach((k, i) => {
      const lx = x0 + i * 90
      out.push(
        `<rect x="${lx}" y="34" width="12" height="12" rx="2" fill="${theme.series[k]}"/>`,
        `<text x="${lx + 18}" y="44" fill="${theme.muted}" font-size="12" ${FONT}>${LABELS[k]}</text>`,
      )
    })
  for (let v = 0; v <= max; v += step) {
    const y = py(v).toFixed(1)
    out.push(
      `<line x1="${plot.left}" x2="${plot.right}" y1="${y}" y2="${y}" stroke="${theme.grid}" stroke-width="1"/>`,
      `<text x="${plot.left - 8}" y="${y}" dy="4" text-anchor="end" fill="${theme.muted}" font-size="11" ${FONT}>${v}</text>`,
    )
  }
  const first = shortDate(snapshots[0].date)
  const last = shortDate(snapshots.at(-1).date)
  out.push(
    `<text x="${plot.left}" y="${H - 14}" fill="${theme.muted}" font-size="11" ${FONT}>${first}</text>`,
  )
  if (last !== first)
    out.push(
      `<text x="${plot.right}" y="${H - 14}" text-anchor="end" fill="${theme.muted}" font-size="11" ${FONT}>${last}</text>`,
    )
  const ends = []
  for (const k of keys) {
    const pts = snapshots.map((s, i) => [px(times[i]), py(s[k])])
    const color = theme.series[k]
    if (pts.length > 1)
      out.push(
        `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>`,
      )
    const [lx, ly] = pts.at(-1)
    out.push(
      `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="${color}" stroke="${theme.surface}" stroke-width="2"/>`,
    )
    ends.push({ x: lx + 8, y: ly, value: snapshots.at(-1)[k] })
  }
  for (const { x, y, value } of spreadLabels(ends))
    out.push(
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" dy="4" fill="${theme.text}" font-size="12" font-weight="600" ${FONT}>${value.toLocaleString('en-US')}</text>`,
    )
  return out.join('\n')
}

/** The README chart: downloads, and stars with forks, as two panels (never one dual axis). */
export function renderChart(snapshots, themeName) {
  const theme = THEMES[themeName]
  const latest = snapshots.at(-1)
  const desc = `As of ${shortDate(latest.date)}: ${latest.downloads} installer downloads, ${latest.stars} stars, ${latest.forks} forks. Data in docs/stats/history.json.`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">`,
    `<title id="t">Installer downloads, stars and forks over time</title>`,
    `<desc id="d">${escapeXml(desc)}</desc>`,
    `<rect width="${W}" height="${H}" rx="6" fill="${theme.surface}"/>`,
    `<g transform="translate(16 8)">`,
    panel(snapshots, ['downloads'], 'Installer downloads (all releases)', 0, theme),
    panel(snapshots, ['stars', 'forks'], 'Stars and forks', PANEL_W + 48, theme),
    `</g>`,
    `</svg>`,
    '',
  ].join('\n')
}

export function emptyHistory() {
  return { repo: REPO, assets: {}, snapshots: [] }
}

function gh(path) {
  return JSON.parse(
    execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8' }),
  )
}

/** Stars, forks and installer counts from GitHub. */
export function fetchStats(repo = REPO) {
  const [info] = gh(`repos/${repo}`)
  const releases = gh(`repos/${repo}/releases?per_page=100`).flat()
  return {
    stars: info.stargazers_count,
    forks: info.forks_count,
    counts: installerCounts(releases),
  }
}

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function main() {
  const outDir = resolve(arg('--out') ?? join(ROOT, 'docs', 'stats'))
  const file = join(outDir, 'history.json')
  let history = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : emptyHistory()
  if (!process.argv.includes('--offline')) {
    const date = arg('--date') ?? new Date().toISOString().slice(0, 10)
    const { stars, forks, counts } = fetchStats(history.repo)
    const assets = updateLedger(history.assets, counts)
    const snapshot = { date, downloads: ledgerTotal(assets), stars, forks }
    history = { ...history, assets, snapshots: addSnapshot(history.snapshots, snapshot) }
  }
  if (!history.snapshots.length) throw new Error(`no snapshots in ${file}; run without --offline`)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(file, JSON.stringify(history, null, 2) + '\n')
  for (const theme of Object.keys(THEMES))
    writeFileSync(join(outDir, `downloads-${theme}.svg`), renderChart(history.snapshots, theme))
  const latest = history.snapshots.at(-1)
  writeFileSync(
    join(outDir, 'downloads-badge.svg'),
    renderBadge({ label: 'downloads', message: String(latest.downloads), color: COLORS.blue }),
  )
  console.log(
    `repo-stats ${latest.date}: ${latest.downloads} installer downloads, ${latest.stars} stars, ${latest.forks} forks → ${outDir}`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
