#!/usr/bin/env node
// Prettier over the repository, honouring .gitignore, .prettierignore and this clone's local
// exclude file (git's info/exclude, in the main checkout only: see below).
//   node scripts/format.mjs --check | --write
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const mode = process.argv[2] === '--write' ? '--write' : '--check'
const ignores = ['.gitignore', '.prettierignore']
const git = (...args) => execFileSync('git', ['rev-parse', ...args], { encoding: 'utf8' }).trim()
try {
  // info/exclude belongs to the main checkout. A worktree shares it, and a worktree that lives
  // under a folder it ignores (.claude/worktrees/) would match it whole: Prettier would check no
  // file and pass. So it is used only in the main checkout.
  const exclude = git('--git-path', 'info/exclude')
  const mainCheckout =
    git('--absolute-git-dir') === git('--path-format=absolute', '--git-common-dir')
  if (mainCheckout && exclude && existsSync(exclude)) ignores.push(exclude)
} catch {
  // not a git checkout: the two tracked ignore files are enough
}
const args = [mode, '.', ...ignores.flatMap((f) => ['--ignore-path', f])]
const r = spawnSync('prettier', args, { stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
