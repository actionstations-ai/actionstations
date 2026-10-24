// Second half of the rename migration (#277), with a stubbed safeStorage and temp folders
// standing in for the settings folder and Documents.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const storage = vi.hoisted(() => ({ available: true }))
vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  safeStorage: {
    isEncryptionAvailable: () => storage.available,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (s: string) => Buffer.from('enc:' + s),
    // Only ciphertext "written under this app name" decrypts.
    decryptString: (b: Buffer) => {
      const t = b.toString()
      if (!t.startsWith('enc:')) throw new Error('Error while decrypting the ciphertext')
      return t.slice(4)
    },
  },
}))

const { finishRenameMigration } = await import('./finish-rename-migration')
const { getSettings, resetSettingsCache } = await import('./store')
const { getSecret, resetSecretsQueue } = await import('../secrets')
const { MIGRATION_MARKER, readMarker } = await import('../lib/rename-migration')

const b64 = (s: string) => Buffer.from(s).toString('base64')
const quiet = () => undefined

let userData: string
let documents: string

function seed(): void {
  const oldProjects = join(documents, 'Tabletop Generator')
  mkdirSync(join(oldProjects, 'Airport.ttxproj'), { recursive: true })
  writeFileSync(join(oldProjects, 'Airport.ttxproj', 'project.json'), '{}')
  const settings = {
    recentProjects: [
      {
        path: join(oldProjects, 'Airport.ttxproj'),
        name: 'Airport',
        openedAt: '2026-10-20T00:00:00Z',
      },
      { path: '/Volumes/Share/Dam.ttxproj', name: 'Dam', openedAt: '2026-10-19T00:00:00Z' },
    ],
    providers: [],
    defaultProjectsDir: oldProjects,
  }
  writeFileSync(join(userData, 'settings.json'), JSON.stringify(settings))
  writeFileSync(
    join(userData, 'secrets.json'),
    JSON.stringify({
      'anthropic-1a2b': b64('enc:sk-good'),
      'openai-9f9f': b64('old-keychain-bytes'),
    }),
  )
  writeFileSync(
    join(userData, MIGRATION_MARKER),
    JSON.stringify({
      from: 'x',
      to: userData,
      at: '',
      settings: 'renamed',
      secretsCheck: 'pending',
    }),
  )
}

