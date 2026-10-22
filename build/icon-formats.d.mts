// Types for build/icon-formats.mjs (imported by tests/packaging/icon-formats.test.ts).
export declare function pngSize(png: Buffer): { width: number; height: number }
export declare function encodeIco(pngs: Buffer[]): Buffer
export declare const ICNS_TYPES: { type: string; size: number }[]
export declare function encodeIcns(pngBySize: Map<number, Buffer>): Buffer
export declare function readIcnsTypes(icns: Buffer): { type: string; bytes: number }[]
