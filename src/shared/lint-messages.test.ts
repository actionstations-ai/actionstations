import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasPlainMessage, plainLintMessage } from './lint-messages'

const GENERATE = resolve(__dirname, '../main/generate')

/** Every warning code main can emit: warn('CODE', …), code: 'CODE', and exported constants. */
function emittedCodes(): string[] {
  const files = [GENERATE, join(GENERATE, 'injects')].flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => readFileSync(join(dir, f), 'utf8')),
  )
  const patterns = [
    /\b(?:warn|info|error)\(\s*'([A-Z][A-Z_]+)'/g,
    /\bcode:\s*'([A-Z][A-Z_]+)'/g,
    /export const ([A-Z][A-Z_]+) = '\1'/g,
  ]
  const codes = new Set<string>()
  for (const src of files)
    for (const re of patterns) for (const m of src.matchAll(re)) codes.add(m[1]!)
  // Error codes of AppError, not lint warnings.
  for (const c of ['VALIDATION', 'PROVIDER', 'NOT_FOUND', 'CONFLICT', 'CANCELLED', 'INTERNAL'])
    codes.delete(c)
  return [...codes].sort()
}

describe('plain-language lint messages', () => {
  it('cover every code the generator emits', () => {
    const codes = emittedCodes()
    expect(codes.length).toBeGreaterThan(30)
    expect(codes.filter((c) => !hasPlainMessage(c))).toEqual([])
  })

  it('fall back to the checker message for an unknown code', () => {
    expect(plainLintMessage({ code: 'NEW_CHECK', message: 'Row I-01 is odd' })).toBe(
      'Row I-01 is odd',
    )
    expect(plainLintMessage({ code: 'ROLE_NO_INJECT', message: 'x' })).toBe(
      'A player role has nothing to react to in this phase.',
    )
  })

  it('avoid raw codes and purpose tags in the plain text', () => {
    const codes = emittedCodes()
    for (const c of codes)
      expect(plainLintMessage({ code: c, message: '' })).not.toMatch(/[A-Z]_[A-Z]/)
  })
})
