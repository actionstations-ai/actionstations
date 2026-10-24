#!/usr/bin/env node
// Prettier over the repository, honouring .gitignore, .prettierignore and this clone's local
// exclude file (git's info/exclude, wherever git keeps it: in a worktree .git is a file).
//   node scripts/format.mjs --check | --write
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const mode = process.argv[2] === '--write' ? '--write' : '--check'
const ignores = ['.gitignore', '.prettierignore']
try {
  const exclude = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
    encoding: 'utf8',
  }).trim()
  if (exclude && existsSync(exclude)) ignores.push(exclude)
} catch {
  // not a git checkout: the two tracked ignore files are enough
}
const args = [mode, '.', ...ignores.flatMap((f) => ['--ignore-path', f])]
const r = spawnSync('prettier', args, { stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
