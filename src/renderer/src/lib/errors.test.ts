import { describe, expect, it } from 'vitest'
import { cleanMessage, describeError, errorText, isConflictError } from './errors'

const ipc = (code: string, message: string) => ({ code, message })

describe('describeError: providers', () => {
  it('names LM Studio by its port and says what to do when it is not running', () => {
    const e = describeError(
      ipc(
        'PROVIDER',
        'OpenAI-compatible server unreachable at http://127.0.0.1:1234: ECONNREFUSED',
      ),
    )
    expect(e.message).toBe(
      "LM Studio isn't responding at http://127.0.0.1:1234. Start its server, or check the address in Providers.",
    )
    expect(e.action).toEqual({ label: 'Open Providers', to: '/providers' })
  })

  it('names Ollama and ComfyUI by port; unknown hosts keep the vendor name', () => {
    expect(errorText('Ollama unreachable at http://localhost:11434: ECONNREFUSED')).toMatch(
      /^Ollama isn't responding/,
    )
    expect(errorText('ComfyUI unreachable at http://127.0.0.1:8188: fetch failed')).toMatch(
      /^ComfyUI isn't responding/,
    )
    expect(errorText('OpenAI-compatible server unreachable at https://gpu.lan: ENOTFOUND')).toMatch(
      /^OpenAI-compatible server isn't responding at https:\/\/gpu.lan/,
    )
  })

  it('explains timeouts, bad keys, missing models, rate limits and server errors', () => {
    expect(errorText(ipc('PROVIDER', 'Ollama timed out after 120 s'))).toMatch(
      /took longer than 120 s.*model is loaded/,
    )
    expect(
      errorText(ipc('PROVIDER', 'Anthropic HTTP 401 (check the API key): invalid x-api-key')),
    ).toBe('Anthropic rejected the API key. Update the key in Providers.')
    expect(
      errorText(ipc('PROVIDER', 'OpenAI-compatible server HTTP 404: model "foo" not found')),
    ).toMatch(/doesn't know the requested model.*"model "foo" not found".*Providers/)
    expect(errorText(ipc('PROVIDER', 'Anthropic HTTP 429: rate_limit_error'))).toMatch(
      /rate limiting/,
    )
    expect(errorText(ipc('PROVIDER', 'Ollama HTTP 500: no details'))).toBe(
      "Ollama had an internal error (HTTP 500). Check the server's log, then try again.",
    )
  })

  it('keeps routing messages (already actionable) and links to Providers', () => {
    const e = describeError(
      ipc('VALIDATION', "No provider is assigned to 'draft'. Assign one in Providers → Routing."),
    )
    expect(e.message).toBe("No provider is assigned to 'draft'. Assign one in Providers → Routing.")
    expect(e.action?.to).toBe('/providers')
  })
})

describe('describeError: app and file errors', () => {
  it('never shows zod issue dumps or request validation internals', () => {
    expect(errorText(ipc('VALIDATION', 'Invalid request for scenarios:save'))).toMatch(
      /couldn.t check/,
    )
    expect(errorText(ipc('INTERNAL', '[{"code":"invalid_type","path":["x"]}]'))).toMatch(
      /^Something went wrong/,
    )
    expect(errorText(ipc('INTERNAL', 'Handler for x:y returned invalid data'))).toMatch(
      /inside the app/,
    )
  })

  it('strips stack frames and Error prefixes', () => {
    const raw = 'TypeError: boom happened\n    at foo (file.js:1:2)\n    at bar'
    expect(cleanMessage(raw)).toBe('boom happened')
    expect(errorText(new Error(raw))).toBe('boom happened.')
  })

  it('translates Node file errors', () => {
    expect(errorText("ENOENT: no such file or directory, open '/x/y.pdf'")).toBe(
      'A file or folder is missing (/x/y.pdf). It may have been moved or deleted.',
    )
    expect(errorText('EACCES: permission denied')).toMatch(/permissions/)
    expect(errorText('ENOSPC: no space left on device')).toMatch(/disk is full/)
  })

  it('handles cancel, conflict, not implemented and project access', () => {
    expect(errorText(ipc('CANCELLED', 'Cancelled'))).toBe('Cancelled.')
    expect(errorText(ipc('CONFLICT', 'Generation is running for this scenario; wait'))).toMatch(
      /Your edits are kept/,
    )
    expect(isConflictError(ipc('CONFLICT', 'x'))).toBe(true)
    expect(isConflictError(new Error('x'))).toBe(false)
    expect(errorText(ipc('NOT_IMPLEMENTED', 'x:y is not implemented yet'))).toMatch(
      /isn.t available/,
    )
    expect(describeError(ipc('FORBIDDEN', 'Project not opened: /a/b')).action?.to).toBe('/projects')
  })

  it('passes human messages through and ends them with a full stop', () => {
    expect(errorText(ipc('NOT_FOUND', 'No scenario abc in this project'))).toBe(
      'No scenario abc in this project.',
    )
    expect(errorText(undefined)).toMatch(/^Something went wrong/)
    expect(errorText('x'.repeat(500)).length).toBeLessThanOrEqual(301)
  })
})

describe('describeError: task-labelled generation errors', () => {
  it('says document search (Embeddings) failed, not the text model', () => {
    const e = describeError(
      ipc(
        'PROVIDER',
        'Embeddings (document search): OpenAI-compatible server unreachable at http://127.0.0.1:1234: ECONNREFUSED',
      ),
    )
    expect(e.task).toBe('Embeddings')
    expect(e.message).toBe(
      "Document search (Embeddings) failed. LM Studio isn't responding at http://127.0.0.1:1234. Start its server, or check the address in Providers.",
    )
    expect(e.action?.to).toBe('/providers')
  })

  it('names the text task and the provider id', () => {
    const e = describeError('Drafting (lmstudio): Ollama timed out after 30 s')
    expect(e.task).toBe('Drafting')
    expect(e.message).toMatch(/^Drafting \(text model\) via "lmstudio" failed\. Ollama took longer/)
    expect(describeError("Ideation: No provider is assigned to 'ideate'.").message).toBe(
      "Ideation (text model) failed. No provider is assigned to 'ideate'.",
    )
  })
})
