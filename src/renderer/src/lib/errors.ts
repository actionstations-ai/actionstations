// AppError codes (+ provider / job context in the message) → a sentence a user can act on.
// Every toast and inline error in the renderer goes through describeError, so raw stacks,
// zod issue dumps and Node error codes never reach the screen (#49).

export interface ErrorAction {
  label: string
  /** In-app hash route, e.g. "/providers". */
  to: string
}

export interface UserError {
  /** One or two sentences: what happened and what to do next. */
  message: string
  action?: ErrorAction
  /** The provider task that failed, when main labelled the error with it (generate/task-errors). */
  task?: TaskLabel
  /** For task errors: what failed, e.g. 'Drafting (text model) via "LM Studio"'. */
  source?: string
  /** For task errors: the message without the source, for UIs that show the source apart. */
  detail?: string
}

export type TaskLabel =
  'Ideation' | 'Drafting' | 'Critique' | 'Embeddings' | 'Image' | 'Video' | 'Audio'

/** "<Task> (<provider>): <message>" from main's generation jobs. */
const TASK_PREFIX =
  /^(Ideation|Drafting|Critique|Embeddings|Image|Video|Audio)(?: \(([^)]*)\))?: ([\s\S]*)$/

const TASK_PHRASE: Record<TaskLabel, string> = {
  Ideation: 'Ideation (text model)',
  Drafting: 'Drafting (text model)',
  Critique: 'Critique (text model)',
  Embeddings: 'Document search (Embeddings)',
  Image: 'Image generation',
  Video: 'Video generation',
  Audio: 'Audio generation',
}

const PROVIDERS: ErrorAction = { label: 'Open Providers', to: '/providers' }
const SETTINGS: ErrorAction = { label: 'Open Settings', to: '/settings' }
const PROJECTS: ErrorAction = { label: 'Open Projects', to: '/projects' }

const MAX_LENGTH = 300

/** Well-known local servers by port, so "OpenAI-compatible server" reads as what the user runs. */
const LOCAL_SERVERS: Record<string, string> = {
  '1234': 'LM Studio',
  '11434': 'Ollama',
  '8188': 'ComfyUI',
  '8765': 'The voice server',
}

interface Parsed {
  code: string | undefined
  message: string
}

function parse(err: unknown): Parsed {
  if (typeof err === 'string') return { code: undefined, message: err }
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown }
    const code = typeof e.code === 'string' ? e.code : undefined
    if (typeof e.message === 'string') return { code, message: e.message }
  }
  return { code: undefined, message: err == null ? '' : String(err) }
}

/** First line, no stack frames, no "Error:" prefixes, bounded length. */
export function cleanMessage(raw: string): string {
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim() && !/^\s*at\s/.test(l)) ?? ''
  const text = firstLine
    .replace(/^(?:\w*Error|AppError|IpcError):\s*/, '')
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .trim()
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text
}

function serverName(vendor: string, url: string): string {
  const port = /:(\d+)(?:\/|$)/.exec(url)?.[1]
  return (port && LOCAL_SERVERS[port]) || vendor
}

type Rule = (p: Parsed) => UserError | undefined

const providerRules: Rule[] = [
  ({ message }) => {
    const m = /^(.+?) unreachable at (\S+): (.*)$/.exec(message)
    if (!m) return undefined
    const name = serverName(m[1]!, m[2]!)
    return {
      message: `${name} isn't responding at ${m[2]}. Start its server, or check the address in Providers.`,
      action: PROVIDERS,
    }
  },
  ({ message }) => {
    const m = /^(.+?) timed out after (\d+) s/.exec(message)
    if (!m) return undefined
    return {
      message: `${m[1]} took longer than ${m[2]} s to answer. Check that the model is loaded, or raise the timeout in Providers.`,
      action: PROVIDERS,
    }
  },
  ({ message }) => {
    const m = /^(.+?) HTTP (\d{3})(?: \(check the API key\))?: ?(.*)$/.exec(message)
    if (!m) return undefined
    const [, vendor, status, detail] = m as unknown as [string, string, string, string]
    const said = detail && detail !== 'no details' ? ` It said: "${cleanMessage(detail)}".` : ''
    if (status === '401' || status === '403')
      return {
        message: `${vendor} rejected the API key. Update the key in Providers.`,
        action: PROVIDERS,
      }
    if (status === '404')
      return {
        message: `${vendor} doesn't know the requested model or endpoint.${said} Pick an installed model in Providers.`,
        action: PROVIDERS,
      }
    if (status === '429')
      return {
        message: `${vendor} is rate limiting requests. Wait a minute, then try again.${said}`,
      }
    if (status.startsWith('5'))
      return {
        message: `${vendor} had an internal error (HTTP ${status}).${said} Check the server's log, then try again.`,
      }
    return { message: `${vendor} refused the request (HTTP ${status}).${said}`, action: PROVIDERS }
  },
  ({ message }) =>
    /stream stalled|malformed stream|returned invalid JSON|returned no|returned empty/i.test(
      message,
    )
      ? {
          message: `${cleanMessage(message)}. Try again, or choose another model in Providers.`,
          action: PROVIDERS,
        }
      : undefined,
]

