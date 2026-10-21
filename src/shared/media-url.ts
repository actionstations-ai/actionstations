// Custom protocol for showing project media in the renderer without file:// access.
// Main registers `ttx-media:` and resolves the path with a guard so it cannot escape
// the project folder.
export const MEDIA_PROTOCOL = 'ttx-media'

/** Build a renderer-safe URL for a file inside a project folder (relPath is project-relative). */
export function mediaUrl(projectPath: string, relPath: string): string {
  const p = encodeURIComponent(projectPath)
  const r = relPath.split('/').map(encodeURIComponent).join('/')
  return `${MEDIA_PROTOCOL}://project/${p}/${r}`
}

export function parseMediaUrl(url: string): { projectPath: string; relPath: string } | null {
  const prefix = `${MEDIA_PROTOCOL}://project/`
  if (!url.startsWith(prefix)) return null
  const rest = url.slice(prefix.length).split('?')[0] ?? ''
  const slash = rest.indexOf('/')
  if (slash < 0) return null
  return {
    projectPath: decodeURIComponent(rest.slice(0, slash)),
    relPath: rest
      .slice(slash + 1)
      .split('/')
      .map(decodeURIComponent)
      .join('/'),
  }
}
