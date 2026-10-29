import { afterEach, describe, expect, it, vi } from 'vitest'

const showMessageBox = vi.fn()
vi.mock('electron', () => ({ app: { quit: vi.fn() }, dialog: { showMessageBox } }))

const guard = await import('./quit-guard')

type Sent = { channel: string; payload: { requestId: string } }

function fakeWindow(reply?: (requestId: string) => void) {
  const sent: Sent[] = []
  const win = {
    isDestroyed: () => false,
    webContents: {
      isCrashed: () => false,
      send: (channel: string, payload: { requestId: string }) => {
        sent.push({ channel, payload })
        reply?.(payload.requestId)
      },
    },
  }
  return { win, sent }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => {
  guard.resetRendererReady()
  delete process.env.TTX_QUIT_PROMPT
  showMessageBox.mockReset()
})

describe('askRendererForUnsaved', () => {
  it('asks nothing until the renderer says its guard listens', async () => {
    const { win, sent } = fakeWindow()
    expect(await guard.askRendererForUnsaved(win, 50)).toEqual([])
    expect(sent).toHaveLength(0)
  })

  it('returns what the renderer reports for this request', async () => {
    guard.onUnsavedReport(undefined, [])
    const { win, sent } = fakeWindow((id) => guard.onUnsavedReport(id, ['MSEL', 'Rubric']))
    expect(await guard.askRendererForUnsaved(win, 1000)).toEqual(['MSEL', 'Rubric'])
    expect(sent[0]!.channel).toBe(guard.QUIT_CHECK_EVENT)
  })

  it('gives up after the timeout so a hung renderer never blocks quitting', async () => {
    guard.onUnsavedReport(undefined, [])
    const { win } = fakeWindow()
    const started = Date.now()
    expect(await guard.askRendererForUnsaved(win, 30)).toEqual([])
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('skips a crashed renderer', async () => {
    guard.onUnsavedReport(undefined, [])
    const { win, sent } = fakeWindow()
    win.webContents.isCrashed = () => true
    expect(await guard.askRendererForUnsaved(win, 1000)).toEqual([])
    expect(sent).toHaveLength(0)
  })
})

describe('confirmDiscard', () => {
  it('shows "Quit and discard / Cancel" and maps the answer', async () => {
    process.env.TTX_QUIT_PROMPT = 'dialog'
    showMessageBox.mockResolvedValueOnce({ response: 1 }).mockResolvedValueOnce({ response: 0 })
    expect(await guard.confirmDiscard(undefined, ['1 inject draft'])).toBe(false)
    expect(await guard.confirmDiscard(undefined, ['1 inject draft'])).toBe(true)
    const opts = showMessageBox.mock.calls[0]![0] as { buttons: string[]; detail: string }
    expect(opts.buttons).toEqual(['Quit and discard', 'Cancel'])
    expect(opts.detail).toContain('1 inject draft')
  })

  it('honors TTX_QUIT_PROMPT without a dialog', async () => {
    process.env.TTX_QUIT_PROMPT = 'cancel'
    expect(await guard.confirmDiscard(undefined, ['x'])).toBe(false)
    process.env.TTX_QUIT_PROMPT = 'discard'
    expect(await guard.confirmDiscard(undefined, ['x'])).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })
})

describe('createQuitGuard', () => {
  const event = () => ({ preventDefault: vi.fn() })

  function setup(items: string[], answer: boolean | Error = true) {
    const deps = {
      ask: vi.fn(async () => items),
      confirm: vi.fn(async () => {
        if (answer instanceof Error) throw answer
        return answer
      }),
      flush: vi.fn(async () => undefined),
      quit: vi.fn(),
    }
    return { deps, q: guard.createQuitGuard(() => undefined, deps) }
  }

  it('quits at once (after the check) when nothing is unsaved, without asking the user', async () => {
    const { deps, q } = setup([])
    const e = event()
    expect(q.intercept(e)).toBe(false)
    expect(e.preventDefault).toHaveBeenCalled()
    await flush()
    expect(deps.confirm).not.toHaveBeenCalled()
    expect(deps.quit).toHaveBeenCalledTimes(1)
    // The quit it started goes through.
    expect(q.intercept(event())).toBe(true)
  })

  it('stays open when the user cancels, and asks again next time', async () => {
    const { deps, q } = setup(['MSEL'], false)
    q.intercept(event())
    await flush()
    expect(deps.confirm).toHaveBeenCalledWith(undefined, ['MSEL'])
    expect(deps.quit).not.toHaveBeenCalled()
    expect(q.intercept(event())).toBe(false)
    await flush()
    expect(deps.confirm).toHaveBeenCalledTimes(2)
  })

  it('quits when the user chooses to discard', async () => {
    const { deps, q } = setup(['MSEL'], true)
    q.intercept(event())
    await flush()
    expect(deps.quit).toHaveBeenCalledTimes(1)
  })

  it('a failing check never blocks quitting', async () => {
    const { deps, q } = setup(['MSEL'], new Error('dialog broke'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    q.intercept(event())
    await flush()
    expect(deps.quit).toHaveBeenCalledTimes(1)
  })

  it('runs one check at a time (close and before-quit together)', async () => {
    const { deps, q } = setup([])
    q.intercept(event())
    q.intercept(event())
    await flush()
    expect(deps.ask).toHaveBeenCalledTimes(1)
  })

  it('finishes pending writes before quitting (#433)', async () => {
    const order: string[] = []
    const { deps, q } = setup([])
    deps.flush.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5))
      order.push('flushed')
    })
    deps.quit.mockImplementation(() => order.push('quit'))
    q.intercept(event())
    await new Promise((r) => setTimeout(r, 20))
    expect(order).toEqual(['flushed', 'quit'])
  })
})

describe('runQuitFlushes', () => {
  it('waits for registered flushes, and gives up after the timeout', async () => {
    const { registerQuitFlush, runQuitFlushes } = await import('./quit-flush')
    let done = false
    const off = registerQuitFlush(async () => {
      await new Promise((r) => setTimeout(r, 5))
      done = true
    })
    await runQuitFlushes()
    expect(done).toBe(true)
    off()
    const stuck = registerQuitFlush(() => new Promise<void>(() => undefined))
    const started = Date.now()
    await runQuitFlushes(30)
    expect(Date.now() - started).toBeLessThan(1000)
    stuck()
  })
})
