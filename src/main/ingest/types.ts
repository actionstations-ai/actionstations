// Ingestion data shapes shared by parsers, the chunker and the pipeline.

/** One run of body text under a heading (and, for paged formats, on one page). */
export interface ParsedSection {
  /**
   * Raw heading texts from the outermost to the innermost heading, as they appear in the
   * document ("SECTION 13: TECHNICAL INCIDENT …", "13.6 Scenario C: …"). The document title is
   * not included. `buildHeadingPath()` turns this into the citation path.
   */
  headingPath: string[]
  /** 1-based page (PDF page, PPTX slide, XLSX sheet). Absent for unpaged formats. */
  page?: number
  /** Paragraphs separated by blank lines; tables are pipe tables. */
  text: string
}

export interface ParsedDocument {
  title: string
  /** Page / slide / sheet count; 0 for unpaged formats (MD, TXT, HTML, DOCX). */
  pages: number
  sections: ParsedSection[]
}

export type ParserKind = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'markdown' | 'text' | 'html' | 'image'

export interface ParseOptions {
  /** Abort a long parse (OCR, big PDFs). */
  signal?: AbortSignal
}
