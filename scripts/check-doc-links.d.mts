// Types for scripts/check-doc-links.mjs (imported by src/shared/tips/tips.test.ts).
export function findMarkdown(dir: string): string[]
export function stripCode(text: string): string
export function slugify(heading: string): string
export function headingSlugs(text: string): Set<string>
export function extractLinks(text: string): { target: string; line: number }[]
export function checkFile(file: string): { line: number; target: string; reason: string }[]
