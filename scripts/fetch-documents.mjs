#!/usr/bin/env node
// Download the reference documents pinned in packs/documents/manifest.json (#325, ADR-0020)
// into the gitignored cache .cache/documents/<slug>/<file>.
//
//   node scripts/fetch-documents.mjs [--only <slug,…>] [--pin] [--repin <slug,…>] [--offline]
//                                    [--cache <dir>] [--concurrency <n>]
//
// Browser-like headers (fema.gov also needs `Range: bytes=0-`). A file whose sha256 differs
// from the manifest is refused and not written. Files that cannot be fetched (ffiec.gov serves
// a CAPTCHA) are listed with their URL and target path: download them in a browser and save
// them there, or drop them in .cache/documents/inbox/ under any name. `--pin` records the hash
// of documents that have none yet; `--repin <slug>` accepts a new edition. sec.gov wants a
// declared User-Agent: set DOCUMENTS_CONTACT=<your email> to send one.
import { runMain } from './lib/bundle-main.mjs'

await runMain('documents-cli', 'src/main/packs/documents/cli.ts', 'runFetchCli')
