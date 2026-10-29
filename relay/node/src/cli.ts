/**
 * `actionstations-relay`: serve (default), status, rotate-key, print-config, service
 * install|uninstall. Plain text output, no colour (spec 0409 NFR-3). `main` takes its
 * arguments and streams so tests run it in-process.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { adminSocketPath, queryAdmin } from './admin'
import {
  ConfigError,
  defaultDataDir,
  describeConfig,
  layerFromEnv,
  layerFromFlags,
  layerFromToml,
  mergeLayers,
  resolveConfig,
  type Config,
} from './config'
import { startRelay } from './serve'
import { rotateServerKey } from './server-key'
import { exampleConfig, runCommands, systemdCommands, windowsCommands } from './service'
import { PROGRAM, VERSION } from './version'

export interface Io {
  stdout(line: string): void
  stderr(line: string): void
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  /** Resolves when the server should stop (SIGINT/SIGTERM); tests resolve it themselves. */
  waitForStop?: (stop: () => Promise<void>) => Promise<void>
  exec?: (command: string, args: string[]) => void
}

export const USAGE = `${PROGRAM} ${VERSION}: the Action Stations live play server for your own network.

Usage:
  ${PROGRAM} [serve] [--config FILE] [--port 8485] [--bind 0.0.0.0] [--host NAME]...
             [--tls self-signed | --tls cert.pem,key.pem | --insecure-http] [--data-dir DIR]
             [--retention-hours 72] [--max-sessions 20] [--max-clients 60] [--allow CIDR,...]
             [--blobs db|disk] [--log-dir DIR] [--log-level info|warn] [--public-dir DIR]
             [--limit name=value]...
  ${PROGRAM} status [--data-dir DIR]          sessions, clients, storage, uptime of the running server
  ${PROGRAM} rotate-key [--data-dir DIR]      prints a new server key; the old one stops working at once
  ${PROGRAM} print-config [--config FILE]     the effective settings (no key, no hash)
  ${PROGRAM} service install|uninstall [--dry-run]   Windows startup task or systemd unit
  ${PROGRAM} --help | --version

Settings come from the TOML file, then AS_RELAY_* environment variables, then flags.
Retention cannot exceed 72 hours. Without --config, <data-dir>/config.toml is read when it exists.`

const OPTIONS = {
  config: { type: 'string' },
  port: { type: 'string' },
  bind: { type: 'string' },
  host: { type: 'string', multiple: true },
  tls: { type: 'string' },
  'insecure-http': { type: 'boolean' },
  'data-dir': { type: 'string' },
  'retention-hours': { type: 'string' },
  'max-sessions': { type: 'string' },
  'max-clients': { type: 'string' },
  allow: { type: 'string' },
  blobs: { type: 'string' },
  'log-dir': { type: 'string' },
  'log-level': { type: 'string' },
  'public-dir': { type: 'string' },
  limit: { type: 'string', multiple: true },
  'dry-run': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const

/** Settings from file, environment and flags, in that order of precedence. */
export function loadConfig(values: Record<string, unknown>, env: NodeJS.ProcessEnv): Config {
  const flags = layerFromFlags(values)
  if (Array.isArray(values.limit)) {
    flags.limits = Object.fromEntries(
      (values.limit as string[]).map((pair) => {
        const [name, value] = pair.split('=')
        if (!name || value === undefined || !Number.isFinite(Number(value))) {
          throw new ConfigError(`--limit expects name=value, not "${pair}"`)
        }
        return [name, Number(value)]
      }),
    )
  }
  const fromEnv = layerFromEnv(env)
  const dataDir = flags.dataDir ?? fromEnv.dataDir ?? defaultDataDir(env)
  const configPath = (values.config as string | undefined) ?? join(dataDir, 'config.toml')
  let fromFile = {}
  if (values.config || existsSync(configPath)) {
    if (!existsSync(configPath)) throw new ConfigError(`config file not found: ${configPath}`)
    fromFile = layerFromToml(readFileSync(configPath, 'utf8'))
  }
  return resolveConfig(mergeLayers(fromFile, fromEnv, flags), env)
}

export async function main(argv: string[], io: Io): Promise<number> {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })
  } catch (err) {
    io.stderr((err as Error).message)
    io.stderr(`Run "${PROGRAM} --help" for usage.`)
    return 2
  }
  const { values, positionals } = parsed
  if (values.version) {
    io.stdout(`${PROGRAM} ${VERSION}`)
    return 0
  }
  if (values.help) {
    io.stdout(USAGE)
    return 0
  }
  const command = positionals[0] ?? 'serve'
  try {
    switch (command) {
      case 'serve':
        return await serve(values, io)
      case 'status':
        return await status(values, io)
      case 'rotate-key': {
        const dataDir = (values['data-dir'] as string | undefined) ?? defaultDataDir(io.env)
        const key = await rotateServerKey(dataDir)
        io.stdout(`New server key (shown once; the old key no longer works): ${key}`)
        return 0
      }
      case 'print-config':
        io.stdout(JSON.stringify(describeConfig(loadConfig(values, io.env)), null, 2))
        return 0
      case 'service':
        return service(positionals[1], values, io)
      default:
        io.stderr(`Unknown command "${command}". Run "${PROGRAM} --help" for usage.`)
        return 2
    }
  } catch (err) {
    io.stderr(err instanceof ConfigError ? err.message : `Error: ${(err as Error).message}`)
    return 1
  }
}

