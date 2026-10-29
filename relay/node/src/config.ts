/**
 * Server settings (spec 0409 FR-5): a TOML file, then `AS_RELAY_*` environment variables, then
 * command-line flags, each layer overriding the one before. Validated with zod so a wrong value
 * is a clear message at startup, never a surprise later. Retention above 72 hours is refused:
 * the protocol promises deletion within 72 hours whoever runs the server.
 */
import { homedir, hostname, platform } from 'node:os'
import { join, win32 } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { z } from 'zod'
import { parseCidr } from './allowlist'

const MiB = 1024 * 1024
const GiB = 1024 * MiB

export const DEFAULT_PORT = 8485
export const MAX_RETENTION_HOURS = 72

/** Where the server keeps its database, certificate, key hash and logs when nothing says otherwise. */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env, os = platform()): string {
  if (env.AS_RELAY_DATA_DIR) return env.AS_RELAY_DATA_DIR
  if (os === 'win32') return win32.join(env.ProgramData ?? 'C:\\ProgramData', 'ActionStationsRelay')
  const state = env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state')
  return join(state, 'actionstations-relay')
}

const Cidr = z
  .string()
  .refine((s) => parseCidr(s) !== undefined, 'not an IPv4/IPv6 address or CIDR')

export const TlsSetting = z.union([
  z.strictObject({ mode: z.literal('self-signed') }),
  z.strictObject({ mode: z.literal('pem'), cert: z.string().min(1), key: z.string().min(1) }),
  /** Plain HTTP: only behind a reverse proxy that terminates TLS, or on a trusted network. */
  z.strictObject({ mode: z.literal('none') }),
])
export type TlsSetting = z.infer<typeof TlsSetting>

/** Overrides of `LIMITS['self-hosted']`, each with a hard ceiling (spec 0409 FR-2). */
export const LimitOverrides = z.strictObject({
  envelopeBytes: z
    .number()
    .int()
    .min(64 * 1024)
    .max(4 * MiB)
    .optional(),
  blobBytes: z.number().int().min(MiB).max(GiB).optional(),
  playerBlobBytes: z
    .number()
    .int()
    .min(256 * 1024)
    .max(64 * MiB)
    .optional(),
  blobsTotalBytes: z
    .number()
    .int()
    .min(16 * MiB)
    .max(8 * GiB)
    .optional(),
  storedEnvelopes: z.number().int().min(100).max(200_000).optional(),
})

export const ConfigSchema = z.strictObject({
  /** 0 means any free port (tests, or a proxy that reads the printed port). */
  port: z.number().int().min(0).max(65535).default(DEFAULT_PORT),
  bind: z.string().min(1).default('0.0.0.0'),
  /** Names and addresses for the certificate's SANs and the URLs the server prints. */
  host: z.array(z.string().min(1).max(253)).default([]),
  dataDir: z.string().min(1),
  retentionHours: z.number().min(1).max(MAX_RETENTION_HOURS).default(MAX_RETENTION_HOURS),
  maxSessions: z.number().int().min(1).max(500).default(20),
  maxClients: z.number().int().min(2).max(500).default(60),
  /** CIDR allow-list; empty means any address. */
  allow: z.array(Cidr).default([]),
  blobs: z.enum(['db', 'disk']).default('db'),
  logDir: z.string().min(1).optional(),
  logLevel: z.enum(['info', 'warn']).default('info'),
  tls: TlsSetting,
  limits: LimitOverrides.default({}),
  /** Directory of the player page; the bundled one when absent. */
  publicDir: z.string().min(1).optional(),
})
export type Config = z.infer<typeof ConfigSchema>
export type ConfigInput = z.input<typeof ConfigSchema>

