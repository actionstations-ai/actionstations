# Financial services

Domain pack for US community financial institutions (about $100 M to $10 B in assets) that run their own branches and outsource core processing: community banks and thrifts under the OCC, the Federal Reserve or the FDIC, and federally insured credit unions under the NCUA, each with a state regulator. Broker-dealers, insurers, payment processors and large complex banks are out of scope.

Facts below were checked on 2026-10-24 against eCFR (point-in-time 2026-10-01) for the research dossier (`docs/research/domains/financial_services.md` in the Action Stations repository). Regulations change; re-check a deadline before an exercise depends on it.

## Plans the exercise should draw on

- **Information security program** with an incident response program (GLBA §501(b); the Interagency Guidelines Establishing Information Security Standards, e.g. 12 CFR 30 App. B and 12 CFR 364 App. B; NCUA 12 CFR 748 App. A).
- **Customer notice procedures** (Supplement A to App. B, the Interagency Guidance on Response Programs; NCUA 748 App. B).
- **Computer-security incident notification procedure** for the 36-hour (banks) or 72-hour (credit unions) regulator notice.
- **Business continuity management program**, BCP / DR plan and BIA (FFIEC _Business Continuity Management_ booklet, 2019; NCUA 12 CFR 749).
- **Bank Protection Act security program** (12 CFR 326 Subpart A, 12 CFR 21 Subpart A, 12 CFR 208.61, 12 CFR 748.0), with a designated security officer.
- **BSA/AML program, SAR procedures and OFAC compliance** (31 CFR 1020.320 and the regulators' SAR rules).
- **Third-party risk management program** (Interagency Guidance on Third-Party Relationships, 2023).
- **Authentication and access controls** (FFIEC guidance, 2021) and **Regulation E error resolution**.

## Reporting deadlines

- **Bank → primary federal regulator (12 CFR 53.3, 225.302, 304.23)**: "as soon as possible and no later than 36 hours after the banking organization determines that a notification incident has occurred". Verified against eCFR.
- **Credit union → NCUA (12 CFR 748.1(c))**: "as soon as possible but no later than 72 hours" after reasonably believing a reportable cyber incident occurred, or within 72 hours of a third party's notice, whichever is sooner. Verified against eCFR.
- **Bank service provider → bank (12 CFR 53.4)**: "as soon as possible" once an incident has disrupted or is reasonably likely to disrupt covered services for four or more hours. Verified.
- **GLBA customer notice (Supplement A)**: the primary regulator "as soon as possible" for unauthorized access to sensitive customer information; affected customers "as soon as possible" when misuse has occurred or is reasonably possible, unless law enforcement asks in writing for a delay. Verified.
- **SAR (31 CFR 1020.320)**: no later than 30 calendar days after initial detection, up to 60 when no suspect is identified; telephone law enforcement immediately for ongoing violations. Verified.
- **Regulation E (12 CFR 1005.11)**: investigate within 10 business days, or up to 45 days with provisional credit within 10 business days. Verified.
- **NCUA catastrophic act report (12 CFR 748.1(b))**: within 5 business days of a disaster that interrupts vital member services for more than 2 consecutive business days.
- **SEC Form 8-K Item 1.05**: four business days after the materiality determination, for a listed holding company.
- **CIRCIA**: 72 hours for a covered cyber incident and 24 hours after a ransom payment once the final rule takes effect; it was not in force as of 2026-10-24.
- **State regulator and state breach statutes**: vary by state.

## Copyrighted references (named, not bundled)

- PCI DSS v4.0.1, PCI Security Standards Council: https://www.pcisecuritystandards.org/document_library/
- Nacha Operating Rules and the Nacha _Cybersecurity Tabletop Exercise Leader's Guide_: https://www.nacha.org/resources/cybersecurity-tabletop-exercise-leaders-guide
- SIFMA cyber and operational resilience tabletop exercises: https://www.sifma.org/resources/general/cyber-and-operational-resilience-table-top-exercises/
- FS-ISAC resources (membership): https://www.fsisac.com/
- Sheltered Harbor data vaulting standard (members only): https://shelteredharbor.org/
