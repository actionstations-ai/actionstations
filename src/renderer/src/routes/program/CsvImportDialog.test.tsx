// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { mockTtx } from '../documents/test-utils'
import { CsvImportDialog } from './CsvImportDialog'
import { tallyRows } from './csv-import-rows'

afterEach(cleanup)

const preview = {
  rows: [
    { line: 2, title: 'Update the call tree', status: 'open', warnings: [] },
    { line: 3, title: 'Buy radios', status: 'open', warnings: [], duplicate: true },
    { line: 4, title: '', status: 'open', warnings: [], error: 'No title' },
    {
      line: 5,
      title: 'Fix FIDS',
      status: 'completed',
      warnings: ['Start date "soon" is not a date'],
    },
  ],
  ignoredColumns: ['Cost'],
}

describe('tallyRows', () => {
  it('splits rows into create, already present and refused', () => {
    expect(tallyRows(preview.rows as never)).toEqual({ create: 2, duplicates: 1, refused: 1 })
  })
})

describe('CsvImportDialog (#504)', () => {
  const setup = () => {
    const ttx = mockTtx({
      'program:import-csv-preview': () => preview as never,
      'program:import-csv': () => ({ created: 2, skipped: 2 }),
    })
    render(<CsvImportDialog programPath="/prog" onClose={() => undefined} />)
    return ttx
  }
  const choose = async () => {
    const file = new File(['Title\nA'], 'actions.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } })
    await screen.findByText(/2 to create, 1 already in the program, 1 that cannot be imported/)
  }

  it('keeps Import disabled until a file has been read, then shows what will happen', async () => {
    setup()
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    await choose()
    expect(screen.getByText('Not imported: No title')).toBeTruthy()
    expect(screen.getByText('Already in the program')).toBeTruthy()
    expect(screen.getByText(/Columns not used: Cost/)).toBeTruthy()
    expect(screen.getByText(/is not a date/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('sends the file text to the import once and closes', async () => {
    const ttx = setup()
    await choose()
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(ttx.calls('program:import-csv')).toHaveLength(1))
    expect(ttx.calls('program:import-csv')[0]).toEqual({ programPath: '/prog', csv: 'Title\nA' })
  })

  it('has no axe violations with a preview shown', async () => {
    setup()
    await choose()
    const result = await axe.run(screen.getByRole('dialog'), {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
