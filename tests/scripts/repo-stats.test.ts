// scripts/repo-stats.mjs: download, star and fork history for the README chart (#378).
import { describe, expect, it } from 'vitest'
import {
  addSnapshot,
  installerCounts,
  ledgerTotal,
  niceScale,
  renderChart,
  shortDate,
  spreadLabels,
  updateLedger,
} from '../../scripts/repo-stats.mjs'

describe('installerCounts', () => {
  it('counts installers only, not checksums, blockmaps or update manifests', () => {
    const counts = installerCounts([
      {
        tag_name: 'v0.4.0',
        assets: [
          { name: 'actionstations-0.4.0-mac-arm64.dmg', download_count: 5 },
          { name: 'actionstations-0.4.0-mac-arm64.dmg.blockmap', download_count: 9 },
          { name: 'actionstations-0.4.0-win-x64-setup.exe', download_count: 3 },
          { name: 'actionstations-0.4.0-win-x64-setup.exe.sha256', download_count: 1 },
          { name: 'actionstations-0.4.0-linux-x86_64.AppImage', download_count: 2 },
          { name: 'latest-mac.yml', download_count: 40 },
        ],
      },
    ])
    expect(counts).toEqual({
      'v0.4.0/actionstations-0.4.0-mac-arm64.dmg': 5,
      'v0.4.0/actionstations-0.4.0-win-x64-setup.exe': 3,
      'v0.4.0/actionstations-0.4.0-linux-x86_64.AppImage': 2,
    })
  })
})

describe('updateLedger', () => {
  it('keeps the downloads of a replaced asset when GitHub restarts its count', () => {
    let ledger = updateLedger({}, { 'v1/a.exe': 10 })
    ledger = updateLedger(ledger, { 'v1/a.exe': 2 })
    expect(ledger['v1/a.exe']).toEqual({ carried: 10, last: 2 })
    expect(ledgerTotal(ledger)).toBe(12)
  })

  it('keeps assets that were deleted from the release', () => {
    const ledger = updateLedger({ 'v1/old.dmg': { carried: 0, last: 4 } }, { 'v1/new.dmg': 1 })
    expect(ledgerTotal(ledger)).toBe(5)
  })
})

describe('addSnapshot', () => {
  it('replaces a same-day snapshot and keeps date order', () => {
    const day = (date: string, downloads: number) => ({ date, downloads, stars: 0, forks: 0 })
    const list = addSnapshot([day('2026-10-28', 1), day('2026-10-30', 2)], day('2026-10-29', 3))
    expect(addSnapshot(list, day('2026-10-29', 4)).map((s) => [s.date, s.downloads])).toEqual([
      ['2026-10-28', 1],
      ['2026-10-29', 4],
      ['2026-10-30', 2],
    ])
  })
})

describe('chart helpers', () => {
  it('picks 1-2-5 axis steps that never go below one', () => {
    expect(niceScale(0)).toEqual({ max: 1, step: 1 })
    expect(niceScale(3)).toEqual({ max: 3, step: 1 })
    expect(niceScale(1432)).toEqual({ max: 1500, step: 500 })
  })

  it('formats dates without time zone drift', () => {
    expect(shortDate('2026-01-01')).toBe('Jan 1, 2026')
  })

  it('spreads end labels that would overlap', () => {
    expect(spreadLabels([{ y: 100 }, { y: 95 }]).map((l) => l.y)).toEqual([95, 109])
  })

  it('renders an accessible SVG with the latest values for each theme', () => {
    const snapshots = [
      { date: '2026-10-27', downloads: 2, stars: 1, forks: 0 },
      { date: '2026-11-03', downloads: 40, stars: 6, forks: 2 },
    ]
    for (const theme of ['light', 'dark'] as const) {
      const svg = renderChart(snapshots, theme)
      expect(svg).toContain('role="img"')
      expect(svg).toContain('As of Nov 3, 2026: 40 installer downloads, 6 stars, 2 forks.')
      expect(svg.match(/<polyline/g)).toHaveLength(3)
    }
  })
})
