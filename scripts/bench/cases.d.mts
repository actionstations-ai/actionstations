// Types for the testable parts of scripts/bench/cases.mjs (tests/scripts/bench-run.test.ts).
export function assertNoPromptOverrides(dir: string, where: string): void
export function ideateTokens(entries: { message?: string }[]): { input: number; output: number }
export function plantedCase(c: { example: string; defects: string }): {
  defects: { scenario: string }
  scenarioId: string
  scenario: { msel: { id: string; event: string }[] }
  planted: unknown[]
}
