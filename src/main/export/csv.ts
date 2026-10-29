/**
 * A small RFC 4180 CSV writer (spec 0417 FR-5). Cells that a spreadsheet would read as a formula
 * (a leading `=`, `+`, `-` or `@`, or a tab or carriage return) get a leading apostrophe.
 * The file is UTF-8 with a byte order mark so Excel opens it with the right encoding.
 */

export const CSV_BOM = '﻿'

const FORMULA_START = /^[=+\-@\t\r]/

/** One cell: formula-guarded, quoted when it holds a comma, quote or line break. */
export function csvCell(value: unknown): string {
  if (value === undefined || value === null) return ''
  let text = typeof value === 'string' ? value : String(value)
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const csvRow = (cells: readonly unknown[]): string => cells.map(csvCell).join(',')

/** Header and rows as one document with CRLF line ends and the byte order mark. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return CSV_BOM + [csvRow(header), ...rows.map(csvRow)].join('\r\n') + '\r\n'
}
