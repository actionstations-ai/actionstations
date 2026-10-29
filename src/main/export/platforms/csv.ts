// CSV for other platforms (spec 0432 NFR-5): UTF-8 with a byte order mark (Excel on Windows),
// CRLF line ends, RFC 4180 quoting. A cell that starts like a formula (= + - @, tab, CR) gets a
// leading apostrophe so no spreadsheet evaluates it.

const BOM = '﻿'

/** "=SUM(A1)" becomes "'=SUM(A1)"; other text is unchanged. */
export function neutralizeCsvFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export function csvCell(value: string): string {
  const safe = neutralizeCsvFormula(value)
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function csvText(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','))
  return `${BOM}${lines.join('\r\n')}\r\n`
}