/** What one layer (file, env, flags) may say; everything optional, `tls` as the user wrote it. */
export interface Layer {
  port?: number
  bind?: string
  host?: string[]
  dataDir?: string
  retentionHours?: number
  maxSessions?: number
  maxClients?: number
  allow?: string[]
  blobs?: string
  logDir?: string
  logLevel?: string
  tls?: string
  insecureHttp?: boolean
  limits?: Record<string, number>
  publicDir?: string
}

export class ConfigError extends Error {}

/** `--tls self-signed`, `--tls cert.pem,key.pem`, or `--insecure-http`. */
export function tlsFromText(
  text: string | undefined,
  insecureHttp: boolean | undefined,
): TlsSetting | undefined {
  if (insecureHttp) return { mode: 'none' }
  if (text === undefined) return undefined
  if (text === 'self-signed') return { mode: 'self-signed' }
  const [cert, key, extra] = text.split(',').map((s) => s.trim())
  if (!cert || !key || extra !== undefined) {
    throw new ConfigError(`tls must be "self-signed" or "cert.pem,key.pem", not "${text}"`)
  }
  return { mode: 'pem', cert, key }
}

function list(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value.map(String)
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function num(value: unknown, name: string): number | undefined {
  if (value === undefined || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) throw new ConfigError(`${name} must be a number, not "${String(value)}"`)
  return n
}

const FILE_KEYS: Record<string, keyof Layer> = {
  port: 'port',
  bind: 'bind',
  host: 'host',
  'data-dir': 'dataDir',
  'retention-hours': 'retentionHours',
  'max-sessions': 'maxSessions',
  'max-clients': 'maxClients',
  allow: 'allow',
  blobs: 'blobs',
  'log-dir': 'logDir',
  'log-level': 'logLevel',
  tls: 'tls',
  'insecure-http': 'insecureHttp',
  'public-dir': 'publicDir',
}

/** A TOML file with the same names as the flags (kebab-case) and a `[limits]` table. */
export function layerFromToml(text: string): Layer {
  let doc: Record<string, unknown>
  try {
    doc = parseToml(text) as Record<string, unknown>
  } catch (e) {
    throw new ConfigError(`config file is not valid TOML: ${(e as Error).message}`)
  }
  const layer: Layer = {}
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'limits') {
      if (typeof value !== 'object' || value === null)
        throw new ConfigError('[limits] must be a table')
      layer.limits = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          camel(k.replace(/-/g, '_').toUpperCase()),
          num(v, `limits.${k}`)!,
        ]),
      )
      continue
    }
    const name = FILE_KEYS[key]
    if (!name) throw new ConfigError(`unknown setting "${key}" in the config file`)
    assign(layer, name, value)
  }
  return layer
}

function assign(layer: Layer, name: keyof Layer, value: unknown): void {
  switch (name) {
    case 'port':
    case 'retentionHours':
    case 'maxSessions':
    case 'maxClients':
      layer[name] = num(value, name)
      break
    case 'host':
    case 'allow':
      layer[name] = list(value)
      break
    case 'insecureHttp':
      layer.insecureHttp = value === true || value === '1' || value === 'true'
      break
    case 'limits':
      break
    default:
      layer[name] = value === undefined ? undefined : String(value)
  }
}

const ENV_KEYS: Record<string, keyof Layer> = {
  AS_RELAY_PORT: 'port',
  AS_RELAY_BIND: 'bind',
  AS_RELAY_HOST: 'host',
  AS_RELAY_DATA_DIR: 'dataDir',
  AS_RELAY_RETENTION_HOURS: 'retentionHours',
  AS_RELAY_MAX_SESSIONS: 'maxSessions',
  AS_RELAY_MAX_CLIENTS: 'maxClients',
  AS_RELAY_ALLOW: 'allow',
  AS_RELAY_BLOBS: 'blobs',
  AS_RELAY_LOG_DIR: 'logDir',
  AS_RELAY_LOG_LEVEL: 'logLevel',
  AS_RELAY_TLS: 'tls',
  AS_RELAY_INSECURE_HTTP: 'insecureHttp',
  AS_RELAY_PUBLIC_DIR: 'publicDir',
}

