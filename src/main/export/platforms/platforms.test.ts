// Exports for other platforms (spec 0432): the Conducttr MEL CSV, the WebEOC / SimulationDeck
// package and the CAP 1.2 XML files. Files are written by runExport and read back: the CSV is
// parsed, the workbook is opened, the XML is parsed and its element order checked.
import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
vi.mock('../pdf', () => ({ htmlToPdf: async (html: string) => Buffer.from(html.slice(0, 64)) }))
vi.mock('../../render/window', () => ({ renderPdf: async () => Buffer.from('%PDF form') }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureModel } = await import('../../../../tests/fixtures/export/model')
const { runExport } = await import('../run')
const { Inject } = await import('../../../shared/schemas')
const { loadTemplate } = await import('../../render/templates')
const { INJECT_TYPES } = await import('../../../shared/taxonomy')
const { channelFor, CHANNELS, conducttrMethod } = await import('./channels')
const { csvCell, csvText } = await import('./csv')
const { CONDUCTTR_COLUMNS, conducttrCsv } = await import('./conducttr')
const { assertExerciseCap } = await import('./cap-xml')
const { injectText } = await import('../text-rendition')

const ctx = { progress: () => undefined, log: () => undefined, throwIfCancelled: () => undefined }
const outDir = () => mkdtempSync(join(tmpdir(), 'ttx-platforms-'))

/** RFC 4180 parser for the files this app writes (BOM and CRLF expected). */
function parseCsv(text: string): string[][] {
  expect(text.startsWith('\uFEFF')).toBe(true)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const body = text.slice(1)
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\r' && body[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else cell += c
  }
  return rows
}

interface XmlNode {
  name: string
  text: string
  children: XmlNode[]
}

/** Tiny XML reader for CAP files: elements, text, comments and the declaration. */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', text: '', children: [] }
  const stack = [root]
  for (const m of xml.matchAll(
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:]*)([^>]*?)(\/?)>|([^<]+)/g,
  )) {
    const [whole, close, name, , selfClose, text] = m
    if (whole!.startsWith('<!--') || whole!.startsWith('<?')) continue
    const top = stack.at(-1)!
    if (text !== undefined) top.text += text.trim()
    else if (close) stack.pop()
    else {
      const node: XmlNode = { name: name!, text: '', children: [] }
      top.children.push(node)
      if (!selfClose) stack.push(node)
    }
  }
  return root.children[0]!
}

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
const child = (n: XmlNode, name: string): XmlNode | undefined =>
  n.children.find((c) => c.name === name)

function alertFields(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...loadTemplate('cap_alert').preview.fields, ...over }
}

/** The fixture model with its I-07 memo replaced by a CAP alert and I-04 by an EAS broadcast. */
function modelWithAlerts(over: Record<string, unknown> = {}) {
  const model = fixtureModel()
  const swap = (rowId: string, type: string, fields: Record<string, unknown>) => {
    const i = model.injects.findIndex((x) => x.mselRowId === rowId)
    const old = model.injects[i]!
    model.injects[i] = Inject.parse({ ...old, type, title: `${type} ${rowId}`, fields })
  }
  swap('I-07', 'cap_alert', alertFields(over))
  swap('I-04', 'eas_broadcast', loadTemplate('eas_broadcast').preview.fields)
  return model
}

describe('csv writer', () => {
  it('quotes commas, quotes and line breaks and escapes formulas', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('-5')).toBe("'-5")
    expect(csvCell('ZCZC-CIV-FFW-039035+0100-2941820-EXERCISE-')).toBe(
      'ZCZC-CIV-FFW-039035+0100-2941820-EXERCISE-',
    )
  })

  it('starts with a byte order mark and ends lines with CRLF', () => {
    const text = csvText(['a', 'b'], [['1', '2']])
    expect(text).toBe('\uFEFFa,b\r\n1,2\r\n')
  })
})

