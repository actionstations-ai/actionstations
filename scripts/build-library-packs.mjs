#!/usr/bin/env node
// Build the catalog-only reference library packs (#325, ADR-0020) from the document cache.
//
//   node scripts/build-library-packs.mjs [--only <pack,…>] [--out <dir>] [--allow-missing]
//                                        [--url <catalog files base>]
//   node scripts/build-library-packs.mjs --core
//
// One ai.actionstations.<domain>-library .aspack per library in packs/documents/manifest.json,
// written to out/library-packs/ with catalog-entries.json for the site. Archives are
// deterministic and each is validated with the app's reader before it is written. A pinned
// document missing from the cache fails the build unless --allow-missing (the README then lists
// it as a link). --core copies the core pack's documents into packs/documents/core/ and
// rewrites the core pack's documents[] in packs/bundled.json.
import { runMain } from './lib/bundle-main.mjs'

await runMain('documents-cli', 'src/main/packs/documents/cli.ts', 'runBuildCli')
