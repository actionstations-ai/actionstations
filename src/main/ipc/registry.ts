import type { IpcMainInvokeEvent } from 'electron'
import {
  channels,
  type Channel,
  type ChannelRequestParsed,
  type ChannelResponse,
  type IpcResult,
} from '@shared/ipc'
import { AppError, toAppError } from '../lib/errors'

export interface HandlerContext {
  event?: IpcMainInvokeEvent
}

export type Handler<C extends Channel> = (
  req: ChannelRequestParsed<C>,
  ctx: HandlerContext,
) => Promise<ChannelResponse<C>> | ChannelResponse<C>

export type HandlerMap = { [C in Channel]?: Handler<C> }

/** Typed helper for handler modules in ./handlers/*.ts (each default-exports one). */
export function defineHandlers(map: HandlerMap): HandlerMap {
  return map
}

/** Merge handler modules; a channel may be implemented by exactly one module. */
export function mergeHandlers(modules: Record<string, HandlerMap>): HandlerMap {
  const merged: HandlerMap = {}
  const owner: Record<string, string> = {}
  for (const [file, map] of Object.entries(modules)) {
    for (const name of Object.keys(map) as Channel[]) {
      if (!(name in channels)) throw new Error(`${file}: handler for unknown channel "${name}"`)
      if (owner[name])
        throw new Error(`Channel "${name}" handled by both ${owner[name]} and ${file}`)
      owner[name] = file
      ;(merged as Record<string, unknown>)[name] = map[name]
    }
  }
  return merged
}

/** Validate, dispatch, and wrap one invoke call. Exported for tests. */
export async function dispatch(
  handlers: HandlerMap,
  name: string,
  raw: unknown,
  ctx: HandlerContext = {},
): Promise<IpcResult<unknown>> {
  try {
    if (!(name in channels)) throw new AppError('NOT_FOUND', `Unknown channel ${name}`)
    const def = channels[name as Channel]
    const handler = handlers[name as Channel] as Handler<Channel> | undefined
    if (!handler) throw new AppError('NOT_IMPLEMENTED', `${name} is not implemented yet`)
    const parsed = def.req.safeParse(raw)
    if (!parsed.success)
      throw new AppError('VALIDATION', `Invalid request for ${name}`, parsed.error.issues)
    const data = await handler(parsed.data as never, ctx)
    if (process.env.NODE_ENV !== 'production') {
      const check = def.res.safeParse(data)
      if (!check.success) {
        throw new AppError(
          'INTERNAL',
          `Handler for ${name} returned invalid data`,
          check.error.issues,
        )
      }
    }
    return { ok: true, data }
  } catch (err) {
    const e = toAppError(err)
    if (e.code === 'INTERNAL') console.error(`[ipc] ${name} failed:`, err)
    return { ok: false, error: { code: e.code, message: e.message, details: e.details } }
  }
}
