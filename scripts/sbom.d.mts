// Types for scripts/sbom.mjs (imported by tests/scripts/sbom.test.ts).
export interface ListNode {
  from?: string
  version: string
  path?: string
  dependencies?: Record<string, ListNode>
}
export interface ListRoot {
  name: string
  version: string
  dependencies?: Record<string, ListNode>
}
export interface Bom {
  bomFormat: string
  specVersion: string
  metadata: { component: { name: string; version: string } }
  components: {
    name: string
    version: string
    purl: string
    licenses?: { license: { name: string } }[]
  }[]
  dependencies: { ref: string; dependsOn: string[] }[]
}
export declare function purl(name: string, version: string): string
export declare function collectComponents(listRoot: ListRoot): {
  rootRef: string
  components: Map<string, { name: string; version: string; path?: string }>
  edges: Map<string, Set<string>>
}
export declare function buildBom(
  listRoot: ListRoot,
  opts?: {
    name?: string
    timestamp?: string
    read?: (dir?: string) => { license?: unknown } | undefined
  },
): Bom
export declare const TARGETS: { file: (v: string) => string; filter?: string; name: string }[]
