// Types for scripts/bench/score/util.mjs.
export const CONTROL_TAGS: Set<string>
export function clamp100(n: number): number
export function round1(n: number): number
export function share(part: number, whole: number): number
export function contentRows<R extends { purposeTag: string }>(msel: R[]): R[]
export function weighted(parts: Record<string, number>, weights: Record<string, number>): number
export function median(values: number[]): number
export function mean(values: number[]): number
export function droppedKeys(message: string | undefined): string[]
