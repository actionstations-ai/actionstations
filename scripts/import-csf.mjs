#!/usr/bin/env node
// Converts the NIST CSF 2.0 reference data into the bundled framework catalog (#426):
//
//   node scripts/import-csf.mjs <cprt-export.json> [--out packs/frameworks/nist_csf_2.json]
//
// The input is the CSF 2.0 JSON export of the NIST Cybersecurity and Privacy Reference Tool
// (https://csrc.nist.gov/projects/cprt), for example
// https://csrc.nist.gov/extensions/nudp/services/json/nudp/framework/version/csf_2_0_0/export/json?element=all
// The output is committed. Run this once per CSF revision, never at app runtime; the mapping
// rules below are part of the script, so a re-run reproduces the committed file exactly.
// CSF 2.0 is a work of the US Government (public domain in the US).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VERIFIED_ON = '2026-10-28'

/** Purpose-tag, trigger and keyword rules (spec 0426 §5). Every id must exist in CSF 2.0. */
const RULES = [
  {
    controls: ['RS.MA-01', 'RS.MA-03', 'RS.MA-04', 'RS.CO-02', 'RS.CO-03'],
    purposeTags: ['DECISION_POINT'],
    threatFamilies: ['cyber', 'cyber_physical', 'insider'],
  },
  { controls: ['DE.AE-02', 'DE.AE-03', 'DE.CM-01'], purposeTags: ['CLUE'] },
  { controls: ['RS.AN-03', 'DE.AE-06'], purposeTags: ['CLUE'], threatFamilies: ['cyber'] },
  { controls: ['RS.CO-02', 'RS.CO-03'], purposeTags: ['MISINFORMATION', 'PRESSURE'] },
  { controls: ['RS.CO-02'], triggers: ['*:*'] },
  {
    controls: ['RC.RP-01', 'RC.RP-02', 'RC.RP-03'],
    purposeTags: ['TECH_HURDLE'],
    keywords: ['restore', 'backup', 'recovery', 'failover', 'rebuild'],
  },
  {
    controls: ['RC.RP-01', 'RC.RP-03', 'RC.RP-05'],
    keywords: ['restore', 'backup', 'recovery', 'rebuild'],
  },
  { controls: ['RC.CO-03', 'RC.CO-04'], purposeTags: ['END_GAME'] },
  { controls: ['RS.MA-02', 'RS.MA-03'], purposeTags: ['CORE_NARRATIVE'], keywords: ['triage'] },
  {
    controls: ['RS.MI-01', 'RS.MI-02'],
    keywords: ['contain', 'containment', 'isolate', 'quarantine', 'disconnect', 'eradicate'],
  },
  {
    controls: ['RS.AN-03', 'RS.AN-06', 'RS.AN-07'],
    keywords: ['forensic', 'forensics', 'evidence'],
  },
  {
    controls: ['GV.SC-07', 'GV.SC-08'],
    keywords: ['vendor', 'supplier', 'third party', 'third-party', 'contractor', 'managed service'],
  },
  { controls: ['PR.AT-01'], keywords: ['phishing', 'training', 'awareness'] },
  { controls: ['ID.RA-01', 'PR.PS-02'], keywords: ['patch', 'vulnerability', 'unpatched'] },
  {
    controls: ['PR.AA-01', 'PR.AA-03', 'PR.AA-05'],
    keywords: ['access', 'credential', 'credentials', 'password', 'mfa', 'account'],
  },
  { controls: ['PR.DS-11'], keywords: ['backup', 'backups'] },
  { controls: ['DE.CM-01', 'DE.CM-09'], keywords: ['malware', 'ransomware', 'beacon'] },
  { controls: ['DE.CM-02'], keywords: ['badge', 'door', 'camera', 'cctv', 'intrusion'] },
  { controls: ['GV.RR-01', 'GV.OV-01'], keywords: ['executive', 'board', 'leadership'] },
  { controls: ['ID.IM-02', 'ID.IM-04'], purposeTags: ['ENDEX'] },
]

function load(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const elements = data?.response?.elements
  if (!elements?.elements || !elements?.relationships)
    throw new Error('Not a CPRT export: expected response.elements.{elements,relationships}')
  return elements
}

/** Elements CSF 2.0 withdrew: each has a projection to a "WR-<id>" withdraw reason. */
function withdrawn(relationships) {
  return new Set(
    relationships
      .filter((r) => r.dest_element_identifier === `WR-${r.source_element_identifier}`)
      .map((r) => r.source_element_identifier),
  )
}

function controlsOf({ elements, relationships }) {
  const gone = withdrawn(relationships)
  const keep = (e) =>
    ['function', 'category', 'subcategory'].includes(e.element_type) &&
    !gone.has(e.element_identifier)
  const parentOf = (id) =>
    id.includes('-') ? id.split('-')[0] : id.includes('.') ? id.split('.')[0] : undefined
  return elements.filter(keep).map((e) => {
    const id = e.element_identifier
    const parent = parentOf(id)
    const title = e.element_type === 'subcategory' ? e.text : titleCase(e.title)
    const summary = e.element_type === 'subcategory' ? '' : e.text
    return { id, ...(parent ? { parent } : {}), title: title.trim(), summary: summary.trim() }
  })
}

const titleCase = (s) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s)

const order = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

async function main() {
  const args = process.argv.slice(2)
  if (!args[0]) {
    console.error('Usage: node scripts/import-csf.mjs <cprt-export.json> [--out <file>]')
    return 1
  }
  const at = args.indexOf('--out')
  const out = resolve(at >= 0 ? args[at + 1] : join(root, 'packs', 'frameworks', 'nist_csf_2.json'))
  const controls = controlsOf(load(resolve(args[0])))
  const fnOrder = ['GV', 'ID', 'PR', 'DE', 'RS', 'RC']
  const rank = (id) => fnOrder.indexOf(id.slice(0, 2))
  controls.sort((a, b) => rank(a.id) - rank(b.id) || order(a, b))
  const ids = new Set(controls.map((c) => c.id))
  for (const r of RULES)
    for (const c of r.controls) if (!ids.has(c)) throw new Error(`Rule names unknown control ${c}`)
  const framework = {
    id: 'nist_csf_2',
    label: 'NIST Cybersecurity Framework 2.0',
    shortLabel: 'NIST CSF 2.0',
    version: '2.0',
    publisher: 'National Institute of Standards and Technology',
    license: 'LicenseRef-US-Government-Work',
    sources: [
      {
        title: 'NIST CSWP 29, The NIST Cybersecurity Framework (CSF) 2.0',
        url: 'https://doi.org/10.6028/NIST.CSWP.29',
      },
      {
        title: 'NIST Cybersecurity and Privacy Reference Tool (CPRT)',
        url: 'https://csrc.nist.gov/projects/cprt',
      },
    ],
    verifiedOn: VERIFIED_ON,
    levels: ['Function', 'Category', 'Subcategory'],
    controls,
    rules: RULES,
  }
  // Written in the repo's Prettier style, so `pnpm format:check` passes on the committed file.
  const prettier = await import('prettier')
  const options = (await prettier.resolveConfig(out)) ?? {}
  writeFileSync(
    out,
    await prettier.format(JSON.stringify(framework), { ...options, filepath: out }),
  )
  const depth = (c) => (c.id.includes('-') ? 2 : c.id.includes('.') ? 1 : 0)
  const counts = [0, 1, 2].map((d) => controls.filter((c) => depth(c) === d).length)
  console.log(
    `Wrote ${out}: ${counts[0]} functions, ${counts[1]} categories, ${counts[2]} subcategories`,
  )
  return 0
}

process.exit(await main())