export function layerFromEnv(env: NodeJS.ProcessEnv): Layer {
  const layer: Layer = {}
  for (const [key, name] of Object.entries(ENV_KEYS)) {
    if (env[key] !== undefined && env[key] !== '') assign(layer, name, env[key])
  }
  const limits: Record<string, number> = {}
  for (const [key, value] of Object.entries(env)) {
    const m = /^AS_RELAY_LIMIT_(.+)$/.exec(key)
    if (m && value) limits[camel(m[1]!)] = num(value, key)!
  }
  if (Object.keys(limits).length) layer.limits = limits
  return layer
}

function camel(upperSnake: string): string {
  return upperSnake.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** Flags as `node:util` `parseArgs` returns them (strings and booleans). */
export function layerFromFlags(values: Record<string, unknown>): Layer {
  const layer: Layer = {}
  for (const [key, name] of Object.entries(FILE_KEYS)) {
    if (values[key] !== undefined) assign(layer, name, values[key])
  }
  const limits: Record<string, number> = {}
  for (const [key, value] of Object.entries(values)) {
    const m = /^limit-(.+)$/.exec(key)
    if (m && value !== undefined) limits[camel(m[1]!.replace(/-/g, '_'))] = num(value, key)!
  }
  if (Object.keys(limits).length) layer.limits = limits
  return layer
}

/** Later layers win; lists and the limits table replace, they do not merge. */
export function mergeLayers(...layers: Layer[]): Layer {
  const out: Layer = {}
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) (out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

/** Validates the merged layers into a `Config`; throws `ConfigError` with every problem listed. */
export function resolveConfig(layer: Layer, env: NodeJS.ProcessEnv = process.env): Config {
  const tls = tlsFromText(layer.tls, layer.insecureHttp)
  if (!tls) {
    throw new ConfigError(
      'no TLS setting: use --tls self-signed, --tls cert.pem,key.pem, or --insecure-http behind a proxy that terminates TLS',
    )
  }
  const dataDir = layer.dataDir ?? defaultDataDir(env)
  const input: ConfigInput = {
    dataDir,
    tls,
    ...(layer.port !== undefined ? { port: layer.port } : {}),
    ...(layer.bind !== undefined ? { bind: layer.bind } : {}),
    ...(layer.host !== undefined ? { host: layer.host } : {}),
    ...(layer.retentionHours !== undefined ? { retentionHours: layer.retentionHours } : {}),
    ...(layer.maxSessions !== undefined ? { maxSessions: layer.maxSessions } : {}),
    ...(layer.maxClients !== undefined ? { maxClients: layer.maxClients } : {}),
    ...(layer.allow !== undefined ? { allow: layer.allow } : {}),
    ...(layer.blobs !== undefined ? { blobs: layer.blobs as 'db' | 'disk' } : {}),
    ...(layer.logDir !== undefined ? { logDir: layer.logDir } : {}),
    ...(layer.logLevel !== undefined ? { logLevel: layer.logLevel as 'info' | 'warn' } : {}),
    ...(layer.limits !== undefined ? { limits: layer.limits } : {}),
    ...(layer.publicDir !== undefined ? { publicDir: layer.publicDir } : {}),
  }
  const parsed = ConfigSchema.safeParse(input)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`)
    throw new ConfigError(`invalid settings:\n  ${problems.join('\n  ')}`)
  }
  const config = parsed.data
  if (config.host.length === 0) config.host = [hostname()]
  return config
}

/** The settings as `print-config` shows them: paths and numbers, never a key or its hash. */
export function describeConfig(config: Config): Record<string, unknown> {
  return {
    ...config,
    logDir: config.logDir ?? join(config.dataDir, 'logs'),
    tls:
      config.tls.mode === 'pem'
        ? { mode: 'pem', cert: config.tls.cert, key: '<private key file>' }
        : config.tls,
  }
}