const routingRules: Rule[] = [
  ({ message }) =>
    /Providers? → Routing|No provider is assigned|needs an API key|is disabled|no longer exists|No model is chosen|cannot generate/i.test(
      message,
    )
      ? { message: cleanMessage(message), action: PROVIDERS }
      : undefined,
  ({ message }) =>
    /embedding|Settings → Embeddings/i.test(message) && /mode|provider|model/i.test(message)
      ? { message: cleanMessage(message), action: /Routing/.test(message) ? PROVIDERS : SETTINGS }
      : undefined,
]

const fileRules: Rule[] = [
  ({ message }) => {
    const m = /\b(ENOENT|EACCES|EPERM|ENOSPC|EROFS|EBUSY)\b[^']*'?([^']*)'?/.exec(message)
    if (!m) return undefined
    const path = m[2] ? ` (${m[2]})` : ''
    const text: Record<string, string> = {
      ENOENT: `A file or folder is missing${path}. It may have been moved or deleted.`,
      EACCES: `The app isn't allowed to read or write${path}. Check the folder's permissions.`,
      EPERM: `The app isn't allowed to read or write${path}. Check the folder's permissions.`,
      ENOSPC: 'The disk is full. Free some space, then try again.',
      EROFS: `That location is read-only${path}. Choose another folder.`,
      EBUSY: `Another program is using${path || ' that file'}. Close it, then try again.`,
    }
    return { message: text[m[1]!]! }
  },
  ({ message }) =>
    /^Project not opened|^Not a project folder/.test(message)
      ? {
          message: `${cleanMessage(message)}. Open the project from the Projects screen.`,
          action: PROJECTS,
        }
      : undefined,
]

function byCode({ code, message }: Parsed): UserError | undefined {
  const text = cleanMessage(message)
  switch (code) {
    case 'CANCELLED':
      return { message: 'Cancelled.' }
    case 'CONFLICT':
      return /Generation is running/i.test(text)
        ? {
            message:
              'Generation is running for this scenario. Your edits are kept; save again when it finishes.',
          }
        : { message: text || 'Something changed at the same time. Reload and try again.' }
    case 'NOT_IMPLEMENTED':
      return { message: 'This isn’t available in this version of the app yet.' }
    case 'PATH_ESCAPE':
      return { message: 'That file is outside the project folder, so the app won’t open it.' }
    case 'FORBIDDEN':
      return {
        message: `${text || 'Not allowed'}. Open the project from the Projects screen.`,
        action: PROJECTS,
      }
    case 'VALIDATION':
      if (/^Invalid request for /.test(text))
        return {
          message:
            'The app sent a request it couldn’t check. Try again; if it keeps happening, restart the app.',
        }
      return undefined
    case 'INTERNAL':
      if (
        /returned invalid data|is not a function|Cannot read propert|undefined|\bnull\b/i.test(text)
      )
        return {
          message:
            'Something went wrong inside the app. Try again; if it keeps happening, restart the app.',
        }
      return undefined
    default:
      return undefined
  }
}

/** Looks like a zod issue list or other machine output rather than a sentence. */
const MACHINE_TEXT = /^\s*[[{]|"code"\s*:|"path"\s*:|\bZodError\b/

/** A user-facing message (and, when useful, a screen to go to) for any thrown value. */
export function describeError(err: unknown): UserError {
  const parsed = parse(err)
  const tagged = TASK_PREFIX.exec(parsed.message)
  if (tagged) {
    const task = tagged[1] as TaskLabel
    const who = tagged[2] && tagged[2] !== 'document search' ? ` via "${tagged[2]}"` : ''
    const inner = describeUntagged({ code: parsed.code, message: tagged[3]! })
    const source = `${TASK_PHRASE[task]}${who}`
    return {
      ...inner,
      task,
      source,
      detail: inner.message,
      message: `${source} failed. ${inner.message}`,
    }
  }
  return describeUntagged(parsed)
}

function describeUntagged(parsed: Parsed): UserError {
  for (const rule of [...providerRules, ...routingRules, ...fileRules]) {
    const hit = rule(parsed)
    if (hit) return hit
  }
  const coded = byCode(parsed)
  if (coded) return coded
  const text = cleanMessage(parsed.message)
  if (!text || MACHINE_TEXT.test(text))
    return { message: 'Something went wrong. Try again; if it keeps happening, restart the app.' }
  return { message: /[.!?…]$/.test(text) ? text : `${text}.` }
}

/** The message as one line of text (for places that cannot show a link). */
export function errorText(err: unknown): string {
  return describeError(err).message
}

export function isConflictError(err: unknown): boolean {
  return parse(err).code === 'CONFLICT'
}
