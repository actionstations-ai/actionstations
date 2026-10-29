import { describe, expect, it } from 'vitest'
import {
  ConfigError,
  defaultDataDir,
  describeConfig,
  layerFromEnv,
  layerFromFlags,
  layerFromToml,
  mergeLayers,
  resolveConfig,
  tlsFromText,
} from '../src/config'

const base = { dataDir: '/tmp/x', tls: 'self-signed' }

describe('config: layers and precedence', () => {
  it('reads the TOML file, the environment and the flags, later layers winning', () => {
    const file = layerFromToml(
      `port = 9000\nhost = ["a.internal"]\nretention-hours = 48\n[limits]\nblob-bytes = 2097152\n`,
    )
    expect(file).toEqual({
      port: 9000,
      host: ['a.internal'],
      retentionHours: 48,
      limits: { blobBytes: 2_097_152 },
    })
    const env = layerFromEnv({
      AS_RELAY_PORT: '9100',
      AS_RELAY_ALLOW: '10.0.0.0/8, fd00::/8',
      AS_RELAY_LIMIT_STORED_ENVELOPES: '500',
    })
    expect(env).toEqual({
      port: 9100,
      allow: ['10.0.0.0/8', 'fd00::/8'],
      limits: { storedEnvelopes: 500 },
    })
    const flags = layerFromFlags({ port: '9200', 'max-clients': '10', tls: 'self-signed' })
    const config = resolveConfig(mergeLayers(file, env, flags, { dataDir: '/tmp/x' }), {})
    expect(config.port).toBe(9200)
    expect(config.host).toEqual(['a.internal'])
    expect(config.retentionHours).toBe(48)
    expect(config.maxClients).toBe(10)
    expect(config.allow).toEqual(['10.0.0.0/8', 'fd00::/8'])
    // Lists and the limits table replace rather than merge.
    expect(config.limits).toEqual({ storedEnvelopes: 500 })
  })

  it('fills in defaults and the host name', () => {
    const config = resolveConfig(base, {})
    expect(config).toMatchObject({
      port: 8485,
      bind: '0.0.0.0',
      retentionHours: 72,
      maxSessions: 20,
      maxClients: 60,
      blobs: 'db',
      logLevel: 'info',
    })
    expect(config.host.length).toBe(1)
    expect(config.tls).toEqual({ mode: 'self-signed' })
  })

  it('parses the TLS setting and requires one', () => {
    expect(tlsFromText('self-signed', undefined)).toEqual({ mode: 'self-signed' })
    expect(tlsFromText('cert.pem, key.pem', undefined)).toEqual({
      mode: 'pem',
      cert: 'cert.pem',
      key: 'key.pem',
    })
    expect(tlsFromText(undefined, true)).toEqual({ mode: 'none' })
    expect(() => tlsFromText('cert.pem', undefined)).toThrow(ConfigError)
    expect(() => resolveConfig({ dataDir: '/tmp/x' }, {})).toThrow(/no TLS setting/)
  })

  it('refuses retention above 72 hours, bad CIDRs, unknown values and limits past their ceilings', () => {
    expect(() => resolveConfig({ ...base, retentionHours: 73 }, {})).toThrow(/retentionHours/)
    expect(() => resolveConfig({ ...base, allow: ['10.0.0.0/33'] }, {})).toThrow(/allow/)
    expect(() => resolveConfig({ ...base, blobs: 'tape' }, {})).toThrow(/blobs/)
    expect(() => resolveConfig({ ...base, logLevel: 'debug' }, {})).toThrow(/logLevel/)
    expect(() => resolveConfig({ ...base, limits: { blobBytes: 2 * 1024 ** 3 } }, {})).toThrow(
      /blobBytes/,
    )
    expect(() => resolveConfig({ ...base, port: 70000 }, {})).toThrow(/port/)
    expect(() => layerFromToml('nonsense = = 1')).toThrow(/valid TOML/)
    expect(() => layerFromToml('colour = "blue"')).toThrow(/unknown setting "colour"/)
    expect(() => layerFromToml('port = "many"')).toThrow(/port must be a number/)
  })

  it('describes the settings without the private key path', () => {
    const config = resolveConfig({ dataDir: '/tmp/x', tls: 'cert.pem,secret.pem' }, {})
    const shown = describeConfig(config)
    expect(shown.tls).toEqual({ mode: 'pem', cert: 'cert.pem', key: '<private key file>' })
    expect(shown.logDir).toBe('/tmp/x/logs')
    expect(JSON.stringify(shown)).not.toContain('secret.pem')
  })

  it('picks the data directory per platform unless told otherwise', () => {
    expect(defaultDataDir({ AS_RELAY_DATA_DIR: '/srv/relay' }, 'linux')).toBe('/srv/relay')
    expect(defaultDataDir({ ProgramData: 'C:\\ProgramData' }, 'win32')).toBe(
      'C:\\ProgramData\\ActionStationsRelay',
    )
    expect(defaultDataDir({ XDG_STATE_HOME: '/var/state' }, 'linux')).toBe(
      '/var/state/actionstations-relay',
    )
  })
})
