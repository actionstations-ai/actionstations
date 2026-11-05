// Classroom PDFs (#722, #724, #727): the rubric handout, a student's score report and the
// reflection sheets. They are returned to the app as bytes for the instructor to save; nothing is
// written into the project's shareable folders and nothing is sent anywhere.
import { slugify } from '../lib/fs'
import { AppError } from '../lib/errors'
import { listScenarios } from '../scenario/manage'
import { reflectionSheetsHtml, rubricHandoutHtml, studentReportHtml } from './handouts'
import { scoringView, listEvidence } from './scoring'
import { readCourse } from './store'

export interface PdfFile {
  fileName: string
  /** The PDF, base64. */
  base64: string
}

async function print(html: string, what: string): Promise<string> {
  const { htmlToPdf } = await import('../export/pdf')
  return (await htmlToPdf(html, what)).toString('base64')
}

async function css(): Promise<string> {
  const { embeddedFontsCss } = await import('../export/page')
  const { printCss } = await import('../export/templates')
  return `${embeddedFontsCss()}\n${printCss()}`
}

async function titleOf(root: string, scenarioId: string): Promise<string> {
  return (await listScenarios(root)).find((s) => s.id === scenarioId)?.title ?? scenarioId
}

export async function rubricPdf(root: string, rubricId: string): Promise<PdfFile> {
  const rubric = (await readCourse(root)).rubrics.find((r) => r.id === rubricId)
  if (!rubric) throw new AppError('NOT_FOUND', 'No such rubric.')
  return {
    fileName: `${slugify(rubric.name)}-rubric.pdf`,
    base64: await print(rubricHandoutHtml(rubric, await css()), 'Rubric handout'),
  }
}

export async function studentReportPdf(
  root: string,
  scenarioId: string,
  studentId: string,
): Promise<PdfFile> {
  const course = await readCourse(root)
  const student = course.students.find((s) => s.id === studentId)
  if (!student) throw new AppError('NOT_FOUND', 'That student is not on the roster.')
  const view = await scoringView(root, scenarioId, student.sectionId)
  const html = studentReportHtml(
    {
      course,
      view,
      studentId,
      scenarioTitle: await titleOf(root, scenarioId),
      evidence: await listEvidence(root, scenarioId, studentId),
    },
    await css(),
  )
  return {
    fileName: `${slugify(student.name)}-report.pdf`,
    base64: await print(html, 'Student report'),
  }
}

export async function reflectionSheetsPdf(
  root: string,
  sectionId: string,
  scenarioId: string,
): Promise<PdfFile> {
  const course = await readCourse(root)
  const section = course.sections.find((s) => s.id === sectionId)
  if (!section) throw new AppError('NOT_FOUND', 'No such section.')
  const names = course.students.filter((s) => s.sectionId === sectionId).map((s) => s.name)
  if (names.length === 0) throw new AppError('VALIDATION', 'This section has no students.')
  const html = reflectionSheetsHtml(
    course.reflectionPrompts,
    names,
    await titleOf(root, scenarioId),
    await css(),
  )
  return {
    fileName: `${slugify(section.name)}-reflection-sheets.pdf`,
    base64: await print(html, 'Reflection sheets'),
  }
}
