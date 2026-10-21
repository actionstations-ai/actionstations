// Accumulates an Anthropic Messages API SSE stream (message_start, content_block_*,
// message_delta, message_stop, ping, error) into text, tool input and usage.
import { AppError } from '../../../lib/errors'
import type { Usage } from '../../types'

interface Block {
  type: string
  name?: string
  text: string
}

export interface AnthropicStreamResult {
  model?: string
  text: string
  toolInputs: { name: string; json: string }[]
  stopReason?: string
  stopDetails?: { category?: string | null; explanation?: string | null }
  usage: Usage
}

interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export class AnthropicStreamAccumulator {
  private blocks = new Map<number, Block>()
  private model?: string
  private stopReason?: string
  private stopDetails?: AnthropicStreamResult['stopDetails']
  private usage: Usage = { inputTokens: 0, outputTokens: 0 }

  constructor(private readonly onToken?: (t: string) => void) {}

  /** Feed one SSE event's JSON payload. */
  push(data: Record<string, unknown>): void {
    switch (data.type) {
      case 'message_start':
        return this.onMessageStart(data.message as Record<string, unknown> | undefined)
      case 'content_block_start':
        return this.onBlockStart(
          data.index as number,
          data.content_block as Record<string, unknown>,
        )
      case 'content_block_delta':
        return this.onDelta(data.index as number, data.delta as Record<string, unknown>)
      case 'message_delta':
        return this.onMessageDelta(data)
      case 'error':
        throw streamError(data.error as { type?: string; message?: string } | undefined)
      default:
        return // ping, content_block_stop, message_stop, future event types
    }
  }

  result(): AnthropicStreamResult {
    const ordered = [...this.blocks.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])
    return {
      model: this.model,
      text: ordered
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join(''),
      toolInputs: ordered
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ name: b.name ?? '', json: b.text })),
      stopReason: this.stopReason,
      stopDetails: this.stopDetails,
      usage: this.usage,
    }
  }

  private onMessageStart(msg: Record<string, unknown> | undefined): void {
    if (typeof msg?.model === 'string') this.model = msg.model
    this.applyUsage(msg?.usage as RawUsage | undefined)
  }

  private onBlockStart(index: number, block: Record<string, unknown>): void {
    const type = String(block?.type ?? 'unknown')
    const name = typeof block?.name === 'string' ? block.name : undefined
    const initial = type === 'text' && typeof block.text === 'string' ? block.text : ''
    this.blocks.set(index, { type, name, text: initial })
  }

  private onDelta(index: number, delta: Record<string, unknown>): void {
    const block = this.blocks.get(index) ?? { type: 'text', text: '' }
    this.blocks.set(index, block)
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
      block.text += delta.text
      this.onToken?.(delta.text)
    } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
      block.text += delta.partial_json
      if (delta.partial_json) this.onToken?.(delta.partial_json)
    }
    // thinking_delta / signature_delta are not surfaced.
  }

  private onMessageDelta(data: Record<string, unknown>): void {
    const delta = data.delta as Record<string, unknown> | undefined
    if (typeof delta?.stop_reason === 'string') this.stopReason = delta.stop_reason
    if (delta?.stop_details && typeof delta.stop_details === 'object')
      this.stopDetails = delta.stop_details as AnthropicStreamResult['stopDetails']
    this.applyUsage(data.usage as RawUsage | undefined)
  }

  private applyUsage(u: RawUsage | undefined): void {
    if (!u) return
    if (typeof u.input_tokens === 'number') this.usage.inputTokens = u.input_tokens
    if (typeof u.output_tokens === 'number') this.usage.outputTokens = u.output_tokens
    if (typeof u.cache_creation_input_tokens === 'number')
      this.usage.cacheWriteTokens = u.cache_creation_input_tokens
    if (typeof u.cache_read_input_tokens === 'number')
      this.usage.cacheReadTokens = u.cache_read_input_tokens
  }
}

function streamError(err: { type?: string; message?: string } | undefined): AppError {
  const kind = err?.type ?? 'error'
  return new AppError('PROVIDER', `Anthropic stream error (${kind}): ${err?.message ?? 'unknown'}`)
}
