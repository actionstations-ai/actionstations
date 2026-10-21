// Typed client over the preload bridge. The only way the renderer talks to main.
import type {
  Channel,
  ChannelRequest,
  ChannelResponse,
  EventName,
  EventPayload,
  IpcResult,
} from '@shared/ipc'

export class IpcError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'IpcError'
  }
}

type Args<C extends Channel> =
  undefined extends ChannelRequest<C> ? [req?: ChannelRequest<C>] : [req: ChannelRequest<C>]

export async function call<C extends Channel>(
  channel: C,
  ...args: Args<C>
): Promise<ChannelResponse<C>> {
  const result = (await window.ttx.invoke(channel, args[0])) as IpcResult<ChannelResponse<C>>
  if (!result.ok) throw new IpcError(result.error.code, result.error.message, result.error.details)
  return result.data
}

export function subscribe<E extends EventName>(
  event: E,
  listener: (payload: EventPayload<E>) => void,
): () => void {
  return window.ttx.on(event, (p) => listener(p as EventPayload<E>))
}

export const pathForFile = (file: File): string => window.ttx.pathForFile(file)
