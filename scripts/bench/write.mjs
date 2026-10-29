// Write a generated file the way Prettier lays it out (#434), so committed benchmark files
// (gold statistics, run files, the report and its README table) pass `pnpm format:check` as
// written.
import { writeFileSync } from 'node:fs'

export async function writeFormatted(file, text) {
  const prettier = await import('prettier')
  const options = (await prettier.resolveConfig(file)) ?? {}
  writeFileSync(file, await prettier.format(text, { ...options, filepath: file }))
}
