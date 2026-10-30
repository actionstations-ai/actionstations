// The live_log export target (#417): one JSON file per live session in live-sessions/, carried
// into facilitator/ of the ZIP and never into players/.
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
vi.mock('./pdf', () => ({ htmlToPdf: async (html: string) => Buffer.from(html.slice(0, 64)) }))
vi.mock('../render/window', () => ({ renderPdf: async () => Buffer.from('%PDF form') }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { runExport, planTargets } = await import('./run')

const ctx = { progress: () => undefined, log: () => undefined, throwIfCancelled: () => undefined }
const SESSION = 'AAAAAAAAAAAAAAAAAAAAAA'

/** The fixture model with one finished live session in its project folder. */
function modelWithSession() {
  const model = fixtureModel()
  const dir = join(model.root, 'scenarios', model.scenario.id, 'live', SESSION)
  mkdirSync(dir, { recursive: true })
  const entry = {
    i: 1,
    at: '2026-10-28T13:00:00.000Z',
    kind: 'session.start',
    actor: { kind: 'controller' },
    data: {},
  }
  writeFileSync(join(dir, 'log.jsonl'), JSON.stringify(entry) + '\n')
  writeFileSync(
    join(dir, 'session.json'),
    JSON.stringify({
      id: SESSION,
      scenarioId: model.scenario.id,
      name: 'Run',
      startedAt: '2026-10-28T13:00:00.000Z',
      endedAt: '2026-10-28T14:00:00.000Z',
      connection: { kind: 'lan', tls: 'none' },
      joinUrlPublic: '',
      attribution: 'role',
      protocolVersion: 1,
    }),
  )
  return model
}

describe('live_log export target', () => {
  it('is only planned when asked for, and the ZIP does not pull it in', () => {
    expect(planTargets(['live_log'])).toEqual(['live_log'])
    expect(planTargets(['zip'])).not.toContain('live_log')
    expect(planTargets(['zip', 'live_log'])).toContain('live_log')
  })

  it('writes one JSON file per session and leaves names out', async () => {
    const out = mkdtempSync(join(tmpdir(), 'ttx-livelog-'))
    const r = await runExport(modelWithSession(), out, ['live_log'], ctx)
    const file = r.files.find((f) => basename(f) === `${SESSION}.json`)!
    expect(file.includes('live-sessions')).toBe(true)
    const json = JSON.parse(readFileSync(file, 'utf8')) as {
      format: string
      entries: unknown[]
      session: { id: string }
    }
    expect(json.format).toBe('actionstations/live-session')
    expect(json.entries).toHaveLength(1)
    expect(json.session.id).toBe(SESSION)
  })

  it('puts the log under facilitator/ in the ZIP and nothing in players/', async () => {
    const out = mkdtempSync(join(tmpdir(), 'ttx-livelog-'))
    const r = await runExport(modelWithSession(), out, ['zip', 'live_log'], ctx)
    const zip = await JSZip.loadAsync(readFileSync(r.zipPath!))
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir)
    expect(names).toContain(`facilitator/live-sessions/${SESSION}.json`)
    expect(names.filter((n) => n.startsWith('players/') && n.includes('live'))).toEqual([])
  })

  it('warns, and writes nothing, when the scenario never ran a session', async () => {
    const out = mkdtempSync(join(tmpdir(), 'ttx-livelog-'))
    const r = await runExport(fixtureModel(), out, ['live_log'], ctx)
    expect(r.warnings.join(' ')).toMatch(/No live sessions/)
    expect(r.files.filter((f) => f.includes('live-sessions'))).toEqual([])
  })
})
