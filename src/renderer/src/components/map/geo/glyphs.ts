// Place-name fonts for offline maps (#500, spec 0436 FR-17). Noto Sans Regular, Latin ranges
// 0-511 (SIL Open Font License, see glyphs/OFL.txt), ship inside the app as MapLibre glyph files,
// so labels draw with no network. A range that is not bundled loads as an empty font stack: the
// characters in it are left out rather than failing the map.
const FILES = import.meta.glob('./glyphs/*/*.pbf', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** The font name the offline styles use in `text-font`. */
export const GLYPH_FONT = 'Noto Sans Regular'

/** Where the bundled file for a font stack and range is served from, if there is one. */
export function glyphUrl(stack: string, range: string): string | undefined {
  const names = stack.split(',').map((n) => n.trim())
  for (const name of names) {
    const hit = FILES[`./glyphs/${name}/${range}.pbf`]
    if (hit) return hit
  }
  return undefined
}

/** One glyph range as bytes; empty (no glyphs) when it is not bundled. */
export async function loadGlyphs(
  stack: string,
  range: string,
  fetcher: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const url = glyphUrl(stack, range.replace(/\.pbf$/, ''))
  if (!url) return new ArrayBuffer(0)
  const res = await fetcher(url)
  if (!res.ok) return new ArrayBuffer(0)
  return res.arrayBuffer()
}
