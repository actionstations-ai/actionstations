// Page splitting for paper templates whose lists can outgrow one Letter page (#331).
// Templates cannot measure text, so each row gets an estimated height from its text length
// (characters per line of the column it wraps in) and rows are packed into pages by a pixel
// budget: `first` for page 1 (which carries the form's header blocks), `rest` for
// continuation sheets. Deterministic: the same fields always give the same pages.
//
//   {{#each (paginate (rows fields.items key="items" min=24 line=15 pad=9 wrap="description:62")
//                     (rows fields.notes key="notes" heading=40 line=16 wrap="110")
//                     first=730 rest=860)}}
//     <section class="page">… {{#each groups}}{{#if (eq key "items")}}…{{/if}}{{/each}}</section>
//   {{/each}}

export interface RowOptions {
  /** Group name the template switches on. */
  key: string
  /** List items are sections whose `nested` property holds the rows; one group per section. */
  nested?: string
  /** Pixels a group costs on every page it starts on (its heading and table header). */
  heading: number
  /** Minimum row height in pixels. */
  min: number
  /** Pixels per wrapped text line. */
  line: number
  /** Fixed pixels per row (cell padding, borders). */
  pad: number
  /** "field:chars,field:chars" (object rows) or "chars" (text rows): characters per line. */
  wrap: string
  /** Emit the group on page 1 even when it has no rows (a table that is always printed). */
  keep: boolean
}

export interface Row {
  item: unknown
  /** Position in the group's list (0-based) and 1-based number. */
  index: number
  number: number
  cost: number
}

export interface RowGroup {
  key: string
  /** The section object for `nested` groups. */
  section?: unknown
  heading: number
  keep: boolean
  rows: Row[]
}

export interface PageGroup {
  key: string
  section?: unknown
  /** The group started on an earlier page. */
  continued: boolean
  /** The group goes on to the next page. */
  continues: boolean
  rows: Omit<Row, 'cost'>[]
}

export interface Page {
  number: number
  total: number
  first: boolean
  last: boolean
  groups: PageGroup[]
}

const num = (v: unknown, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Wrapped line count of a text in a column of `cpl` characters (explicit newlines count). */
export function lineCount(text: unknown, cpl: number): number {
  const s = text === undefined || text === null ? '' : String(text)
  const width = Math.max(1, cpl)
  return s.split(/\r?\n/).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / width)), 0)
}

function parseWrap(wrap: string): { field?: string; cpl: number }[] {
  return wrap
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [a, b] = part.split(':')
      return b === undefined ? { cpl: num(a, 80) } : { field: a!.trim(), cpl: num(b, 80) }
    })
}

function rowCost(item: unknown, o: RowOptions): number {
  const spec = parseWrap(o.wrap)
  let lines = 1
  for (const { field, cpl } of spec) {
    const text =
      field === undefined
        ? item
        : item && typeof item === 'object'
          ? (item as Record<string, unknown>)[field]
          : undefined
    lines = Math.max(lines, lineCount(text, cpl))
  }
  return Math.max(o.min, o.pad + o.line * lines)
}

function toRows(list: unknown[], o: RowOptions): Row[] {
  return list.map((item, index) => ({ item, index, number: index + 1, cost: rowCost(item, o) }))
}

/** A list (or a text, split into paragraphs) as row groups with estimated row heights. */
export function rowGroups(list: unknown, options: Partial<RowOptions>): RowGroup[] {
  const o: RowOptions = {
    key: String(options.key ?? 'rows'),
    ...(options.nested ? { nested: String(options.nested) } : {}),
    heading: num(options.heading, 0),
    min: num(options.min, 0),
    line: num(options.line, 16),
    pad: num(options.pad, 0),
    wrap: String(options.wrap ?? ''),
    keep: options.keep === true,
  }
  const group = (rows: Row[], section?: unknown): RowGroup => ({
    key: o.key,
    ...(section !== undefined ? { section } : {}),
    heading: o.heading,
    keep: o.keep,
    rows,
  })
  if (typeof list === 'string') {
    const paragraphs = list
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean)
    return paragraphs.length || o.keep ? [group(toRows(paragraphs, o))] : []
  }
  if (!Array.isArray(list)) return o.keep ? [group([])] : []
  if (o.nested) {
    const nested = o.nested
    return list.map((section) => {
      const items =
        section && typeof section === 'object' ? (section as Record<string, unknown>)[nested] : []
      return group(toRows(Array.isArray(items) ? items : [], o), section)
    })
  }
  return list.length || o.keep ? [group(toRows(list, o))] : []
}

/** Pack row groups into pages: `first` pixels on page 1, `rest` on every later page. */
export function paginate(groups: RowGroup[], first: number, rest: number): Page[] {
  const pages: { groups: PageGroup[]; used: number }[] = [{ groups: [], used: 0 }]
  const cap = () => (pages.length === 1 ? first : rest)
  const current = () => pages[pages.length - 1]!
  const newPage = () => pages.push({ groups: [], used: 0 })
  for (const g of groups) {
    let open: PageGroup | undefined
    let placed = 0
    const start = (need: number) => {
      if (current().used + need > cap() && current().groups.length) newPage()
      if (open) open.continues = true
      open = {
        key: g.key,
        ...(g.section !== undefined ? { section: g.section } : {}),
        continued: placed > 0,
        continues: false,
        rows: [],
      }
      current().groups.push(open)
      current().used += g.heading
    }
    if (!g.rows.length) {
      if (g.keep || g.section !== undefined) start(g.heading)
      continue
    }
    for (const row of g.rows) {
      // A group starts with its heading and at least two rows together (no lone first row).
      if (!open) start(g.heading + row.cost + (g.rows[1]?.cost ?? 0))
      else if (current().used + row.cost > cap()) {
        newPage()
        start(g.heading + row.cost)
      }
      open!.rows.push({ item: row.item, index: row.index, number: row.number })
      current().used += row.cost
      placed++
    }
  }
  const total = pages.length
  return pages.map((p, i) => ({
    number: i + 1,
    total,
    first: i === 0,
    last: i === total - 1,
    groups: p.groups,
  }))
}
