import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { documentFileNames } from './naming'
import { assertPlayersOnly, distributionEntries, writeZip } from './zip'

const names = documentFileNames('Flight to Nowhere')

function exportFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-zip-'))
  for (const f of [
    names.msel,
    names.deck,
    names.handbook,
    names.briefing,
    names.exercisePlan,
    'scenario.json',
    'scenario.md',
  ])
    writeFileSync(join(dir, f), f)
  mkdirSync(join(dir, 'forms'))
  writeFileSync(join(dir, 'forms', names.ics201), 'ics201')
  writeFileSync(join(dir, 'forms', names.ics203), 'ics203')
  mkdirSync(join(dir, 'media'))
  writeFileSync(join(dir, 'media', 'S3-I04-tweet.png'), 'png')
  return dir
}

describe('distribution ZIP', () => {
  it('puts everything in facilitator/ and only the packet + blank forms in players/', async () => {
    const folder = exportFolder()
    const entries = await distributionEntries(folder, names)
    const zipPath = join(mkdtempSync(join(tmpdir(), 'ttx-zip-out-')), names.zip)
    await writeZip(zipPath, entries)
    const zip = await JSZip.loadAsync(readFileSync(zipPath))
    const files = Object.keys(zip.files)
      .filter((n) => !zip.files[n]!.dir)
      .sort()
    expect(files.filter((f) => f.startsWith('players/'))).toEqual([
      'players/Flight-to-Nowhere-Player-Briefing-Packet.pdf',
      'players/ICS-201-Incident-Briefing-blank.pdf',
      'players/ICS-203-Organization-Assignment-List-blank.pdf',
    ])
    expect(files).toEqual(
      expect.arrayContaining([
        'facilitator/Flight-to-Nowhere-MSEL.pdf',
        'facilitator/Flight-to-Nowhere-Master-Inject-Deck.pdf',
        'facilitator/Flight-to-Nowhere-Controller-Evaluator-Handbook.pdf',
        'facilitator/forms/ICS-201-Incident-Briefing-blank.pdf',
        'facilitator/media/S3-I04-tweet.png',
        'facilitator/scenario.json',
        'facilitator/scenario.md',
      ]),
    )
    expect(await zip.file('players/ICS-201-Incident-Briefing-blank.pdf')!.async('string')).toBe(
      'ics201',
    )
  })

  it('refuses facilitator material in players/', () => {
    for (const leak of [
      names.msel,
      names.deck,
      names.handbook,
      names.exercisePlan,
      'scenario.json',
      'media/S3-I04-tweet.png',
    ]) {
      expect(() => assertPlayersOnly([{ source: '/x', name: `players/${leak}` }], names)).toThrow(
        /Refusing/,
      )
    }
  })

  it('fails loudly when a player file is missing', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'ttx-zip-empty-'))
    writeFileSync(join(folder, names.msel), 'x')
    await expect(distributionEntries(folder, names)).rejects.toThrow(/Player file missing/)
  })
})
