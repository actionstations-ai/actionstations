import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { MEDIA_PROTOCOL, parseMediaUrl } from '@shared/media-url'
import { safeJoinReal } from './fs'
import { isKnownProject } from './project-registry'

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ])
}

/**
 * Serve files from inside known project folders only. The path guard follows symlinks so a
 * shared .asproj can't point outside itself; Range headers pass through for video seeking.
 */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    try {
      const parsed = parseMediaUrl(request.url)
      if (!parsed) return new Response('Bad media URL', { status: 400 })
      if (!(await isKnownProject(parsed.projectPath)))
        return new Response('Unknown project', { status: 403 })
      const abs = safeJoinReal(parsed.projectPath, parsed.relPath)
      return net.fetch(pathToFileURL(abs).toString(), { headers: request.headers })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      return new Response(code === 'ENOENT' ? 'Not found' : 'Forbidden', {
        status: code === 'ENOENT' ? 404 : 403,
      })
    }
  })
}