describe('finishRenameMigration', () => {
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'ttx-userdata-'))
    documents = mkdtempSync(join(tmpdir(), 'ttx-documents-'))
    process.env.TTX_USER_DATA = userData
    storage.available = true
    resetSettingsCache()
    resetSecretsQueue()
  })

  it('moves the projects folder and points recent projects at it', async () => {
    seed()
    await finishRenameMigration(userData, documents, quiet)
    const moved = join(documents, 'Action Stations', 'Airport.ttxproj')
    expect(existsSync(join(moved, 'project.json'))).toBe(true)
    const s = await getSettings()
    expect(s.recentProjects.map((r) => r.path)).toEqual([moved, '/Volumes/Share/Dam.ttxproj'])
    expect(s.defaultProjectsDir).toBe(join(documents, 'Action Stations'))
    expect(readMarker(userData)?.projects?.status).toBe('renamed')
  })

  it('sets aside keys that do not decrypt and asks for them again', async () => {
    seed()
    const log = vi.fn()
    await finishRenameMigration(userData, documents, log)
    expect(await getSecret('anthropic-1a2b')).toBe('sk-good')
    expect(await getSecret('openai-9f9f')).toBeUndefined()
    const aside = readdirSync(userData).filter((n) => n.startsWith('secrets.unreadable-'))
    expect(aside).toHaveLength(1)
    const kept = JSON.parse(readFileSync(join(userData, aside[0]!), 'utf8')) as Record<
      string,
      string
    >
    expect(Object.keys(kept).sort()).toEqual(['anthropic-1a2b', 'openai-9f9f'])
    expect((await getSettings()).keyReentry).toEqual({
      providerIds: ['openai-9f9f'],
      dismissed: false,
    })
    expect(readMarker(userData)?.secretsCheck).toBe('done')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('openai-9f9f'))
    expect(JSON.stringify(log.mock.calls)).not.toContain('sk-good')
  })

  it('runs once', async () => {
    seed()
    await finishRenameMigration(userData, documents, quiet)
    writeFileSync(join(userData, 'secrets.json'), JSON.stringify({ x: b64('garbage') }))
    await finishRenameMigration(userData, documents, quiet)
    expect(JSON.parse(readFileSync(join(userData, 'secrets.json'), 'utf8'))).toHaveProperty('x')
  })

  it('leaves keys alone when the OS cannot decrypt at all', async () => {
    seed()
    storage.available = false
    await finishRenameMigration(userData, documents, quiet)
    const secrets = JSON.parse(readFileSync(join(userData, 'secrets.json'), 'utf8')) as object
    expect(Object.keys(secrets)).toHaveLength(2)
    expect((await getSettings()).keyReentry).toBeUndefined()
  })

  function writeJobs(projectPaths: (string | undefined)[]): void {
    const jobs = projectPaths.map((projectPath, i) => ({
      id: `job${i}`,
      kind: 'ingest',
      status: 'paused',
      progress: 0.4,
      createdAt: '2026-10-22T00:00:00Z',
      updatedAt: '2026-10-22T00:00:00Z',
      future: { kept: true },
      ...(projectPath ? { projectPath } : {}),
    }))
    writeFileSync(join(userData, 'jobs.json'), JSON.stringify({ jobs }))
  }
  const readJobs = () =>
    (
      JSON.parse(readFileSync(join(userData, 'jobs.json'), 'utf8')) as {
        jobs: { projectPath?: string; future?: unknown }[]
      }
    ).jobs

  it('points job records at the moved projects folder (#309)', async () => {
    seed()
    writeJobs([
      join(documents, 'Tabletop Generator', 'Airport.ttxproj'),
      '/Volumes/Share/Dam.ttxproj',
      undefined,
    ])
    await finishRenameMigration(userData, documents, quiet)
    const jobs = readJobs()
    expect(jobs.map((j) => j.projectPath)).toEqual([
      join(documents, 'Action Stations', 'Airport.ttxproj'),
      '/Volumes/Share/Dam.ttxproj',
      undefined,
    ])
    expect(jobs[0]!.future).toEqual({ kept: true })
  })

  it('catches up job records on installs migrated before the fix, idempotently', async () => {
    seed()
    await finishRenameMigration(userData, documents, quiet)
    // Already migrated: the marker has projects, but jobs.json still has the old paths.
    writeJobs([join(documents, 'Tabletop Generator', 'Airport.ttxproj')])
    const log = vi.fn()
    await finishRenameMigration(userData, documents, log)
    const moved = join(documents, 'Action Stations', 'Airport.ttxproj')
    expect(readJobs()[0]!.projectPath).toBe(moved)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('1 job record'))

    const before = readFileSync(join(userData, 'jobs.json'), 'utf8')
    log.mockClear()
    await finishRenameMigration(userData, documents, log)
    expect(readFileSync(join(userData, 'jobs.json'), 'utf8')).toBe(before)
    expect(log).not.toHaveBeenCalled()
  })

  it('leaves job records alone when the projects folder did not move', async () => {
    seed()
    mkdirSync(join(documents, 'Action Stations'))
    const old = join(documents, 'Tabletop Generator', 'Airport.ttxproj')
    writeJobs([old])
    await finishRenameMigration(userData, documents, quiet)
    expect(readMarker(userData)?.projects?.status).toBe('skipped')
    expect(readJobs()[0]!.projectPath).toBe(old)
  })

  it('does nothing without a marker (no migration happened)', async () => {
    mkdirSync(join(documents, 'Tabletop Generator'))
    await finishRenameMigration(userData, documents, quiet)
    expect(existsSync(join(documents, 'Action Stations'))).toBe(false)
  })
})
