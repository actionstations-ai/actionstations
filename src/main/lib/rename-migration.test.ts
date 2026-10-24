// Rename migration (#277): the old "Tabletop Generator" folders move to "Action Stations".
// Every test works in its own temp folder; the real settings and Documents folders are never used.
import { describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import * as nodeFs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defaultProjectsDir,
  migrateProjectsFolder,
  migrateUserData,
  MIGRATION_MARKER,
  moveFolder,
  readMarker,
  rebase,
  rebaseJobsFile,
  type MoveOps,
} from './rename-migration'

const home = () => mkdtempSync(join(tmpdir(), 'ttx-rename-'))
const quiet = () => undefined

function seedOldSettings(appData: string): string {
  const old = join(appData, 'Tabletop Generator')
  mkdirSync(join(old, 'Local Storage'), { recursive: true })
  writeFileSync(join(old, 'settings.json'), '{"onboardingComplete":true}')
  writeFileSync(join(old, 'secrets.json'), '{}')
  writeFileSync(join(old, 'Local Storage', 'leveldb.log'), 'ui state')
  return old
}

const exdev = (): never => {
  throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' })
}
const crossDevice: MoveOps = { renameSync: exdev, cpSync: nodeFs.cpSync }
const copyFails: MoveOps = {
  renameSync: exdev,
  cpSync: (from, to, opts) => {
    nodeFs.cpSync(from, to, opts)
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
  },
}

describe('moveFolder', () => {
  it('renames when it can', () => {
    const dir = home()
    const from = seedOldSettings(dir)
    const to = join(dir, 'Action Stations')
    expect(moveFolder(from, to)).toEqual({ ok: true, method: 'renamed' })
    expect(existsSync(from)).toBe(false)
    expect(readFileSync(join(to, 'Local Storage', 'leveldb.log'), 'utf8')).toBe('ui state')
  })

  it('copies across devices and keeps the source', () => {
    const dir = home()
    const from = seedOldSettings(dir)
    const to = join(dir, 'Action Stations')
    expect(moveFolder(from, to, crossDevice)).toEqual({ ok: true, method: 'copied' })
    expect(existsSync(join(from, 'settings.json'))).toBe(true)
    expect(existsSync(join(to, 'settings.json'))).toBe(true)
    expect(readdirSync(dir).sort()).toEqual(['Action Stations', 'Tabletop Generator'])
  })

  it('leaves no half copy and keeps the source when the copy fails', () => {
    const dir = home()
    const from = seedOldSettings(dir)
    const to = join(dir, 'Action Stations')
    const r = moveFolder(from, to, copyFails)
    expect(r.ok).toBe(false)
    expect(existsSync(to)).toBe(false)
    expect(readdirSync(dir)).toEqual(['Tabletop Generator'])
    expect(existsSync(join(from, 'settings.json'))).toBe(true)
  })

  it('replaces an empty target folder but never a full one', () => {
    const dir = home()
    const from = seedOldSettings(dir)
    const to = join(dir, 'Action Stations')
    mkdirSync(to)
    writeFileSync(join(to, 'mine.txt'), 'x')
    expect(moveFolder(from, to).ok).toBe(false)
    expect(existsSync(join(from, 'settings.json'))).toBe(true)
  })
})

describe('migrateUserData', () => {
  it('moves the old settings folder and writes a marker', () => {
    const appData = home()
    seedOldSettings(appData)
    const log = vi.fn()
    const r = migrateUserData(appData, log)
    expect(r).toEqual({ userData: join(appData, 'Action Stations'), outcome: 'renamed' })
    expect(readFileSync(join(r.userData, 'settings.json'), 'utf8')).toContain('onboardingComplete')
    expect(readMarker(r.userData)).toMatchObject({ settings: 'renamed', secretsCheck: 'pending' })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('settings renamed'))
  })

  it('does nothing once the new folder has settings', () => {
    const appData = home()
    seedOldSettings(appData)
    mkdirSync(join(appData, 'Action Stations'))
    writeFileSync(join(appData, 'Action Stations', 'settings.json'), '{}')
    const r = migrateUserData(appData, quiet)
    expect(r.outcome).toBe('skipped')
    expect(existsSync(join(appData, 'Tabletop Generator', 'settings.json'))).toBe(true)
    expect(existsSync(join(appData, 'Action Stations', MIGRATION_MARKER))).toBe(false)
  })

  it('does nothing on a fresh install', () => {
    const appData = home()
    expect(migrateUserData(appData, quiet)).toEqual({
      userData: join(appData, 'Action Stations'),
      outcome: 'skipped',
      reason: 'no old folder',
    })
    expect(readdirSync(appData)).toEqual([])
  })

  it('sets aside a new folder that holds no settings, then moves the old one in', () => {
    const appData = home()
    seedOldSettings(appData)
    mkdirSync(join(appData, 'Action Stations', 'Crashpad'), { recursive: true })
    const r = migrateUserData(appData, quiet)
    expect(r.outcome).toBe('renamed')
    expect(existsSync(join(r.userData, 'settings.json'))).toBe(true)
    const aside = readdirSync(appData).filter((n) => n.startsWith('Action Stations (before'))
    expect(aside).toHaveLength(1)
  })

  it('records a copy and keeps the old folder', () => {
    const appData = home()
    seedOldSettings(appData)
    const r = migrateUserData(appData, quiet, crossDevice)
    expect(r.outcome).toBe('copied')
    expect(readMarker(r.userData)?.settings).toBe('copied')
    expect(existsSync(join(appData, 'Tabletop Generator', 'settings.json'))).toBe(true)
  })

  it('keeps using the old folder when it cannot be moved or copied', () => {
    const appData = home()
    const old = seedOldSettings(appData)
    const log = vi.fn()
    const r = migrateUserData(appData, log, copyFails)
    expect(r).toMatchObject({ userData: old, outcome: 'failed' })
    expect(existsSync(join(old, 'settings.json'))).toBe(true)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('could not move settings'))
  })
})

