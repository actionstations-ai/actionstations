/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// Types for scripts/bench/mini/probes.mjs (tests/scripts/bench-mini.test.ts).
export function streamGuardOptions(suite: any): { streamGuard: Record<string, number> }
export function rerunCall(ctx: any, input: any): Promise<{ obs: any; scenario: any }>
export function runProbes(ctx: any, opts?: any): Promise<any>
