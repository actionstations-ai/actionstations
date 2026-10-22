import { describe, expect, it } from 'vitest'
import { AppError } from '../lib/errors'
import { StageFailure } from './stage'
import { asTask, taskError } from './task-errors'

describe('taskError', () => {
  it('labels a provider failure with the task and provider, keeping the code', () => {
    const e = taskError(
      'embed',
      new AppError(
        'PROVIDER',
        'OpenAI-compatible server unreachable at http://127.0.0.1:1234: ECONNREFUSED',
      ),
    ) as AppError
    expect(e).toBeInstanceOf(AppError)
    expect(e.code).toBe('PROVIDER')
    expect(e.message).toBe(
      'Embeddings (document search): OpenAI-compatible server unreachable at http://127.0.0.1:1234: ECONNREFUSED',
    )
    expect(e.details).toMatchObject({ task: 'embed' })
  })

  it('names the provider id when given, and the task otherwise', () => {
    const named = taskError(
      'draft',
      new AppError('PROVIDER', 'Ollama timed out after 120 s'),
      'ollama',
    )
    expect((named as AppError).message).toBe('Drafting (ollama): Ollama timed out after 120 s')
    const unnamed = taskError(
      'draft',
      new AppError('VALIDATION', "No provider is assigned to 'draft'."),
    )
    expect((unnamed as AppError).message).toBe("Drafting: No provider is assigned to 'draft'.")
    expect((unnamed as AppError).code).toBe('VALIDATION')
  })

  it('does not relabel, and leaves cancellations and stage failures alone', () => {
    const once = taskError('embed', new AppError('PROVIDER', 'x'))
    expect((taskError('draft', once) as AppError).message).toBe('Embeddings (document search): x')
    const cancelled = new AppError('CANCELLED', 'Cancelled')
    expect((taskError('draft', cancelled) as AppError).message).toBe('Cancelled')
    const failure = new StageFailure({
      stage: 'draft_msel',
      startedAt: new Date().toISOString(),
      providerRef: { providerId: 'p', model: 'm' },
      model: 'm',
      promptRef: 'x@builtin',
      promptHash: 'h',
      status: 'error',
      repairAttempts: 1,
      error: 'bad output',
    } as never)
    expect(taskError('draft', failure)).toBe(failure)
  })

  it('wraps plain errors as INTERNAL with the label', () => {
    const e = taskError('embed', new Error('boom')) as AppError
    expect(e.code).toBe('INTERNAL')
    expect(e.message).toBe('Embeddings (document search): boom')
  })
})

describe('asTask', () => {
  it('returns the value, or throws the labelled error', async () => {
    await expect(asTask('critique', async () => 3)).resolves.toBe(3)
    await expect(
      asTask(
        'critique',
        async () => {
          throw new AppError('PROVIDER', 'Anthropic HTTP 500: no details')
        },
        'claude',
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER',
      message: 'Critique (claude): Anthropic HTTP 500: no details',
    })
  })
})