describe('projects folder', () => {
  it('moves Documents/Tabletop Generator once', () => {
    const docs = home()
    mkdirSync(join(docs, 'Tabletop Generator', 'Airport.ttxproj'), { recursive: true })
    const r = migrateProjectsFolder(docs, quiet)
    expect(r.status).toBe('renamed')
    expect(existsSync(join(docs, 'Action Stations', 'Airport.ttxproj'))).toBe(true)
    expect(migrateProjectsFolder(docs, quiet).status).toBe('skipped')
  })

  it('never merges into an existing new folder', () => {
    const docs = home()
    mkdirSync(join(docs, 'Tabletop Generator', 'A.ttxproj'), { recursive: true })
    mkdirSync(join(docs, 'Action Stations', 'B.asproj'), { recursive: true })
    expect(migrateProjectsFolder(docs, quiet).status).toBe('skipped')
    expect(existsSync(join(docs, 'Tabletop Generator', 'A.ttxproj'))).toBe(true)
  })

  it('reports a failed move and the default folder stays the old one', () => {
    const docs = home()
    mkdirSync(join(docs, 'Tabletop Generator', 'A.ttxproj'), { recursive: true })
    expect(migrateProjectsFolder(docs, quiet, copyFails).status).toBe('failed')
    expect(defaultProjectsDir(docs)).toBe(join(docs, 'Tabletop Generator'))
  })

  it('defaults to Documents/Action Stations', () => {
    const docs = home()
    expect(defaultProjectsDir(docs)).toBe(join(docs, 'Action Stations'))
    mkdirSync(join(docs, 'Tabletop Generator'))
    mkdirSync(join(docs, 'Action Stations'))
    expect(defaultProjectsDir(docs)).toBe(join(docs, 'Action Stations'))
  })

  it('rebases only paths inside the old folder', () => {
    const from = join(tmpdir(), 'Tabletop Generator')
    const to = join(tmpdir(), 'Action Stations')
    expect(rebase(join(from, 'A.ttxproj'), from, to)).toBe(join(to, 'A.ttxproj'))
    expect(rebase(from, from, to)).toBe(to)
    expect(rebase(join(tmpdir(), 'Tabletop Generator 2', 'A'), from, to)).toBeUndefined()
    expect(rebase('/elsewhere/A.asproj', from, to)).toBeUndefined()
  })
})

describe('rebaseJobsFile (#309)', () => {
  const from = join(tmpdir(), 'Tabletop Generator')
  const to = join(tmpdir(), 'Action Stations')

  it('rewrites job project paths under the old folder, once', () => {
    const file = join(home(), 'jobs.json')
    const jobs = [
      { id: 'a', projectPath: join(from, 'A.ttxproj') },
      { id: 'b', projectPath: '/elsewhere/B.ttxproj' },
      { id: 'c' },
    ]
    writeFileSync(file, JSON.stringify({ jobs }))
    expect(rebaseJobsFile(file, from, to)).toBe(1)
    const after = JSON.parse(readFileSync(file, 'utf8')) as { jobs: typeof jobs }
    expect(after.jobs.map((j) => j.projectPath)).toEqual([
      join(to, 'A.ttxproj'),
      '/elsewhere/B.ttxproj',
      undefined,
    ])
    expect(rebaseJobsFile(file, from, to)).toBe(0)
  })

  it('leaves a missing or unreadable file alone', () => {
    const dir = home()
    expect(rebaseJobsFile(join(dir, 'jobs.json'), from, to)).toBe(0)
    writeFileSync(join(dir, 'jobs.json'), '{not json')
    expect(rebaseJobsFile(join(dir, 'jobs.json'), from, to)).toBe(0)
    expect(readFileSync(join(dir, 'jobs.json'), 'utf8')).toBe('{not json')
  })
})
