// A small CSV reader for FIRMS answers and imported layer files: quoted fields, doubled quotes,
// CRLF. It returns rows of strings; callers pick columns by header name.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

/** Rows as objects keyed by lower-cased, trimmed header names. */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  if (!header) return []
  const keys = header.map((h) => h.trim().toLowerCase())
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])))
}
