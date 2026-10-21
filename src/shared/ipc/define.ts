import type { z } from 'zod'

export interface ChannelDef<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> {
  req: Req
  res: Res
}

/** Declare an invoke channel: request schema (validated in main) and response schema. */
export function channel<Req extends z.ZodType, Res extends z.ZodType>(
  req: Req,
  res: Res,
): ChannelDef<Req, Res> {
  return { req, res }
}

/** Wire format for every invoke response; the renderer unwraps it and throws IpcError on failure. */
export type IpcResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } }
