// XLSX → one section per sheet; rows become a pipe table (first non-empty row = header).
// The sheet's 1-based position is its "page".
import ExcelJS from 'exceljs'
import { OutlineBuilder } from '../outline'
import type { ParsedDocument } from '../types'
import { pipeTable } from './html'

type CellValue = ExcelJS.CellValue

/** Plain text of any exceljs cell value (rich text, formulas, hyperlinks, dates, errors). */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().replace(/T00:00:00\.000Z$/, '')
  if (typeof value !== 'object') return String(value)
  if ('richText' in value) return value.richText.map((r) => r.text).join('')
  if ('formula' in value || 'sharedFormula' in value) {
    return cellText((value as ExcelJS.CellFormulaValue).result as CellValue)
  }
  if ('hyperlink' in value) return String((value as ExcelJS.CellHyperlinkValue).text ?? '')
  if ('error' in value) return String(value.error)
  return ''
}

function sheetRows(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    const count = row.cellCount
    for (let c = 1; c <= count; c++) {
      cells.push(cellText(row.getCell(c).value).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'))
    }
    while (cells.length && !cells.at(-1)) cells.pop()
    if (cells.some(Boolean)) rows.push(cells)
  })
  return rows
}

export async function parseXlsx(filePath: string, fallbackTitle: string): Promise<ParsedDocument> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const outline = new OutlineBuilder()
  let page = 0
  workbook.eachSheet((sheet) => {
    page += 1
    outline.heading(1, sheet.name)
    const table = pipeTable(sheetRows(sheet))
    if (table) outline.paragraph(table, page)
  })
  const title = workbook.title?.trim()
  return { title: title || fallbackTitle, pages: page, sections: outline.finish() }
}
