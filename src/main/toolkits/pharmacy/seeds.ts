// Historical seeds (spec 0463 FR-7): dated, attributed events a scenario can start from, with
// what was verified and what was not. The generator is told these are history, so it keeps to the
// stated facts and does not invent narrative details as fact. Facts come from the research
// dossier (docs/research/domains/pharmacy.md, section 8), each with its source and the date it was
// checked.
export interface SeedFact {
  fact: string
  source: string
}

export interface PharmacySeed {
  id: string
  title: string
  /** Threat family the seed fits. */
  family: string
  /** When it happened, as precisely as the sources state it. */
  when: string
  facts: SeedFact[]
  /** What the sources did not establish; never written as fact. */
  unverified: string[]
  /** The exercise built on it: fictional organization, real event as background. */
  exerciseIdea: string
  checkedOn: string
}

export const PHARMACY_SEEDS: readonly PharmacySeed[] = [
  {
    id: 'iv-fluid-shortage-2024',
    title: 'IV fluid shortage after Hurricane Helene',
    family: 'drug_shortage',
    when: 'October to November 2024',
    facts: [
      {
        fact: 'Flooding damaged the Baxter plant at North Cove, North Carolina, reported to supply about 60 percent of U.S. IV and dialysis solutions.',
        source: 'Trade and public-health reports, 2024',
      },
      {
        fact: 'Hospitals received allocations; one state health department reported 40 to 50 percent for some products.',
        source: 'State health department statement reported in 2024',
      },
      {
        fact: 'FDA and HHS approved temporary imports of IV and peritoneal fluids from five Baxter facilities abroad (23 products assessed).',
        source: 'FDA and HHS actions, October 2024',
      },
      { fact: 'ASHP wrote to HHS, ASPR and FDA on October 8, 2024.', source: 'ASHP letter' },
      {
        fact: 'Production lines restarted in November 2024; shortages were expected to extend into early 2025.',
        source: 'Trade reports, 2024',
      },
    ],
    unverified: [
      'The 2017 Hurricane Maria episode in detail',
      'Any hospital-level numbers beyond the quoted state figures',
    ],
    exerciseIdea:
      'A fictional community hospital faces a single-plant shortage with allocations, an import and substitutions.',
    checkedOn: '2026-11-04',
  },
  {
    id: 'claims-outage-2024',
    title: 'Claims processing outage after a cyberattack on a clearinghouse',
    family: 'pharmacy_outage',
    when: 'From February 21, 2024',
    facts: [
      {
        fact: 'The attack was discovered on February 21, 2024.',
        source: 'Press reports; HHS OCR FAQ',
      },
      {
        fact: 'The company processes claims and pharmacy requests for more than 340,000 physicians and 60,000 pharmacies.',
        source: 'Press reports, 2024',
      },
      {
        fact: 'Pharmacies reported being unable to process prescriptions and chose between switching networks, accepting cash or processing claims manually; payments were delayed.',
        source: 'Press reports, 2024',
      },
    ],
    unverified: ['Duration at any single pharmacy', 'Patient outcomes'],
    exerciseIdea:
      'A fictional independent pharmacy loses its claims switch on a Monday morning with patients at the counter.',
    checkedOn: '2026-11-04',
  },
  {
    id: 'oncology-injectables-record',
    title: 'A carboplatin injection shortage record',
    family: 'drug_shortage',
    when: 'Record posted April 2023',
    facts: [
      {
        fact: 'The openFDA shortage record for one carboplatin injection lists it as Limited Availability, initial posting April 2023, with an estimated recovery of December 2028 in its related information.',
        source: 'openFDA drug shortages endpoint, read 2026-11-04',
      },
    ],
    unverified: ['The wider 2023 oncology shortage narrative'],
    exerciseIdea: 'A fictional cancer center allocates a short oncology injectable across clinics.',
    checkedOn: '2026-11-04',
  },
  {
    id: 'diversion-composite',
    title: 'Controlled substance diversion (composite)',
    family: 'controlled_substance_diversion',
    when: 'Composite, no single event',
    facts: [
      {
        fact: 'A registrant must notify the DEA Field Division in writing within one business day of discovering a theft or loss and file DEA Form 106 electronically within 45 days of discovery.',
        source: '21 CFR 1301.76(b), eCFR, read 2026-11-04',
      },
      {
        fact: 'Factors for judging significance include quantity in relation to the type of business, the specific substances, links to specific individuals, patterns over time, diversion likelihood and local trends.',
        source: '21 CFR 1301.76(b)',
      },
    ],
    unverified: ['No real case was verified; this seed is built on the regulation, not on a case'],
    exerciseIdea:
      'A fictional hospital pharmacy sees one user stand out in cabinet data, with an innocent explanation for part of the pattern.',
    checkedOn: '2026-11-04',
  },
]

export const seedById = (id: string): PharmacySeed | undefined =>
  PHARMACY_SEEDS.find((s) => s.id === id)

/** The block of text a generator is given for a seed: history, with its facts and its limits. */
export function seedPromptBlock(seed: PharmacySeed): string {
  return [
    `Historical seed: ${seed.title} (${seed.when}). This is history; keep to these facts and do not invent narrative details as fact.`,
    ...seed.facts.map((f) => `- ${f.fact} [${f.source}]`),
    `Not established: ${seed.unverified.join('; ')}.`,
    `Exercise: ${seed.exerciseIdea} The exercising organization and its people are fictional.`,
  ].join('\n')
}
