/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// Types for scripts/bench/mini/probes.mjs (tests/scripts/bench-mini.test.ts).
export function waitCapped(
  ctx: any,
  jobId: string,
  label: string,
  capSeconds: number,
): Promise<{ job: { status: string; error?: string }; capped: boolean }>
export function rerunCall(ctx: any, input: any): Promise<{ obs: any; scenario: any }>
export function runProbes(ctx: any, opts?: any): Promise<any>