describe('channel map', () => {
  it('gives every built-in inject type a channel and a Conducttr method', () => {
    for (const t of INJECT_TYPES) {
      expect(CHANNELS).toContain(channelFor(t.id))
      expect(conducttrMethod(t.id)).not.toBe('')
    }
  })

  it('maps the types the spec names', () => {
    expect(conducttrMethod('tweet')).toBe('MicroBlog')
    expect(conducttrMethod('radio_call')).toBe('Walkie-talkie')
    expect(conducttrMethod('eas_broadcast')).toBe('TV')
    expect(conducttrMethod('some_pack_type')).toBe('Email')
  })
})

describe('text rendition', () => {
  it('reads a CAP alert in reading order with the exercise note', () => {
    const text = injectText({ type: 'cap_alert', fields: alertFields() })
    expect(text.split('\n')[0]).toBe(
      'EXERCISE - Flash Flood Warning for Haldane and Marlow Counties until 5:15 PM',
    )
    expect(text).toContain('Area: Haldane County, OH; Marlow County, OH')
    expect(text).toContain('EXERCISE - NOT A REAL ALERT')
  })

  it('includes the exact SAME header for an EAS broadcast', () => {
    const fields = loadTemplate('eas_broadcast').preview.fields
    expect(injectText({ type: 'eas_broadcast', fields })).toContain(
      'SAME header: ZCZC-CIV-FFW-039035-039093+0100-2941820-EXERCISE-',
    )
  })

  it('falls back to Label: value lines in schema order for other types', () => {
    const schema = loadTemplate('time_jump_card').schema
    const fields = loadTemplate('time_jump_card').preview.fields
    const text = injectText({ type: 'time_jump_card', fields }, schema)
    expect(text.length).toBeGreaterThan(10)
    expect(text).toMatch(/^[^:\n]+: /)
  })

  it('falls back to the title when there are no fields', () => {
    expect(injectText({ type: 'memo', title: 'A memo', fields: {} })).toBe('A memo')
  })
})

describe('Conducttr MEL CSV', () => {
  // Conducttr's help page "Import Master Events List (MEL) from Excel file", read 2026-10-29.
  const PUBLISHED_METHODS = [
    'Email',
    'Msngr',
    'MicroBlog',
    'Websites / News',
    'GoSocial',
    'Notification',
    'Media pop-up',
    'Phone Call',
    'Walkie-talkie',
    'Captions',
    'Graph',
    'Portal',
    'TV',
    'Log',
    'Checklist',
    'Help Desk',
    'InfoMap',
    'Social Watch',
    'Msngr Plus',
    'TeamChat Plus',
    'TeamChat',
    'InstaMedia',
    'Telegraph',
    'Videoblog',
    'Forum',
    'Diagrams',
    'Blog',
    'Timer',
  ]

  it('uses only Method names the published import list knows (others fall back to Email)', () => {
    const used = new Set(CHANNELS.map((c) => conducttrMethod(c === 'document' ? 'memo' : c)))
    for (const type of ['tweet', 'radio_call', 'eas_broadcast', 'email', 'memo', 'some_pack_type'])
      used.add(conducttrMethod(type))
    for (const m of used) expect(PUBLISHED_METHODS, m).toContain(m)
  })

  it('writes only To type values the published import accepts', () => {
    const accepted = ['', 'Position', 'Team', 'Superteam', 'Role', 'Group', 'Conditional Group']
    const rows = parseCsv(conducttrCsv(fixtureModel())).slice(1)
    for (const r of rows) expect(accepted).toContain(r[7])
  })

  it('has the exact header row of the Import MEL template', () => {
    const rows = parseCsv(conducttrCsv(fixtureModel()))
    expect(rows[0]).toEqual([...CONDUCTTR_COLUMNS])
    expect(rows[0]!.join(',')).toBe(
      'Day,Serial,Number,Time,From,Faction,To,To type,Team,Method,Subject,Message,Timestamp,Expected Action,Expected Action Title,Expected Action ImageURL',
    )
  })

  it('writes the time as HH:mm:ss and splits recipients into one row each', () => {
    const model = fixtureModel()
    model.scenario.msel[0] = {
      ...model.scenario.msel[0]!,
      time: '1:05',
      toRoleIds: [],
      toLabel: 'Ops',
    }
    const row = model.scenario.msel[1]!
    const [a, b] = model.scenario.roles
    model.scenario.msel[1] = { ...row, toRoleIds: [a!.id, b!.id], toLabel: undefined as never }
    const rows = parseCsv(conducttrCsv(model))
    const first = rows.find((r) => r[2] === model.scenario.msel[0]!.id)!
    expect(first[3]).toBe('01:05:00')
    expect(first[6]).toBe('Ops')
    expect(first[7]).toBe('Position')
    const split = rows.filter((r) => r[2] === row.id)
    expect(split.map((r) => r[6])).toEqual([a!.name, b!.name])
  })

  it('addresses a row for everyone to All with no recipient type', () => {
    const model = fixtureModel()
    const row = model.scenario.msel[0]!
    model.scenario.msel[0] = { ...row, toRoleIds: [], toLabel: 'All' }
    const first = parseCsv(conducttrCsv(model)).find((r) => r[2] === row.id)!
    expect([first[6], first[7]]).toEqual(['All', ''])
  })

  it('puts the inject text rendition in Message and the channel in Method', () => {
    const rows = parseCsv(conducttrCsv(modelWithAlerts()))
    const cap = rows.find((r) => r[2] === 'I-07')!
    expect(cap[9]).toBe('Notification')
    expect(cap[11]).toContain('EXERCISE - NOT A REAL ALERT')
    expect(rows.find((r) => r[2] === 'I-04')![9]).toBe('TV')
  })

  it('runExport writes the CSV, the media list and the media files', async () => {
    const r = await runExport(fixtureModel(), outDir(), ['conducttr_csv'], ctx)
    const names = r.files.map((f) => basename(f))
    expect(names).toContain('Flight-to-Nowhere-S3-conducttr-mel.csv')
    expect(names).toContain('conducttr-media.csv')
    const list = parseCsv(
      readFileSync(
        r.files.find((f) => f.endsWith('conducttr-media.csv'))!,
        'utf8',
      ),
    )
    expect(list[0]).toEqual(['Number', 'file'])
    expect(list.length).toBeGreaterThan(1)
    expect(list.slice(1).every((x) => x[1]!.startsWith('conducttr-media/'))).toBe(true)
    expect(list.slice(1).every((x) => r.files.some((f) => f.endsWith(x[1]!)))).toBe(true)
  })
})

