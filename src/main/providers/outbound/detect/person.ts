// People's names (FR-10): (a) a title or rank followed by one or two capitalized words ("Chief
// Dana Ruiz", "Dr. Okafor", "Sgt. Lee"); (b) a given name from the bundled list (US Social
// Security Administration baby names, top 5,000, public domain) followed by a capitalized surname;
// (c) the Name column of Markdown contact tables; (d) later mentions of a detected surname on its
// own. Words in role titles, agency names, brand aliases, document names, street suffixes and the
// Never list are not names. Pattern-based: misses are expected and the dialog says so.
import givenNameList from './lists/given-names.txt?raw'
import { STREET_SUFFIX_WORDS } from './address'
import { escapeRegExp, span, type DetectContext, type DetectedSpan } from './types'

const GIVEN = new Set(
  givenNameList
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
)

/** Given names that are far more often ordinary words when capitalized. */
const AMBIGUOUS_GIVEN = new Set(
  (
    'Will May June April August Grace Hope Faith Joy Chase Rose Mark Bill Page Summer Autumn ' +
    'Winter Sky River Ocean Storm Rain Dawn Star Major King Royal Golden Lane Glen Dale Hunter ' +
    'Forest Brook Ray Sterling Miles Pierce Gray Grey Reed Wade Cash Price Art Guy Ivy Lily ' +
    'Iris Jade Ruby Pearl Amber Crystal Destiny Harmony Liberty Justice Trinity Unique Precious ' +
    'Paris London Dallas Austin Houston Phoenix Denver Aurora Sierra Dakota Montana Carolina ' +
    'Georgia Virginia Jordan Asia China India Kenya Israel Egypt Max Rich Frank Earnest Sunny ' +
    'Marina Harbor Bay Clay Stone Rock Cliff Heath Carter Mason Cooper Porter Baker Fisher Tanner ' +
    'Taylor Parker Archer Ranger Gunner Sailor Pilot Captain Chief Judge Deputy Christian ' +
    'Constance Patience Prudence Charity Mercy Noble Saint Bishop Abbey Easter Holiday Neon ' +
    'Echo Legend Kingston Ace Bud Buck Chip Duke Earl Prince Lord Queen Princess Angel Angela ' +
    'Ebony Raven Robin Wren Jay Drew Lee Long Young Brown Green White Black Gold Silver Early ' +
    'Dell Sol Case Kit Pilot Merlin Harmon Lincoln Emerson Johnson Ridge Corwin'
  ).split(/\s+/),
)

/** Capitalized words common in plans, roles and organizations that are not names. */
const NOT_NAME_WORDS = new Set(
  (
    'the a an and or of for to in on at by with from this that these those all any each every ' +
    'no not our your their his her its we you they he she it i if then when where while after ' +
    'before during until since as is are was were be been will shall may must should can could ' +
    'officer office information executive operations operation operational security safety ' +
    'manager management coordinator coordination director directors department dept division ' +
    'unit section branch group team staff center centre command commander incident emergency ' +
    'response public affairs communications communication relations services service support ' +
    'logistics planning finance administration admin technology technical medical health fire ' +
    'police law enforcement rescue ems hazmat airport airline airlines terminal concourse gate ' +
    'gates ramp tower control controller dispatch dispatcher duty shift watch on-call primary ' +
    'secondary alternate backup deputy assistant associate senior junior chief general special ' +
    'agent agency federal state county city municipal regional district national local ' +
    'international authority board council committee commission utility utilities water power ' +
    'electric gas transit rail port harbor maritime aviation transportation highway system ' +
    'systems network networks data cyber it ot scada ics plan plans procedure procedures policy ' +
    'standard annex appendix exhibit attachment table figure page chapter part article step ' +
    'phase stage module scenario exercise drill inject injects msel startex endex hot wash ' +
    'player players controllers evaluators evaluator simcell facilitator observer observers ' +
    'participant participants briefing brief report reports form forms list contact contacts ' +
    'name names title role roles phone email address notes note status level levels alert ' +
    'warning notice bulletin update advisory alarm event events activity time date day days ' +
    'week month year hour hours minute minutes am pm monday tuesday wednesday thursday friday ' +
    'saturday sunday january february march april may june july august september october ' +
    'november december north south east west northern southern eastern western upper lower ' +
    'main new old first second third fourth fifth last next final initial interim acting ' +
    'temporary permanent internal external private corporate company corporation inc llc ltd ' +
    'co corp group holdings partners association society institute university college school ' +
    'hospital clinic station facility facilities site building campus plant yard depot ' +
    'warehouse lab laboratory vendor contractor customer customers passenger passengers crew ' +
    'tenant tenants media press news channel radio tv social account accounts user users admin ' +
    'administrator analyst engineer engineers technician technicians specialist specialists ' +
    'supervisor supervisors lead leads liaison representative representatives spokesperson ' +
    'president vice chair chairman chairwoman secretary treasurer member members mayor ' +
    'governor senator judge sheriff marshal trooper inspector superintendent commissioner ' +
    'captain lieutenant sergeant detective corporal major colonel admiral professor doctor ' +
    'nurse paramedic firefighter firefighters operator operators ranger warden constable ' +
    'investigator investigators coroner examiner attorney counsel legal compliance risk ' +
    'audit quality training human resources hr procurement purchasing budget accounting ' +
    'baggage cargo freight fuel fueling ground handling maintenance engineering facilities ' +
    'parking access badge badging credential credentials screening checkpoint perimeter ' +
    'patrol k-9 canine bomb squad swat tactical intelligence fusion joint task force ' +
    'unified area field mobile forward rear base post point zone sector region elementary ' +
    'middle high school schools election elections vote early township overview location ' +
    'message manual log logs integrity monitoring notifications processing loading room desk ' +
    'feed server vlan pilot remote partial please trends two rotating retail spanish managed ' +
    'testbed digital full contains confirms does alarms controls filters evaporation caustic ' +
    'hypochlorite scrubber chemical storage technologies foods question debate pediatric ' +
    'pediatrics description provisions cell direct hotline inspection visit takers sites line ' +
    'call epi case kit unknown drones newsroom reporter desk support approved approves ' +
    'latitude windows linux cloud vpn wi-fi wifi camera cameras'
  ).split(/\s+/),
)

