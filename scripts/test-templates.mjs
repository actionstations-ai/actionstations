#!/usr/bin/env node
// Golden snapshot tests for inject templates (ADR-0008). The renderer harness lands with
// #30; until then this verifies there is nothing to test instead of silently passing.
import { readdirSync, existsSync } from 'node:fs'
const dir = new URL('../templates/injects/', import.meta.url)
const types = existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())
  : []
if (types.length > 0) {
  console.error(`Found ${types.length} templates but no golden harness yet (#30).`)
  process.exit(1)
}
console.log('No inject templates yet; nothing to snapshot.')
