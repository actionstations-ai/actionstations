import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { documentFileNames } from './naming'
import { assertPlayersOnly, distributionEntries, writeZip } from './zip'

const names = documentFileNames('Flight to Nowhere')

/** An export folder and the files the run wrote into it (absolute paths). */
function exportFolder(): { dir: string; files: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-zip-'))
  const files: string[] = []
  const put = (rel: string, data: string) => {
    writeFileSync(join(dir, rel), data)
    files.push(join(dir, rel))
  }
  for (const f of [
    names.msel,
    names.deck,
    names.handbook,
    names.briefing,
    names.exercisePlan,
    names.eegs,
    names.explan,
    names.sitman,
    names.handbookHseep,
    names.mselXlsx,
    'scenario.json',
    'scenario.md',
  ])
    put(f, f)
  mkdirSync(join(dir, 'forms'))
  put(join('forms', names.ics201), 'ics201')
  put(join('forms', names.ics203), 'ics203')
  mkdirSync(join(dir, 'media'))
  put(join('media', 'S3-I04-tweet.png'), 'png')
  return { dir, files }
}

describe('distribution ZIP', () => {
  it('puts everything in facilitator/ and only the packet, forms and ExPlan in players/', async () => {
    const { dir: folder, files: runFiles } = exportFolder()
    const entries = distributionEntries(folder, names, runFiles)
    const zipPath = join(mkdtempSync(join(tmpdir(), 'ttx-zip-out-')), names.zip)
    await writeZip(zipPath, entries)
    const zip = await JSZip.loadAsync(readFileSync(zipPath))
    const files = Object.keys(zip.files)
      .filter((n) => !zip.files[n]!.dir)
      .sort()
    expect(files.filter((f) => f.startsWith('players/'))).toEqual([
      'players/Flight-to-Nowhere-ExPlan.pdf',
      'players/Flight-to-Nowhere-Player-Briefing-Packet.pdf',
      'players/ICS-201-Incident-Briefing-blank.pdf',
      'players/ICS-203-Organization-Assignment-List-blank.pdf',
    ])
    expect(files).toEqual(
      expect.arrayContaining([
        'facilitator/Flight-to-Nowhere-MSEL.pdf',
        'facilitator/Flight-to-Nowhere-Master-Inject-Deck.pdf',
        'facilitator/Flight-to-Nowhere-Controller-Evaluator-Handbook.pdf',
        // The EEG packet is facilitator material (#421): never in players/.
        'facilitator/Flight-to-Nowhere-EEGs.pdf',
        'facilitator/Flight-to-Nowhere-SitMan.pdf',
        'facilitator/Flight-to-Nowhere-CE-Handbook-HSEEP.pdf',
        'facilitator/Flight-to-Nowhere-MSEL.xlsx',
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

  it('puts player handouts in players/ and keeps controller materials in facilitator/ (#224)', () => {
    const { dir: folder, files: runFiles } = exportFolder()
    for (const [name, data] of [
      [names.handouts, 'handouts'],
      [names.controllerHandouts, 'controller'],
    ] as const) {
      writeFileSync(join(folder, name), data)
      runFiles.push(join(folder, name))
    }
    const files = distributionEntries(folder, names, runFiles).map((e) => e.name)
    expect(files).toContain('players/Flight-to-Nowhere-Player-Handouts.pdf')
    expect(files).toContain('facilitator/Flight-to-Nowhere-Player-Handouts.pdf')
    expect(files).toContain('facilitator/Flight-to-Nowhere-Controller-Materials.pdf')
    expect(files).not.toContain('players/Flight-to-Nowhere-Controller-Materials.pdf')
  })

  it('puts participant survey forms in players/, never debriefs or survey results (#422)', () => {
    const { dir: folder, files: runFiles } = exportFolder()
    mkdirSync(join(folder, 'surveys'))
    const feedback = 'Flight-to-Nowhere-Survey-Participant-Feedback-Form-AAAAAA.pdf'
    const debrief = 'Flight-to-Nowhere-Survey-Facilitator-Debrief-BBBBBB.pdf'
    for (const name of [feedback, debrief]) {
      writeFileSync(join(folder, 'surveys', name), name)
      runFiles.push(join(folder, 'surveys', name))
    }
    writeFileSync(join(folder, names.surveyResults), 'results')
    runFiles.push(join(folder, names.surveyResults))
    const files = distributionEntries(folder, names, runFiles, [feedback]).map((e) => e.name)
    expect(files).toContain(`players/${feedback}`)
    expect(files).toContain(`facilitator/surveys/${feedback}`)
    expect(files).toContain(`facilitator/surveys/${debrief}`)
    expect(files).toContain(`facilitator/${names.surveyResults}`)
    expect(files).not.toContain(`players/${debrief}`)
    expect(files).not.toContain(`players/${names.surveyResults}`)
    expect(() =>
      assertPlayersOnly([{ source: '/x', name: `players/${names.surveyResults}` }], names, [
        names.surveyResults,
      ]),
    ).toThrow(/Refusing/)
  })

  it('puts the SitMan player edition in players/ only when the export wrote it (#420)', () => {
    const { dir: folder, files: runFiles } = exportFolder()
    const without = distributionEntries(folder, names, runFiles).map((e) => e.name)
    expect(without).not.toContain('players/Flight-to-Nowhere-SitMan-Player-Edition.pdf')
    writeFileSync(join(folder, names.sitmanPlayer), 'player sitman')
    runFiles.push(join(folder, names.sitmanPlayer))
    const withIt = distributionEntries(folder, names, runFiles).map((e) => e.name)
    expect(withIt).toContain('players/Flight-to-Nowhere-SitMan-Player-Edition.pdf')
    expect(withIt).not.toContain('players/Flight-to-Nowhere-SitMan.pdf')
  })

  it('refuses facilitator material in players/', () => {
    for (const leak of [
      names.sitman,
      names.handbookHseep,
      names.mselXlsx,
      names.report,
      names.controllerHandouts,
      names.msel,
      names.deck,
      names.handbook,
      names.exercisePlan,
      names.eegs,
      names.eegsDocx,
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
    expect(() => distributionEntries(folder, names, [join(folder, names.msel)])).toThrow(
      /Player file missing/,
    )
  })

  it('takes only the files this run wrote, not leftovers from an earlier export (#213)', () => {
    const { dir: folder, files: runFiles } = exportFolder()
    writeFileSync(join(folder, 'media', 'S3-I09-old-video.mp4'), 'stale')
    writeFileSync(join(folder, 'Flight-to-Nowhere-Controller-Evaluator-Handbook.docx'), 'stale')
    const zipPath = join(folder, '..', names.zip)
    const names_ = distributionEntries(folder, names, [...runFiles, zipPath]).map((e) => e.name)
    expect(names_).not.toContain('facilitator/media/S3-I09-old-video.mp4')
    expect(names_).not.toContain('facilitator/Flight-to-Nowhere-Controller-Evaluator-Handbook.docx')
    expect(names_.some((n) => n.endsWith('.zip'))).toBe(false)
    expect(names_).toContain('facilitator/media/S3-I04-tweet.png')
  })
})
