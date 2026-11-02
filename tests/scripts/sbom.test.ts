// scripts/sbom.mjs: CycloneDX SBOM built from `pnpm list --json` output (#551).
import { describe, expect, it } from 'vitest'
import { buildBom, collectComponents, purl, TARGETS } from '../../scripts/sbom.mjs'

const tree = {
  name: 'app',
  version: '1.0.0',
  dependencies: {
    '@scope/a': {
      from: '@scope/a',
      version: '2.0.0',
      path: '/a',
      dependencies: { b: { from: 'b', version: '1.1.0', path: '/b' } },
    },
    b: { from: 'b', version: '1.1.0', path: '/b' },
  },
}

describe('purl', () => {
  it('encodes the scope of a scoped package', () => {
    expect(purl('@scope/a', '2.0.0')).toBe('pkg:npm/%40scope/a@2.0.0')
    expect(purl('b', '1.0.0')).toBe('pkg:npm/b@1.0.0')
  })
})

describe('collectComponents', () => {
  it('lists each name and version once and records who depends on whom', () => {
    const { components, edges, rootRef } = collectComponents(tree)
    expect([...components.keys()]).toEqual(['pkg:npm/%40scope/a@2.0.0', 'pkg:npm/b@1.1.0'])
    expect([...edges.get(rootRef)!].sort()).toEqual(['pkg:npm/%40scope/a@2.0.0', 'pkg:npm/b@1.1.0'])
    expect([...edges.get('pkg:npm/%40scope/a@2.0.0')!]).toEqual(['pkg:npm/b@1.1.0'])
  })

  it('uses the real package name for an aliased dependency', () => {
    const { components } = collectComponents({
      name: 'app',
      version: '1',
      dependencies: { alias: { from: 'real', version: '3.0.0' } },
    })
    expect([...components.keys()]).toEqual(['pkg:npm/real@3.0.0'])
  })
})

describe('buildBom', () => {
  const bom = buildBom(tree, {
    name: 'actionstations',
    timestamp: '2026-01-01T00:00:00.000Z',
    read: (dir) => (dir === '/a' ? { license: 'MIT' } : undefined),
  })

  it('is a CycloneDX 1.5 document naming the application', () => {
    expect(bom.bomFormat).toBe('CycloneDX')
    expect(bom.specVersion).toBe('1.5')
    expect(bom.metadata.component.name).toBe('actionstations')
  })

  it('carries licenses when package.json has one and omits them otherwise', () => {
    expect(bom.components[0]?.licenses).toEqual([{ license: { name: 'MIT' } }])
    expect(bom.components[1]?.licenses).toBeUndefined()
  })

  it('has a dependency entry for the root and every component', () => {
    expect(bom.dependencies).toHaveLength(bom.components.length + 1)
    expect(bom.dependencies[1]).toEqual({
      ref: 'pkg:npm/%40scope/a@2.0.0',
      dependsOn: ['pkg:npm/b@1.1.0'],
    })
  })
})

describe('TARGETS', () => {
  it('names the app and server files by release version', () => {
    expect(TARGETS.map((t) => t.file('0.7.0'))).toEqual([
      'actionstations-0.7.0-sbom.cdx.json',
      'actionstations-relay-0.7.0-sbom.cdx.json',
    ])
  })
})