/** Titles and ranks that introduce a name. Abbreviations take an optional period. */
const TITLES = [
  'Mr',
  'Mrs',
  'Ms',
  'Mx',
  'Dr',
  'Prof',
  'Capt',
  'Lt',
  'Sgt',
  'Det',
  'Cmdr',
  'Col',
  'Gov',
  'Sen',
  'Rep',
  'Rev',
  'Supt',
  'Insp',
  'Cpl',
  'Ofc',
  'Adm',
  'Chief',
  'Captain',
  'Lieutenant',
  'Sergeant',
  'Officer',
  'Detective',
  'Commander',
  'Colonel',
  'Director',
  'Mayor',
  'Governor',
  'Senator',
  'Representative',
  'Judge',
  'Sheriff',
  'Deputy',
  'Marshal',
  'Trooper',
  'Agent',
  'Superintendent',
  'Commissioner',
  'Councilmember',
  'Councilwoman',
  'Councilman',
  'Inspector',
  'Corporal',
  'Admiral',
  'Professor',
  'Doctor',
  'Reverend',
  'Pastor',
  'Father',
  'Sister',
]
const TITLE_SET = new Set(TITLES.map((t) => t.toLowerCase()))
const TITLE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${TITLES.map(escapeRegExp).join('|')})\\.?\\s+`,
  'gu',
)

/** A capitalized name word: Ruiz, McDonald, O'Neil, Okafor, Smith-Jones. */
const NAME_WORD = String.raw`(?:[A-Z]['’][A-Z][a-z]+|[A-Z][a-z]+(?:[A-Z][a-z]+)?(?:-[A-Z][a-z]+)?)`
const WHOLE_NAME_WORD = new RegExp(`^${NAME_WORD}$`, 'u')
const NAME_AT = new RegExp(`${NAME_WORD}(?![\\p{L}\\p{N}_])`, 'uy')
const INITIAL_AT = /[A-Z]\.\s+/y
const SPACE_AT = /[ \t]+/y

function isNameWord(word: string, ctx: DetectContext): boolean {
  const lower = word.toLowerCase()
  return (
    !NOT_NAME_WORDS.has(lower) &&
    !TITLE_SET.has(lower) &&
    !STREET_SUFFIX_WORDS.has(lower) &&
    !ctx.notNames.has(lower)
  )
}

/** Read a name word at `pos`; returns its end or -1. */
function wordAt(text: string, pos: number, ctx: DetectContext): number {
  NAME_AT.lastIndex = pos
  const m = NAME_AT.exec(text)
  if (!m || !isNameWord(m[0], ctx)) return -1
  return pos + m[0].length
}

function skip(re: RegExp, text: string, pos: number): number {
  re.lastIndex = pos
  return re.exec(text) ? re.lastIndex : pos
}

/** After a title: skip further titles ("Deputy Chief"), then one or two name words. */
function afterTitle(text: string, start: number, ctx: DetectContext): DetectedSpan | undefined {
  let pos = start
  for (;;) {
    TITLE_RE.lastIndex = pos
    const t = TITLE_RE.exec(text)
    if (!t || t.index !== pos) break
    pos = TITLE_RE.lastIndex
  }
  const first = wordAt(text, pos, ctx)
  if (first < 0) return undefined
  let end = first
  const gap = skip(SPACE_AT, text, first)
  const next = wordAt(text, skip(INITIAL_AT, text, gap), ctx)
  if (gap > first && next > 0) end = next
  return span(text, pos, end, 'person')
}

function titled(text: string, ctx: DetectContext): DetectedSpan[] {
  const out: DetectedSpan[] = []
  for (const m of text.matchAll(TITLE_RE)) {
    const s = afterTitle(text, m.index + m[0].length, ctx)
    if (s) out.push(s)
  }
  return out
}

const CAP_WORD = /(?<![\p{L}\p{N}_'’-])[A-Z][a-z]+(?![\p{L}\p{N}_'’])/gu

/** A listed given name, an optional middle initial, then a capitalized surname. */
function givenSurname(text: string, ctx: DetectContext): DetectedSpan[] {
  const out: DetectedSpan[] = []
  for (const m of text.matchAll(CAP_WORD)) {
    const given = m[0]
    if (!GIVEN.has(given) || AMBIGUOUS_GIVEN.has(given) || ctx.notNames.has(given.toLowerCase()))
      continue
    const afterGiven = m.index + given.length
    const gap = skip(SPACE_AT, text, afterGiven)
    if (gap === afterGiven) continue
    const end = wordAt(text, skip(INITIAL_AT, text, gap), ctx)
    if (end > 0) out.push(span(text, m.index, end, 'person'))
  }
  return out
}

const TABLE_ROW = /^\s*\|(.+)\|\s*$/
const NAME_HEADER = /^(?:name|full name|contact name|person|staff name|poc|point of contact)$/i
const SEPARATOR = /^\s*\|?\s*:?-{2,}/

const cells = (line: string): string[] => (TABLE_ROW.exec(line)?.[1] ?? '').split('|')

/** A table cell that reads as a person: "Avery Kestrel", "Jane R. Doe", "Quill". */
function looksLikeName(words: string[], ctx: DetectContext): boolean {
  if (words.length === 0 || words.length > 4) return false
  const named = words.filter((w) => !/^[A-Z]\.$/.test(w))
  if (!named.every((w) => WHOLE_NAME_WORD.test(w) && isNameWord(w, ctx))) return false
  // The header already says these are names: no given-name list needed ("Zubair Oyelaran").
  return named.length > 0
}

/** Cells under a "Name" header in Markdown tables (contact lists from ingest). */
function tableNames(text: string, ctx: DetectContext): DetectedSpan[] {
  const out: DetectedSpan[] = []
  const lines = text.split('\n')
  let offset = 0
  let column = -1
  for (let i = 0; i < lines.length; offset += lines[i]!.length + 1, i++) {
    const line = lines[i]!
    if (!TABLE_ROW.test(line)) {
      column = -1
      continue
    }
    const row = cells(line)
    if (column < 0) {
      if (SEPARATOR.test(lines[i + 1] ?? ''))
        column = row.findIndex((c) => NAME_HEADER.test(c.trim()))
      continue
    }
    if (SEPARATOR.test(line)) continue
    const cell = row[column]
    if (!cell) continue
    const value = cell.trim()
    const words = value.split(/\s+/)
    if (!looksLikeName(words, ctx)) continue
    let pipe = line.indexOf('|')
    for (let c = 0; c < column; c++) pipe = line.indexOf('|', pipe + 1)
    const at = line.indexOf(value, pipe + 1)
    if (at >= 0) out.push(span(text, offset + at, offset + at + value.length, 'person'))
  }
  return out
}

/** Later mentions of a detected person's surname on its own ("Ruiz said ..."). */
function surnames(text: string, found: DetectedSpan[], ctx: DetectContext): DetectedSpan[] {
  const names = new Set<string>()
  for (const s of found) {
    const parts = s.value.split(/\s+/)
    const last = parts[parts.length - 1]!
    if (parts.length > 1 && last.length > 2 && isNameWord(last, ctx)) names.add(last)
  }
  const out: DetectedSpan[] = []
  for (const name of [...names].sort()) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_'’-])${escapeRegExp(name)}(?![\\p{L}\\p{N}_'’])`, 'gu')
    for (const m of text.matchAll(re))
      out.push(span(text, m.index, m.index + m[0].length, 'person'))
  }
  return out
}

export function detectPersons(text: string, ctx: DetectContext): DetectedSpan[] {
  const found = [...titled(text, ctx), ...givenSurname(text, ctx), ...tableNames(text, ctx)]
  return [...found, ...surnames(text, found, ctx)]
}

/** Words of a phrase as lower-case not-name entries ("Springfield Fire Department" → 3 words). */
export function notNameWords(phrases: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const p of phrases)
    for (const w of p.toLowerCase().split(/[^\p{L}\p{N}'’-]+/u)) if (w.length > 1) out.add(w)
  return out
}