async function serve(values: Record<string, unknown>, io: Io): Promise<number> {
  const config = loadConfig(values, io.env)
  const running = await startRelay({ config, print: io.stdout })
  const stop = () => running.stop()
  if (io.waitForStop) await io.waitForStop(stop)
  else {
    await new Promise<void>((resolve) => {
      const onSignal = () => {
        io.stdout('Stopping…')
        void stop().then(resolve)
      }
      process.once('SIGINT', onSignal)
      process.once('SIGTERM', onSignal)
    })
  }
  return 0
}

async function status(values: Record<string, unknown>, io: Io): Promise<number> {
  const dataDir = (values['data-dir'] as string | undefined) ?? defaultDataDir(io.env)
  const s = await queryAdmin(adminSocketPath(dataDir, io.platform))
  io.stdout(`${PROGRAM} ${s.version}, up ${s.uptimeSec} s`)
  for (const url of s.urls) io.stdout(`  ${url}`)
  if (s.fingerprintSha256) io.stdout(`  certificate fingerprint: ${s.fingerprintSha256}`)
  io.stdout(
    `Sessions: ${s.sessions.live} live, ${s.sessions.ended} ended (limit ${s.sessions.max})`,
  )
  io.stdout(`Clients connected: ${s.clients}`)
  io.stdout(
    `Storage: database ${s.storage.databaseBytes} bytes, ${s.storage.envelopes} stored messages, ${s.storage.blobBytes} blob bytes`,
  )
  io.stdout(`Data directory: ${s.dataDir}`)
  return 0
}

function service(action: string | undefined, values: Record<string, unknown>, io: Io): number {
  if (action !== 'install' && action !== 'uninstall') {
    io.stderr(`Usage: ${PROGRAM} service install|uninstall [--dry-run]`)
    return 2
  }
  const dataDir = (values['data-dir'] as string | undefined) ?? defaultDataDir(io.env, io.platform)
  const configPath = join(dataDir, 'config.toml')
  const port = Number(values.port ?? 8485)
  if (action === 'install' && !existsSync(configPath) && !values['dry-run']) {
    writeFileSync(configPath, exampleConfig(dataDir, port))
    io.stdout(`Wrote ${configPath}`)
  }
  const commands =
    io.platform === 'win32'
      ? windowsCommands(action, { exe: process.execPath, configPath, dataDir, port })
      : systemdCommands(action, { exe: process.execPath, configPath })
  runCommands(commands, { dryRun: values['dry-run'] === true, print: io.stdout, exec: io.exec })
  return 0
}
