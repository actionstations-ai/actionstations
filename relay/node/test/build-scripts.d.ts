/** The build script is plain JavaScript; this is the one export the tests use. */
declare module '*/scripts/build.mjs' {
  export function bundle(options?: { outfile?: string; minify?: boolean }): Promise<string>
}