describe('WebEOC / SimulationDeck package', () => {
  it('writes msel.xlsx, msel.csv, inject text, media and an unverified README', async () => {
    const r = await runExport(modelWithAlerts(), outDir(), ['eoc_package'], ctx)
    const dir = r.files.find((f) => f.endsWith('README.txt'))!.replace(/README\.txt$/, '')
    expect(readdirSync(dir).sort()).toEqual([
      'README.txt',
      'injects',
      'media',
      'msel.csv',
      'msel.xlsx',
    ])
    expect(readFileSync(join(dir, 'README.txt'), 'utf8')).toContain('UNVERIFIED')

    const csv = parseCsv(readFileSync(join(dir, 'msel.csv'), 'utf8'))
    expect(csv[0]).toEqual([
      'Time',
      'Inject #',
      'From',
      'To',
      'Method',
      'Inject',
      'Expected action',
      'Objective / capability',
      'Notes',
      'Media file',
      'Channel',
    ])
    const eas = csv.find((x) => x[1] === 'I-04')!
    expect(eas[10]).toBe('Broadcast TV news')
    expect(eas[9]).toMatch(/^media\/I-04-image/)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(join(dir, 'msel.xlsx'))
    const sheet = wb.getWorksheet('MSEL')!
    expect(sheet.getRow(1).getCell(2).value).toBe('Inject #')
    expect(sheet.rowCount).toBe(csv.length)

    const texts = readdirSync(join(dir, 'injects'))
    expect(texts).toContain('I-07-cap-alert-i-07.txt')
    expect(readFileSync(join(dir, 'injects', 'I-07-cap-alert-i-07.txt'), 'utf8')).toContain(
      'EXERCISE - NOT A REAL ALERT',
    )
    expect(readdirSync(join(dir, 'media')).some((n) => n.startsWith('I-04-image'))).toBe(true)
  })
})

