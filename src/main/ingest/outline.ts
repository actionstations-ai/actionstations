// Builds ParsedSection[] from a stream of headings and paragraphs. Every parser feeds this,
// so heading nesting and page tracking behave the same for every format.
import type { ParsedSection } from './types'

interface OpenHeading {
  level: number
  text: string
}

export class OutlineBuilder {
  private stack: OpenHeading[] = []
  private sections: ParsedSection[] = []
  private paragraphs: string[] = []
  private page: number | undefined
  private headingList: string[] = []

  /** Open a heading at `level` (1 = outermost); closes any open heading at the same or deeper level. */
  heading(level: number, text: string): void {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean) return
    this.flush()
    while (this.stack.length && this.stack.at(-1)!.level >= level) this.stack.pop()
    this.stack.push({ level, text: clean })
    this.headingList.push(clean)
  }

  /** Add a paragraph (or a whole pipe table) to the current section. */
  paragraph(text: string, page?: number): void {
    const clean = text.replace(/[ \t]+\n/g, '\n').trim()
    if (!clean) return
    if (page !== undefined && this.page !== undefined && page !== this.page) this.flush()
    if (page !== undefined) this.page = page
    this.paragraphs.push(clean)
  }

  /** Current page for formats that announce page breaks separately (page markers in text.md). */
  setPage(page: number): void {
    if (this.page !== undefined && page !== this.page) this.flush()
    this.page = page
  }

  private flush(): void {
    if (this.paragraphs.length) {
      this.sections.push({
        headingPath: this.stack.map((h) => h.text),
        ...(this.page !== undefined ? { page: this.page } : {}),
        text: this.paragraphs.join('\n\n'),
      })
    }
    this.paragraphs = []
  }

  finish(): ParsedSection[] {
    this.flush()
    return this.sections
  }

  /** Every heading seen, in document order. */
  headings(): string[] {
    return this.headingList
  }
}
