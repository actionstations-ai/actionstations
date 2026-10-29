#!/usr/bin/env node
// PDF accessibility check (spec 0435 NFR-3): runs veraPDF with the PDF/UA-1 profile on exported
// PDFs. Usage: node scripts/check-pdf-accessibility.mjs <PDF or folder>...
// Folders are searched for *.pdf. Without veraPDF (https://verapdf.org) the script says so and
// exits 0, like the gitleaks step of local CI. Exit 1 when veraPDF reports a failure.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function pdfsIn(target) {
  if (!existsSync(target)) return []
  if (statSync(target).isFile()) return target.toLowerCase().endsWith('.pdf') ? [target] : []
  return readdirSync(target).flatMap((name) => pdfsIn(join(target, name)))
}

const files = process.argv.slice(2).flatMap(pdfsIn)
if (!files.length) {
  console.log('PDF accessibility: no PDF files to check (give files or folders as arguments)')
  process.exit(0)
}
if (spawnSync('verapdf', ['--version'], { stdio: 'ignore' }).status !== 0) {
  console.log('veraPDF not installed - skipping the PDF/UA check (install: https://verapdf.org)')
  process.exit(0)
}
let failed = 0
for (const file of files) {
  const r = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], {
    encoding: 'utf8',
  })
  const ok = r.status === 0
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${file}`)
  if (!ok) console.log((r.stdout || r.stderr || '').split('\n').slice(0, 20).join('\n'))
}
console.log(`PDF/UA-1: ${files.length - failed} of ${files.length} files pass`)
process.exit(failed ? 1 : 0)
