// Test-only: a stand-in machine for the setup modules (#334). Files that "exist", services that
// answer on 127.0.0.1, and a fetch that records every URL so tests can prove nothing left the
// machine. Imported only from *.test.ts files.
import type { SetupEnv } from './detect'
import type { RunResult, Runner } from './run'

export interface FakeMachine {
  env: SetupEnv
  /** Every URL fetched, in order. */
  fetched: string[]
}

/** `answering`: URL prefix → JSON body. Anything else fails like a closed port. */
export function fakeMachine(opts: {
  platform?: NodeJS.Platform
  arch?: string
  home?: string
  files?: string[]
  answering?: Record<string, unknown>
}): FakeMachine {
  const fetched: string[] = []
  const files = new Set(opts.files ?? [])
  const answering = opts.answering ?? {}
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    fetched.push(url)
    const hit = Object.keys(answering)
      .sort((a, b) => b.length - a.length)
      .find((p) => url.startsWith(p))
    if (hit === undefined) throw new TypeError('fetch failed: connection refused')
    return new Response(JSON.stringify(answering[hit]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return {
    fetched,
    env: {
      platform: opts.platform ?? 'darwin',
      arch: opts.arch ?? 'arm64',
      home: opts.home ?? '/Users/test',
      exists: (p) => files.has(p),
      fetchImpl,
    },
  }
}

/** A Runner that answers from a script: (cmd, args) → result. Records every call. */
export function scriptedRunner(
  script: (cmd: string, args: string[]) => Partial<RunResult> | Promise<Partial<RunResult>>,
): Runner & { calls: { cmd: string; args: string[]; env?: Record<string, string> }[] } {
  const calls: { cmd: string; args: string[]; env?: Record<string, string> }[] = []
  const run = (async (cmd: string, args: string[], opts?: { env?: Record<string, string> }) => {
    calls.push({ cmd, args, ...(opts?.env ? { env: opts.env } : {}) })
    const r = await script(cmd, args)
    return { code: r.code ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }) as Runner & { calls: typeof calls }
  run.calls = calls
  return run
}

/** `codesign -dv --verbose=2` output recorded from LM Studio 0.4.26 (2026-10-24). */
export const CODESIGN_LMSTUDIO = `Executable=/Applications/LM Studio.app/Contents/MacOS/LM Studio
Identifier=ai.elementlabs.lmstudio
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=1234 flags=0x10000(runtime) hashes=27+7 location=embedded
Signature size=9045
Authority=Developer ID Application: Element Labs Inc (D65G88RHWN)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Timestamp=Oct 20, 2026 at 10:00:00
Info.plist entries=33
TeamIdentifier=D65G88RHWN
Runtime Version=15.0.0
`

/** The same tool's output when ad-hoc signed (no team). */
export const CODESIGN_ADHOC = `Executable=/tmp/x/Fake.app/Contents/MacOS/Fake
Identifier=fake
Signature=adhoc
TeamIdentifier=not set
`
