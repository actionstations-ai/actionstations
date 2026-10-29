// Small real DOCX files for the redline tests, written with the docx library (the same one the
// exports use), so the tests open a genuine package rather than hand-written XML.
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx'

export const PIO_SENTENCE =
  'The PIO may release information after consulting the Incident Commander.'

type Block = Paragraph | Table

const para = (...runs: (string | TextRun)[]): Paragraph =>
  new Paragraph({ children: runs.map((r) => (typeof r === 'string' ? new TextRun(r) : r)) })

/** A plan with a heading, the PIO rule in one paragraph, a rule split over bold runs, a
 *  sentence wrapped over two paragraphs, a repeated sentence and a table. */
export async function samplePlan(): Promise<Uint8Array> {
  const blocks: Block[] = [
    new Paragraph({ text: '6.4 Public Information', heading: HeadingLevel.HEADING_2 }),
    para(PIO_SENTENCE),
    para(
      'Statements are ',
      new TextRun({ text: 'approved in writing', bold: true }),
      ' before release to the media.',
    ),
    para('The Deputy Incident Commander covers the post when the Incident'),
    para('Commander is away from the command post for more than an hour.'),
    para('Repeat rule: the log is closed at ENDEX.'),
    para('Repeat rule: the log is closed at ENDEX.'),
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [para('Table rule: notify the county within 30 minutes.')] }),
          ],
        }),
      ],
    }),
  ]
  const doc = new Document({ sections: [{ children: blocks }] })
  return new Uint8Array(await Packer.toBuffer(doc))
}