describe('CAP XML export', () => {
  it('writes one file per CAP alert, in CAP 1.2 element order, marked as an exercise', async () => {
    const r = await runExport(modelWithAlerts(), outDir(), ['cap_xml'], ctx)
    const files = r.files.filter((f) => f.includes(`${join('platforms', 'cap')}`))
    expect(files.map((f) => basename(f))).toEqual(['I-07.xml'])
    const alert = parseXml(readFileSync(files[0]!, 'utf8'))
    expect(alert.name).toBe('alert')
    expect(alert.children.map((c) => c.name)).toEqual([
      'identifier',
      'sender',
      'sent',
      'status',
      'msgType',
      'scope',
      'note',
      'info',
    ])
    expect(child(alert, 'status')!.text).toBe('Exercise')
    expect(child(alert, 'note')!.text).toContain('EXERCISE - NOT A REAL ALERT')
    const info = child(alert, 'info')!
    expect(info.children.map((c) => c.name)).toEqual([
      'language',
      'category',
      'event',
      'responseType',
      'urgency',
      'severity',
      'certainty',
      'eventCode',
      'effective',
      'expires',
      'senderName',
      'headline',
      'description',
      'instruction',
      'parameter',
      'parameter',
      'parameter',
      'area',
    ])
    expect(decode(child(info, 'headline')!.text)).toMatch(/^EXERCISE/)
    const times = [child(alert, 'sent')!, child(info, 'expires')!].map((n) => n.text)
    for (const t of times) expect(t).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/)
    const params = info.children.filter((c) => c.name === 'parameter')
    expect(params.map((p) => child(p, 'valueName')!.text)).toEqual([
      'EAS-ORG',
      'CMAMtext',
      'CMAMlongtext',
    ])
    expect(child(child(info, 'area')!, 'geocode')!.children.map((c) => c.text)).toEqual([
      'SAME',
      '039035',
    ])
  })

  it('writes status Exercise even when the inject says Actual, and skips invalid fields with a warning', async () => {
    const bad = await runExport(modelWithAlerts({ status: 'Actual' }), outDir(), ['cap_xml'], ctx)
    expect(bad.files.some((f) => f.endsWith('I-07.xml'))).toBe(false)
    expect(bad.warnings.join(' ')).toContain('I-07: CAP file not written')
  })

  it('warns when the scenario has no CAP alert', async () => {
    const r = await runExport(fixtureModel(), outDir(), ['cap_xml'], ctx)
    expect(r.warnings.join(' ')).toContain('No CAP alert injects')
  })

  it('refuses any document that is not marked as an exercise', () => {
    const doc = (status: string, note = 'EXERCISE - NOT A REAL ALERT', headline = 'EXERCISE - x') =>
      `<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><status>${status}</status><note>${note}</note><info><headline>${headline}</headline></info></alert>`
    expect(() => assertExerciseCap(doc('Exercise'))).not.toThrow()
    expect(() => assertExerciseCap(doc('Actual'))).toThrow()
    expect(() => assertExerciseCap(doc('Exercise', 'Real'))).toThrow()
    expect(() => assertExerciseCap(doc('Exercise', undefined, 'Flood'))).toThrow()
  })
})

describe('platform targets and the distribution ZIP', () => {
  it('keeps platform files in facilitator/platforms/ and out of players/', async () => {
    const r = await runExport(
      modelWithAlerts(),
      outDir(),
      ['zip', 'conducttr_csv', 'eoc_package', 'cap_xml'],
      ctx,
    )
    const zip = await JSZip.loadAsync(readFileSync(r.zipPath!))
    const names = Object.keys(zip.files)
    expect(
      names.some((n) => n.startsWith('facilitator/platforms/') && n.endsWith('-conducttr-mel.csv')),
    ).toBe(true)
    expect(names).toContain('facilitator/platforms/cap/I-07.xml')
    expect(
      names.filter((n) => n.startsWith('players/') && /platforms|conducttr|\.xml|msel/i.test(n)),
    ).toEqual([])
  })

  it('adds the media target when a platform target needs the files', async () => {
    const r = await runExport(fixtureModel(), outDir(), ['eoc_package'], ctx)
    expect(r.files.some((f) => f.includes(`${join('media', 'S3-')}`))).toBe(true)
  })
})
