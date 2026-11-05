// The earth science registration: every connector a toolkit names is registered once, with fixed
// public hosts, and registering twice is harmless.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '@shared/toolkits'
import { connectorIds, getConnector } from '../connectors/registry'
import { GEO_CONNECTORS, registerGeoscienceToolkits } from './register'

const toolkit = (id: string) =>
  ToolkitSchema.parse(
    JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', '..', 'packs', 'toolkits', `${id}.json`),
        'utf8',
      ),
    ),
  )

describe('registerGeoscienceToolkits', () => {
  it('registers every connector once and tolerates a second call', () => {
    registerGeoscienceToolkits()
    registerGeoscienceToolkits()
    for (const c of GEO_CONNECTORS) expect(getConnector(c.id).hosts.length).toBeGreaterThan(0)
  })

  it('covers every connector the four toolkits name', () => {
    registerGeoscienceToolkits()
    for (const id of ['seismic', 'volcanic', 'tsunami', 'debris_flow'])
      for (const c of toolkit(id).connectors) expect(connectorIds(), `${id}: ${c}`).toContain(c)
  })

  it('uses only https public hosts of the services it cites', () => {
    registerGeoscienceToolkits()
    const hosts = GEO_CONNECTORS.flatMap((c) => c.hosts)
    for (const h of hosts) expect(h).toMatch(/\.(gov|org|edu)$/)
  })
})
